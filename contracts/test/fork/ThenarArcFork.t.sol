// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Vm} from "forge-std/Vm.sol";

import {ThenarProtocol} from "../../src/ThenarProtocol.sol";
import {ThenarVerdicts} from "../../src/ThenarVerdicts.sol";
import {PasskeyRegistry} from "../../src/PasskeyRegistry.sol";
import {IIdentityRegistry8004} from "../../src/interfaces/IIdentityRegistry8004.sol";
import {IReputationRegistry8004} from "../../src/interfaces/IReputationRegistry8004.sol";
import {ITokenMessengerV2} from "../../src/interfaces/ITokenMessengerV2.sol";
import {ArcForkBase, IFiatToken, IERC20Like} from "./ArcForkBase.sol";

interface IMemo {
    event Memo(
        address indexed sender,
        address indexed target,
        bytes32 callDataHash,
        bytes32 indexed memoId,
        bytes memo,
        uint256 memoIndex
    );

    function memo(address target, bytes calldata data, bytes32 memoId, bytes calldata memoData) external;
}

/**
 * Thenar end to end on a fork of Arc testnet, against Circle's, Arc's and the
 * ERC-8004 deployment's live contracts. Nothing here is mocked:
 *
 *  - Circle USDC (0x3600…, "USDC"/"2"): a bounty escrowed and paid per run, and
 *    a bounty funded by one EIP-3009 signature relayed by somebody else;
 *  - Circle's blocklist: a payout to a blocklisted operator lands in `claimable`;
 *  - Arc's P-256 precompile (0x0100): a passkey-authorised run;
 *  - ERC-8004 Identity + Reputation: the verifier's agent, a verdict written per
 *    paid run, and a buyer's corpusQuality rating beside it;
 *  - Arc Memo (0x5294…e505): a run submitted through Memo, tagged with the run id,
 *    the protocol still seeing the operator (CallFrom);
 *  - Circle CCTP V2: an operator moves earnings to Base Sepolia.
 */
contract ThenarArcForkTest is ArcForkBase {
    IIdentityRegistry8004 internal identity = IIdentityRegistry8004(IDENTITY);
    IReputationRegistry8004 internal reputation = IReputationRegistry8004(REPUTATION);
    IFiatToken internal fiat = IFiatToken(USDC);

    address internal operator = makeAddr("arm operator");
    address internal relayer = makeAddr("relayer");

    function setUp() public override {
        super.setUp();
        _deployThenar();
    }

    function _bindVerifierAgent() internal returns (uint256 agentId) {
        vm.prank(verifier);
        agentId = identity.register("https://thenar.example/agents/verifier.json");
        assertEq(identity.getAgentWallet(agentId), verifier, "agentWallet defaults to the registrant");
        assertEq(identity.ownerOf(agentId), verifier);
        verdicts.bindVerifier(agentId);
    }

    // ------------------------------------------------------------- USDC

    function test_fork_usdcIsCirclesFiatToken() public view {
        assertEq(fiat.name(), "USDC");
        assertEq(fiat.version(), "2");
        assertEq(fiat.decimals(), 6);
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("USDC"),
                keccak256("2"),
                uint256(5042002),
                USDC
            )
        );
        assertEq(fiat.DOMAIN_SEPARATOR(), expected);
    }

    function test_fork_nativeBalanceIsTheErc20Balance() public {
        address a = makeAddr("anyone");
        vm.deal(a, 3e18); // 3 USDC as the 18-decimal native balance
        assertEq(_usdc(a), 3e6);
        vm.prank(a);
        IERC20Like(USDC).transfer(operator, 1e6);
        assertEq(a.balance, 2e18);
        assertEq(_usdc(operator), 1e6);
    }

    function test_fork_taskRunPayout_inRealUsdc() public {
        uint256 id = _task(4, REWARD * 4);
        assertEq(_usdc(address(thenar)), REWARD * 4, "escrowed in Circle's USDC");
        assertEq(_usdc(funder), 0);

        bytes32 h = keccak256("arc fork run 1");
        uint256 tid = _run(id, operator, h, 9_000);
        assertEq(_usdc(operator), 360_000, "0.36 USDC, settled in the block that recorded the run");
        assertEq(operator.balance, 360_000 * 1e12, "the same dollars as native gas balance");
        assertEq(_usdc(address(thenar)), REWARD * 4 - 360_000);
        assertEq(thenar.getTask(id).escrow, REWARD * 4 - 360_000);
        (bool found, uint256 byHash) = thenar.trajectoryOfHash(h);
        assertTrue(found);
        assertEq(byHash, tid);

        // A relayer pays the gas; the operator gets the USDC.
        bytes32 h2 = keccak256("arc fork run 2");
        address op2 = makeAddr("second operator");
        bytes memory sig = _sign(id, op2, h2, 10_000);
        vm.prank(relayer);
        thenar.submitTrajectoryFor(op2, id, h2, CID, 10_000, sig);
        assertEq(_usdc(op2), REWARD);
        assertEq(_usdc(relayer), 0);
    }

    function test_fork_createTaskWithAuthorization_realEip3009() public {
        uint256 sponsorKey = 0x5B0B5;
        address sponsor = vm.addr(sponsorKey);
        _giveUsdc(sponsor, 10e6);
        ThenarProtocol.TaskParams memory p = ThenarProtocol.TaskParams({
            name: "Arc fork: fold the towel",
            slots: 5,
            rewardPerTrajectory: REWARD,
            scenario: 4,
            difficulty: 2,
            expiresAt: uint64(block.timestamp + 7 days),
            amount: 2e6
        });
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 nonce = thenar.taskNonce(sponsor, p);
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                fiat.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(fiat.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), sponsor, address(thenar), p.amount, 0, validBefore, nonce)
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sponsorKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // A relayer can't spend it on a different task.
        ThenarProtocol.TaskParams memory q = ThenarProtocol.TaskParams({
            name: p.name,
            slots: 50,
            rewardPerTrajectory: 0.04e6,
            scenario: p.scenario,
            difficulty: p.difficulty,
            expiresAt: p.expiresAt,
            amount: p.amount
        });
        bytes32 qNonce = thenar.taskNonce(sponsor, q);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.WrongNonce.selector, qNonce, nonce));
        thenar.createTaskWithAuthorization(sponsor, q, 0, validBefore, nonce, sig);
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        thenar.createTaskWithAuthorization(sponsor, q, 0, validBefore, qNonce, sig);

        vm.prank(relayer);
        uint256 id = thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, nonce, sig);
        assertEq(thenar.getTask(id).funder, sponsor);
        assertEq(thenar.getTask(id).escrow, 2e6);
        assertEq(_usdc(sponsor), 8e6);
        assertEq(_usdc(address(thenar)), 2e6);
        assertTrue(fiat.authorizationState(sponsor, nonce), "nonce spent on Circle's token");

        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: authorization is used or canceled"));
        thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, nonce, sig);
    }

    // ------------------------------------------------------- blocklist

    function test_fork_payoutToABlocklistedOperatorIsDeferred() public {
        emit log_named_string(
            "anvil account #1 on Circle's Arc testnet blocklist", fiat.isBlacklisted(BLOCKLISTED) ? "yes" : "no"
        );
        if (!fiat.isBlacklisted(BLOCKLISTED)) {
            // Not (or no longer) on the list: put it there the way Circle would.
            vm.prank(fiat.blacklister());
            fiat.blacklist(BLOCKLISTED);
        }
        assertTrue(fiat.isBlacklisted(BLOCKLISTED));

        uint256 id = _task(4, REWARD * 4);
        bytes32 h = keccak256("blocklisted operator's run");
        bytes memory sig = _sign(id, BLOCKLISTED, h, 8_000);
        uint256 before = _usdc(BLOCKLISTED);

        vm.expectEmit(address(thenar));
        emit ThenarProtocol.PaymentDeferred(BLOCKLISTED, 320_000);
        vm.prank(relayer);
        thenar.submitTrajectoryFor(BLOCKLISTED, id, h, CID, 8_000, sig);

        assertEq(_usdc(BLOCKLISTED), before, "Circle refused the transfer");
        assertEq(thenar.claimable(BLOCKLISTED), 320_000);
        assertEq(thenar.claimableTotal(), 320_000);
        assertEq(thenar.getTrajectory(0).paid, 320_000, "the run is recorded and owed");
        assertEq(_usdc(address(thenar)), thenar.getTask(id).escrow + thenar.claimableTotal());

        // Claiming while still blocklisted fails, and the claim survives.
        vm.prank(BLOCKLISTED);
        vm.expectRevert();
        thenar.claim();
        assertEq(thenar.claimable(BLOCKLISTED), 320_000);

        // Delisted by Circle: the claim goes through.
        vm.prank(fiat.blacklister());
        fiat.unBlacklist(BLOCKLISTED);
        vm.prank(BLOCKLISTED);
        thenar.claim();
        assertEq(_usdc(BLOCKLISTED), before + 320_000);
        assertEq(thenar.claimableTotal(), 0);
    }

    // ---------------------------------------------------------- passkey

    function test_fork_p256PrecompileVerifiesAWebCryptoSignature() public {
        assertEq(address(0x100).code.length, 0, "a precompile, not a contract");
        PasskeyRegistry reg = new PasskeyRegistry();
        bytes32 d = 0x7d9a9dd8b47e1bfe72856deb62097356dea1b6fbb40696cdb88ba911a017795b;
        bytes32 r = 0x53ebe57d38736b8cc3c11ebb12321edf85cb8312ff968525fa1bc8711d8c017d;
        bytes32 s = 0x7754c7011e16f2b8e50ce603e5833347de68077f40b78e661d6d2e404b1ee47e;
        bytes32 x = 0x70dd2b6396c2faefa77626826a9385e30a21fd89464fd95422b2b7a225a71f68;
        bytes32 y = 0x5410c665847de22b35ad5a7be819ae5b8382563c2909f5f14e17c2aace0f8076;
        assertTrue(reg.verifyWithKey(d, r, s, x, y), "Arc's precompile accepts a WebCrypto signature");
        assertFalse(reg.verifyWithKey(d, bytes32(uint256(r) ^ 1), s, x, y));
        assertFalse(reg.verifyWithKey(keccak256("other"), r, s, x, y));
    }

    function test_fork_passkeyRun_throughArcsP256Precompile() public {
        uint256 passkey = 0x7041D;
        (uint256 x, uint256 y) = vm.publicKeyP256(passkey);
        vm.prank(operator);
        passkeys.register(bytes32(x), bytes32(y));

        uint256 id = _task(2, REWARD * 2);
        bytes32 h = keccak256("touch id run on arc");
        (bytes32 pr, bytes32 ps) = vm.signP256(passkey, sha256(abi.encodePacked(h)));
        bytes memory sig = _sign(id, operator, h, 9_500);

        vm.prank(operator);
        vm.expectRevert(ThenarProtocol.BadPasskeySignature.selector);
        thenar.submitTrajectoryWithPasskey(id, h, CID, 9_500, sig, pr, bytes32(uint256(ps) ^ 1));

        vm.expectEmit(address(thenar));
        emit ThenarProtocol.PasskeyRun(0, operator);
        vm.prank(operator);
        thenar.submitTrajectoryWithPasskey(id, h, CID, 9_500, sig, pr, ps);
        assertEq(_usdc(operator), 380_000);
        assertEq(thenar.getTrajectory(0).contributor, operator);
    }

    // ---------------------------------------------------------- ERC-8004

    function test_fork_paidRunWritesTheVerifiersErc8004Record() public {
        uint256 agentId = _bindVerifierAgent();
        (bool bound, uint256 boundId) = verdicts.verifierAgent();
        assertTrue(bound);
        assertEq(boundId, agentId);

        uint256 id = _task(4, REWARD * 4);
        bytes32 h = keccak256("arc fork verdict run");
        vm.expectEmit(address(verdicts));
        emit ThenarVerdicts.VerdictRecorded(0, id, operator, h, 8_750, 350_000, true);
        _run(id, operator, h, 8_750);
        assertEq(_usdc(operator), 350_000);
        assertEq(verdicts.written(), 1);

        // Read it back from the real Reputation Registry: client = ThenarVerdicts.
        assertEq(reputation.getLastIndex(agentId, address(verdicts)), 1);
        _assertFeedback(agentId, address(verdicts), 1, 8_750, 2, "runVerdict", "thenar");
        _assertSummary(agentId, address(verdicts), "runVerdict", "thenar", 1, 8_750, 2);

        // A second run, and the summary averages them.
        _run(id, makeAddr("op 2"), keccak256("arc fork verdict run 2"), 6_250);
        _assertSummary(agentId, address(verdicts), "runVerdict", "thenar", 2, 7_500, 2);

        // A buyer agent rates the same verifier from its own EOA after a purchase.
        address buyerAgent = makeAddr("buyer agent");
        bytes32 served = sha256("the corpus bytes served"); // before the prank: sha256 is a call too
        vm.prank(buyerAgent);
        reputation.giveFeedback(agentId, 90, 0, "corpusQuality", "thenar", "", "", served);
        _assertFeedback(agentId, buyerAgent, 1, 90, 0, "corpusQuality", "thenar");
        _assertSummary(agentId, buyerAgent, "corpusQuality", "thenar", 1, 90, 0);
        // The verdict record is unchanged by the buyer's rating.
        _assertSummary(agentId, address(verdicts), "runVerdict", "thenar", 2, 7_500, 2);
    }

    function _assertFeedback(
        uint256 agentId,
        address client,
        uint64 index,
        int128 wantValue,
        uint8 wantDecimals,
        string memory wantTag1,
        string memory wantTag2
    ) internal view {
        (int128 value, uint8 decimals, string memory tag1, string memory tag2, bool revoked) =
            reputation.readFeedback(agentId, client, index);
        assertEq(value, wantValue);
        assertEq(decimals, wantDecimals);
        assertEq(tag1, wantTag1);
        assertEq(tag2, wantTag2);
        assertFalse(revoked);
    }

    /// getSummary for one client; `mean` is stated with `meanDecimals` decimals and compared at the registry's scale.
    function _assertSummary(
        uint256 agentId,
        address client,
        string memory tag1,
        string memory tag2,
        uint64 wantCount,
        int256 mean,
        uint8 meanDecimals
    ) internal {
        address[] memory clients = new address[](1);
        clients[0] = client;
        (uint64 count, int128 summary, uint8 summaryDecimals) = reputation.getSummary(agentId, clients, tag1, tag2);
        emit log_named_int(string.concat(tag1, " summary value"), summary);
        emit log_named_uint(string.concat(tag1, " summary decimals"), summaryDecimals);
        assertEq(count, wantCount);
        assertEq(int256(summary) * int256(10 ** meanDecimals), mean * int256(10 ** summaryDecimals));
    }

    function test_fork_bindVerifier_refusesAnAgentTheVerifierDoesNotControl() public {
        address someoneElse = makeAddr("impostor");
        vm.prank(someoneElse);
        uint256 agentId = identity.register("https://impostor.example/agent.json");
        vm.expectRevert(abi.encodeWithSelector(ThenarVerdicts.NotVerifierAgent.selector, agentId));
        verdicts.bindVerifier(agentId);
    }

    /// The worst case for VERDICT_GAS: the first feedback this client writes for the agent, on the real registry.
    function test_fork_firstVerdictFitsInVerdictGas() public {
        uint256 agentId = _bindVerifierAgent();
        vm.prank(address(thenar));
        uint256 g = gasleft();
        verdicts.recordVerdict(0, 0, operator, keccak256("gas probe"), 9_000, 360_000);
        uint256 first = g - gasleft();
        vm.prank(address(thenar));
        g = gasleft();
        verdicts.recordVerdict(1, 0, operator, keccak256("gas probe 2"), 9_000, 360_000);
        uint256 second = g - gasleft();
        emit log_named_uint("recordVerdict gas, first feedback (real ERC-8004)", first);
        emit log_named_uint("recordVerdict gas, later feedback (real ERC-8004)", second);
        assertEq(reputation.getLastIndex(agentId, address(verdicts)), 2, "both written");
        assertLt(first, thenar.VERDICT_GAS(), "VERDICT_GAS too small for a first write");
    }

    // ------------------------------------------------------------- Memo

    function test_fork_runSubmittedThroughMemo_isTheOperatorsOwn() public {
        uint256 id = _task(2, REWARD * 2);
        bytes32 h = keccak256("memo-tagged run");
        bytes memory sig = _sign(id, operator, h, 9_000);
        bytes memory data = abi.encodeCall(ThenarProtocol.submitTrajectory, (id, h, CID, 9_000, sig));
        bytes memory note = bytes("thenar run: pick-and-place, 90.00");

        vm.recordLogs();
        vm.prank(operator, operator); // Memo is called from the operator's EOA transaction
        IMemo(MEMO).memo(address(thenar), data, h, note);

        // CallFrom: the protocol saw the operator, so the verifier's signature for them matched and they were paid.
        ThenarProtocol.Trajectory memory t = thenar.getTrajectory(0);
        assertEq(t.contributor, operator);
        assertEq(t.trajHash, h);
        assertEq(_usdc(operator), 360_000);
        assertEq(thenar.totalRuns(operator), 1);
        assertEq(thenar.totalRuns(MEMO), 0, "Memo itself is not the contributor");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == MEMO && logs[i].topics[0] == IMemo.Memo.selector) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), operator, "sender");
                assertEq(address(uint160(uint256(logs[i].topics[2]))), address(thenar), "target");
                assertEq(logs[i].topics[3], h, "memoId is the run id");
                (bytes32 callDataHash, bytes memory m,) = abi.decode(logs[i].data, (bytes32, bytes, uint256));
                assertEq(callDataHash, keccak256(data));
                assertEq(m, note);
                seen = true;
            }
        }
        assertTrue(seen, "Memo event tagged with the run id");
    }

    // ------------------------------------------------------------- CCTP

    function test_fork_operatorMovesEarningsToBaseWithCctpV2() public {
        uint256 id = _task(5, REWARD * 5);
        for (uint256 i; i < 5; ++i) _run(id, operator, keccak256(abi.encode("cctp run", i)), 10_000);
        uint256 earned = _usdc(operator);
        assertEq(earned, 2e6, "five perfect runs: 2 USDC");

        ITokenMessengerV2 tm = ITokenMessengerV2(TOKEN_MESSENGER_V2);
        vm.startPrank(operator);
        IERC20Like(USDC).approve(TOKEN_MESSENGER_V2, earned);
        vm.recordLogs();
        tm.depositForBurn(earned, BASE_CCTP_DOMAIN, bytes32(uint256(uint160(operator))), USDC, bytes32(0), 0, 2000);
        vm.stopPrank();

        assertEq(_usdc(operator), 0, "burned on Arc");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter == TOKEN_MESSENGER_V2 && logs[i].topics[0] == ITokenMessengerV2.DepositForBurn.selector) {
                assertEq(address(uint160(uint256(logs[i].topics[1]))), USDC, "burnToken");
                assertEq(address(uint160(uint256(logs[i].topics[2]))), operator, "depositor");
                assertEq(uint256(logs[i].topics[3]), 2000, "standard finality");
                (uint256 amt, bytes32 mintRecipient, uint32 domain,,,,) =
                    abi.decode(logs[i].data, (uint256, bytes32, uint32, bytes32, bytes32, uint256, bytes));
                assertEq(amt, earned);
                assertEq(mintRecipient, bytes32(uint256(uint160(operator))));
                assertEq(domain, BASE_CCTP_DOMAIN);
                found = true;
            }
        }
        assertTrue(found, "DepositForBurn emitted");
    }
}
