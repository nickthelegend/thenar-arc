// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ThenarProtocol} from "../src/ThenarProtocol.sol";
import {ThenarVerdicts} from "../src/ThenarVerdicts.sol";
import {MockIdentityRegistry, MockReputationRegistry} from "./mocks/MockERC8004.sol";
import {ThenarBase} from "./utils/ThenarBase.sol";

/// A verdict writer that burns every unit of gas it is given.
contract GasGuzzlingVerdicts {
    function recordVerdict(uint256, uint256, address, bytes32, uint16, uint256) external pure {
        while (true) {}
    }
}

/**
 * ThenarVerdicts: every run ThenarProtocol pays is written to the verifier's
 * ERC-8004 record, and nothing that happens there can touch a payout.
 * (The real Identity and Reputation Registries run in test/fork.)
 */
contract ThenarVerdictsTest is ThenarBase {
    MockIdentityRegistry internal identity;
    MockReputationRegistry internal reputation;
    ThenarVerdicts internal verdicts;
    address internal deployer = makeAddr("deployer");
    uint256 internal agentId;

    function setUp() public {
        vm.warp(1_800_000_000);
        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry(identity);
        vm.prank(deployer);
        verdicts = new ThenarVerdicts(address(identity), address(reputation));
        _deploy(address(verdicts));
        vm.prank(deployer);
        verdicts.setProtocol(address(thenar));

        // The verifier registers itself as an ERC-8004 agent; its wallet defaults to the registrant.
        vm.prank(verifier);
        agentId = identity.register("https://thenar.example/agents/verifier.json");
    }

    function _bind() internal {
        vm.prank(stranger); // permissionless
        verdicts.bindVerifier(agentId);
    }

    // ------------------------------------------------------------ admin

    function test_constructor_refusesZeroRegistries() public {
        vm.expectRevert(ThenarVerdicts.ZeroAddress.selector);
        new ThenarVerdicts(address(0), address(reputation));
        vm.expectRevert(ThenarVerdicts.ZeroAddress.selector);
        new ThenarVerdicts(address(identity), address(0));
    }

    function test_setProtocol_onlyOnce_onlyByTheDeployer() public {
        assertEq(verdicts.protocol(), address(thenar));
        assertEq(verdicts.deployer(), deployer);

        vm.prank(deployer);
        vm.expectRevert(ThenarVerdicts.AlreadySet.selector);
        verdicts.setProtocol(stranger);

        ThenarVerdicts fresh = new ThenarVerdicts(address(identity), address(reputation));
        vm.prank(stranger);
        vm.expectRevert(ThenarVerdicts.NotDeployer.selector);
        fresh.setProtocol(stranger);
        vm.expectRevert(ThenarVerdicts.ZeroAddress.selector);
        fresh.setProtocol(address(0));
        vm.expectEmit(address(fresh));
        emit ThenarVerdicts.ProtocolSet(address(thenar));
        fresh.setProtocol(address(thenar));
        assertEq(fresh.protocol(), address(thenar));
    }

    // ------------------------------------------------------------ binding

    function test_bindVerifier_acceptsTheVerifiersOwnAgent() public {
        (bool bound,) = verdicts.verifierAgent();
        assertFalse(bound);
        vm.expectEmit(address(verdicts));
        emit ThenarVerdicts.VerifierBound(agentId, verifier);
        _bind();
        (bool b2, uint256 id) = verdicts.verifierAgent();
        assertTrue(b2);
        assertEq(id, agentId);
    }

    function test_bindVerifier_acceptsAnAgentWhoseWalletIsTheVerifier() public {
        address operatorCo = makeAddr("operator company");
        vm.prank(operatorCo);
        uint256 id = identity.register("ipfs://company-agent");
        vm.prank(operatorCo);
        identity.setAgentWallet(id, verifier);
        verdicts.bindVerifier(id);
        (, uint256 bound) = verdicts.verifierAgent();
        assertEq(bound, id);
    }

    function test_bindVerifier_refusesAnAgentTheVerifierDoesNotControl() public {
        vm.prank(stranger);
        uint256 id = identity.register("ipfs://impostor");
        vm.expectRevert(abi.encodeWithSelector(ThenarVerdicts.NotVerifierAgent.selector, id));
        verdicts.bindVerifier(id);

        // A transferred agent loses its wallet, and its new owner isn't the verifier either.
        vm.prank(verifier);
        identity.transfer(agentId, stranger);
        vm.expectRevert(abi.encodeWithSelector(ThenarVerdicts.NotVerifierAgent.selector, agentId));
        verdicts.bindVerifier(agentId);

        // An agent that was never minted.
        vm.expectRevert();
        verdicts.bindVerifier(999);
        (bool bound,) = verdicts.verifierAgent();
        assertFalse(bound);
    }

    function test_bindVerifier_refusesAnAgentThatWouldMakeFeedbackSelfFeedback() public {
        vm.prank(verifier);
        identity.approveOperator(agentId, address(verdicts));
        vm.expectRevert(abi.encodeWithSelector(ThenarVerdicts.SelfAuthorized.selector, agentId));
        verdicts.bindVerifier(agentId);
    }

    // ------------------------------------------------------------ verdicts

    function test_boundVerifier_paidRunWritesFeedback() public {
        _bind();
        uint256 id = _task(4, REWARD * 4);
        bytes32 h = keccak256("verdict run");

        vm.expectEmit(address(verdicts));
        emit ThenarVerdicts.VerdictRecorded(0, id, alice, h, 8_750, 350_000, true);
        _run(id, alice, h, 8_750);

        assertEq(usdc.balanceOf(alice), 350_000, "paid");
        assertEq(reputation.getLastIndex(agentId, address(verdicts)), 1);
        (int128 value, uint8 decimals, string memory tag1, string memory tag2, bool revoked) =
            reputation.readFeedback(agentId, address(verdicts), 1);
        assertEq(value, 8_750, "the score, as 87.50");
        assertEq(decimals, 2);
        assertEq(tag1, "runVerdict");
        assertEq(tag2, "thenar");
        assertFalse(revoked);
        assertEq(reputation.hashOf(agentId, address(verdicts), 1), h, "feedbackHash is the run id");

        _run(id, bob, keccak256("second"), 6_250);
        assertEq(reputation.getLastIndex(agentId, address(verdicts)), 2);
        assertEq(verdicts.verdicts(), 2);
        assertEq(verdicts.written(), 2);
        assertEq(verdicts.scoreSum(), 15_000);
        assertEq(verdicts.meanScore(), 7_500);
    }

    function test_unboundVerifier_countsTheVerdictButWritesNoFeedback() public {
        assertEq(verdicts.meanScore(), 0);
        uint256 id = _task(4, REWARD * 4);
        bytes32 h = keccak256("unbound");
        vm.expectEmit(address(verdicts));
        emit ThenarVerdicts.VerdictRecorded(0, id, alice, h, 9_000, 360_000, false);
        _run(id, alice, h, 9_000);
        assertEq(usdc.balanceOf(alice), 360_000);
        assertEq(reputation.getLastIndex(agentId, address(verdicts)), 0);
        assertEq(verdicts.verdicts(), 1);
        assertEq(verdicts.written(), 0);
        assertEq(verdicts.meanScore(), 9_000);
    }

    function test_brokenRegistry_neverReachesThePayout() public {
        _bind();
        reputation.setBroken(true);
        uint256 id = _task(4, REWARD * 4);
        bytes32 h = keccak256("registry down");

        vm.expectEmit(address(verdicts));
        emit ThenarVerdicts.FeedbackFailed(0, abi.encodeWithSignature("Error(string)", "registry down"));
        vm.expectEmit(address(verdicts));
        emit ThenarVerdicts.VerdictRecorded(0, id, alice, h, 9_000, 360_000, false);
        _run(id, alice, h, 9_000);

        assertEq(usdc.balanceOf(alice), 360_000, "paid all the same");
        assertEq(verdicts.verdicts(), 1);
        assertEq(verdicts.written(), 0);

        // Once the registry is back, the next run is written.
        reputation.setBroken(false);
        _run(id, bob, keccak256("registry back"), 9_000);
        assertEq(verdicts.written(), 1);
        assertEq(reputation.getLastIndex(agentId, address(verdicts)), 1);
    }

    function test_onlyTheProtocolRecordsVerdicts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ThenarVerdicts.NotProtocol.selector, stranger));
        verdicts.recordVerdict(0, 0, alice, keccak256("fake"), 10_000, 1e6);
        vm.prank(verifier);
        vm.expectRevert(abi.encodeWithSelector(ThenarVerdicts.NotProtocol.selector, verifier));
        verdicts.recordVerdict(0, 0, alice, keccak256("fake"), 10_000, 1e6);
        assertEq(verdicts.verdicts(), 0);
    }

    function test_aVerdictWriterThatRevertsIsReported_notFatal() public {
        // Wired to a ThenarVerdicts that was never pointed at this protocol: every call reverts.
        ThenarVerdicts unwired = new ThenarVerdicts(address(identity), address(reputation));
        ThenarProtocol p =
            new ThenarProtocol(verifier, treasury, address(registry), address(usdc), address(unwired), MAX_ESCROW);
        vm.startPrank(funder);
        usdc.approve(address(p), REWARD);
        uint256 id = p.createTask("T", 1, REWARD, 1, 1, REWARD);
        vm.stopPrank();
        bytes32 h = keccak256("unwired");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, p.runDigest(id, alice, h, CID, 10_000));

        vm.expectEmit(address(p));
        emit ThenarProtocol.VerdictNotRecorded(
            0, abi.encodeWithSelector(ThenarVerdicts.NotProtocol.selector, address(p))
        );
        vm.prank(alice);
        p.submitTrajectory(id, h, CID, 10_000, abi.encodePacked(r, s, v));
        assertEq(usdc.balanceOf(alice), REWARD);
    }

    function test_aVerdictWriterThatBurnsAllGasCannotTakeThePayoutWithIt() public {
        GasGuzzlingVerdicts guzzler = new GasGuzzlingVerdicts();
        ThenarProtocol p =
            new ThenarProtocol(verifier, treasury, address(registry), address(usdc), address(guzzler), MAX_ESCROW);
        vm.startPrank(funder);
        usdc.approve(address(p), REWARD);
        uint256 id = p.createTask("T", 1, REWARD, 1, 1, REWARD);
        vm.stopPrank();
        bytes32 h = keccak256("guzzled");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, p.runDigest(id, alice, h, CID, 10_000));

        vm.prank(alice);
        uint256 g = gasleft();
        p.submitTrajectory{gas: 2_000_000}(id, h, CID, 10_000, abi.encodePacked(r, s, v));
        assertLt(g - gasleft(), 2_000_000);
        assertEq(usdc.balanceOf(alice), REWARD, "paid; the writer got at most VERDICT_GAS");
    }

    function test_aCallerCannotStarveTheVerdictOfGas() public {
        _bind();
        uint256 id = _task(4, REWARD * 4);
        bytes32 h = keccak256("starved");
        bytes memory sig = _sign(id, alice, h, 9_000);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.InsufficientGasForVerdict.selector);
        thenar.submitTrajectory{gas: 500_000}(id, h, CID, 9_000, sig);
        assertEq(usdc.balanceOf(alice), 0, "no payout without the record");
        assertEq(verdicts.written(), 0);

        vm.prank(alice);
        thenar.submitTrajectory{gas: 2_000_000}(id, h, CID, 9_000, sig);
        assertEq(verdicts.written(), 1, "with enough gas the verdict is written");
    }
}
