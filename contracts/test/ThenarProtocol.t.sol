// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ThenarProtocol} from "../src/ThenarProtocol.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {ThenarBase} from "./utils/ThenarBase.sol";
import {P256Precompile} from "./utils/P256Precompile.sol";

/**
 * ThenarProtocol on Arc: USDC escrow (6 decimals), per-run settlement against
 * a verifier signature, EIP-3009 task funding, licences that fan out to every
 * contributor, and push payments that fall back to `claimable` when Circle's
 * blocklist refuses them.
 *
 * The verdict side (ThenarVerdicts / ERC-8004) is in ThenarVerdicts.t.sol.
 */
contract ThenarProtocolTest is ThenarBase {
    uint256 internal constant SPONSOR_KEY = 0x5150;
    address internal sponsor;

    function setUp() public {
        vm.warp(1_800_000_000);
        _deploy(address(0));
        sponsor = vm.addr(SPONSOR_KEY);
    }

    // ================================================================
    // Deployment
    // ================================================================

    function test_constructor_rejectsMissingPieces() public {
        vm.expectRevert(ThenarProtocol.NotVerifier.selector);
        new ThenarProtocol(address(0), treasury, address(registry), address(usdc), address(0), MAX_ESCROW);
        vm.expectRevert(ThenarProtocol.ZeroAddress.selector);
        new ThenarProtocol(verifier, address(0), address(registry), address(usdc), address(0), MAX_ESCROW);
        vm.expectRevert(ThenarProtocol.ZeroAddress.selector);
        new ThenarProtocol(verifier, treasury, address(registry), address(0), address(0), MAX_ESCROW);
        vm.expectRevert(ThenarProtocol.ZeroAmount.selector);
        new ThenarProtocol(verifier, treasury, address(registry), address(usdc), address(0), 0);
    }

    function test_constructor_wiresImmutables() public view {
        assertEq(thenar.verifier(), verifier);
        assertEq(thenar.treasury(), treasury);
        assertEq(address(thenar.passkeys()), address(registry));
        assertEq(address(thenar.usdc()), address(usdc));
        assertEq(address(thenar.verdicts()), address(0));
        assertEq(thenar.maxTaskEscrow(), MAX_ESCROW);
    }

    // ================================================================
    // Posting and funding a task
    // ================================================================

    function test_createTask_pullsTheEscrowInUsdc() public {
        uint256 before = usdc.balanceOf(funder);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.TaskCreated(0, funder, "Pick and place", 4, REWARD, 2, 5);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.TaskFunded(0, funder, REWARD * 4);
        vm.prank(funder);
        uint256 id = thenar.createTask("Pick and place", 4, REWARD, 2, 5, REWARD * 4);

        assertEq(id, 0);
        assertEq(thenar.taskCount(), 1);
        assertEq(usdc.balanceOf(funder), before - REWARD * 4, "funder debited 1.60 USDC");
        assertEq(usdc.balanceOf(address(thenar)), REWARD * 4, "held by the protocol");

        ThenarProtocol.Task memory t = thenar.getTask(id);
        assertEq(t.name, "Pick and place");
        assertEq(t.funder, funder);
        assertEq(t.rewardPerTrajectory, REWARD);
        assertEq(t.escrow, REWARD * 4);
        assertEq(t.slotsTotal, 4);
        assertEq(t.slotsFilled, 0);
        assertEq(t.scenario, 2);
        assertEq(t.difficulty, 5);
        assertFalse(t.policyMinted);
        assertEq(t.expiresAt, 0);
        assertFalse(t.closed);
        assertEq(t.createdBlock, block.number);
    }

    function test_createTask_refusesAnEmptyOrUnderfundedBounty() public {
        vm.startPrank(funder);
        vm.expectRevert(ThenarProtocol.ZeroSlots.selector);
        thenar.createTask("T", 0, REWARD, 1, 3, REWARD);
        vm.expectRevert(ThenarProtocol.ZeroReward.selector);
        thenar.createTask("T", 1, 0, 1, 3, REWARD);
        // Escrow must cover at least one full-score run.
        vm.expectRevert(ThenarProtocol.Underfunded.selector);
        thenar.createTask("T", 1, REWARD, 1, 3, REWARD - 1);
        vm.stopPrank();
    }

    function test_createTask_refusesMoreThanTheEscrowCap() public {
        vm.startPrank(funder);
        vm.expectRevert(
            abi.encodeWithSelector(ThenarProtocol.EscrowCapExceeded.selector, uint256(MAX_ESCROW) + 1, MAX_ESCROW)
        );
        thenar.createTask("T", 1, REWARD, 1, 3, uint256(MAX_ESCROW) + 1);
        vm.expectRevert(
            abi.encodeWithSelector(ThenarProtocol.EscrowCapExceeded.selector, uint256(MAX_ESCROW) + 1, MAX_ESCROW)
        );
        thenar.createTaskUntil("T", 1, REWARD, 1, 3, uint64(block.timestamp + 1 days), uint256(MAX_ESCROW) + 1);
        // Exactly the cap is fine.
        uint256 id = thenar.createTask("T", 1, REWARD, 1, 3, MAX_ESCROW);
        vm.stopPrank();
        assertEq(thenar.getTask(id).escrow, MAX_ESCROW);
    }

    function test_fundTask_capCountsWhatIsAlreadyEscrowed() public {
        uint256 id = _task(4, uint256(MAX_ESCROW) - 1e6);
        _fundAndApprove(stranger, 10e6);

        vm.prank(stranger);
        thenar.fundTask(id, 1e6); // exactly to the cap
        assertEq(thenar.getTask(id).escrow, MAX_ESCROW);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(ThenarProtocol.EscrowCapExceeded.selector, uint256(MAX_ESCROW) + 1, MAX_ESCROW)
        );
        thenar.fundTask(id, 1);
    }

    function test_fundTask_anyoneMayTopUp_fromTheirOwnBalance() public {
        uint256 id = _task(4, REWARD);
        _fundAndApprove(stranger, 5e6);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.TaskFunded(id, stranger, 1e6);
        vm.prank(stranger);
        thenar.fundTask(id, 1e6);
        assertEq(usdc.balanceOf(stranger), 4e6);
        assertEq(thenar.getTask(id).escrow, REWARD + 1e6);
        assertEq(thenar.getTask(id).funder, funder, "a top-up does not change the funder");
    }

    function test_fundTask_refusesBadTargets() public {
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.NoSuchTask.selector, 7));
        thenar.fundTask(7, 1e6);

        uint256 id = _taskUntil(1, REWARD, uint64(block.timestamp + 1 days));
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.ZeroAmount.selector);
        thenar.fundTask(id, 0);

        // Closed after its deadline.
        vm.warp(block.timestamp + 2 days);
        vm.prank(funder);
        thenar.closeTask(id);
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.TaskClosed.selector);
        thenar.fundTask(id, 1e6);

        // Filled and its policy minted.
        uint256 id2 = _task(1, REWARD);
        _run(id2, alice, keccak256("only"), 10_000);
        vm.prank(funder);
        thenar.mintPolicy(id2, 1e6);
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.TaskClosed.selector);
        thenar.fundTask(id2, 1e6);
    }

    // ================================================================
    // EIP-3009 funding
    // ================================================================

    function _params(string memory name, uint32 slots, uint128 reward, uint256 amount)
        internal
        view
        returns (ThenarProtocol.TaskParams memory p)
    {
        p = ThenarProtocol.TaskParams({
            name: name,
            slots: slots,
            rewardPerTrajectory: reward,
            scenario: 4,
            difficulty: 2,
            expiresAt: uint64(block.timestamp + 7 days),
            amount: amount
        });
    }

    function _authorize(ThenarProtocol.TaskParams memory p, uint256 validBefore)
        internal
        view
        returns (bytes32 nonce, bytes memory sig)
    {
        nonce = thenar.taskNonce(sponsor, p);
        bytes32 digest = _receiveDigest(sponsor, address(thenar), p.amount, 0, validBefore, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SPONSOR_KEY, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function test_createTaskWithAuthorization_fundsFromOneSignature() public {
        usdc.mint(sponsor, 10e6); // no approval, no gas: the sponsor only signs
        ThenarProtocol.TaskParams memory p = _params("Fold the towel", 5, REWARD, 2e6);
        uint256 validBefore = block.timestamp + 1 hours;
        (bytes32 nonce, bytes memory sig) = _authorize(p, validBefore);

        vm.expectEmit(address(thenar));
        emit ThenarProtocol.TaskFunded(0, sponsor, 2e6);
        vm.prank(relayer);
        uint256 id = thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, nonce, sig);

        ThenarProtocol.Task memory t = thenar.getTask(id);
        assertEq(t.funder, sponsor, "the signer is the funder, not the relayer");
        assertEq(t.name, "Fold the towel");
        assertEq(t.slotsTotal, 5);
        assertEq(t.rewardPerTrajectory, REWARD);
        assertEq(t.scenario, 4);
        assertEq(t.difficulty, 2);
        assertEq(t.expiresAt, p.expiresAt);
        assertEq(t.escrow, 2e6);
        assertEq(usdc.balanceOf(sponsor), 8e6);
        assertEq(usdc.balanceOf(address(thenar)), 2e6);
        assertEq(usdc.balanceOf(relayer), 0, "the relayer paid nothing");
        assertTrue(usdc.authorizationState(sponsor, nonce));

        // The sponsor, not the relayer, can reclaim it after the deadline.
        vm.warp(p.expiresAt);
        vm.prank(relayer);
        vm.expectRevert(ThenarProtocol.NotFunder.selector);
        thenar.closeTask(id);
        vm.prank(sponsor);
        thenar.closeTask(id);
        assertEq(usdc.balanceOf(sponsor), 10e6);
    }

    function test_createTaskWithAuthorization_rejectsAWrongNonce() public {
        usdc.mint(sponsor, 10e6);
        ThenarProtocol.TaskParams memory p = _params("T", 5, REWARD, 2e6);
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 expected = thenar.taskNonce(sponsor, p);
        bytes32 bogus = keccak256("random nonce");
        bytes32 digest = _receiveDigest(sponsor, address(thenar), p.amount, 0, validBefore, bogus);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SPONSOR_KEY, digest);

        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.WrongNonce.selector, expected, bogus));
        thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, bogus, abi.encodePacked(r, s, v));
        assertEq(thenar.taskCount(), 0);
        assertEq(usdc.balanceOf(sponsor), 10e6);
    }

    function test_createTaskWithAuthorization_relayerCannotSpendItOnAnotherTask() public {
        usdc.mint(sponsor, 10e6);
        ThenarProtocol.TaskParams memory p = _params("Fold the towel", 5, REWARD, 2e6);
        uint256 validBefore = block.timestamp + 1 hours;
        (bytes32 nonce, bytes memory sig) = _authorize(p, validBefore);

        // Same signature and nonce, different task: the nonce no longer matches the params.
        ThenarProtocol.TaskParams memory q = _params("Fold the towel", 50, 0.04e6, 2e6);
        bytes32 qNonce = thenar.taskNonce(sponsor, q);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.WrongNonce.selector, qNonce, nonce));
        thenar.createTaskWithAuthorization(sponsor, q, 0, validBefore, nonce, sig);

        // Recomputing the nonce for the new params breaks the sponsor's signature instead.
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: invalid signature"));
        thenar.createTaskWithAuthorization(sponsor, q, 0, validBefore, qNonce, sig);

        // A renamed task, a different deadline: the same.
        q = _params("Something else", 5, REWARD, 2e6);
        qNonce = thenar.taskNonce(sponsor, q);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.WrongNonce.selector, qNonce, nonce));
        thenar.createTaskWithAuthorization(sponsor, q, 0, validBefore, nonce, sig);
        q = _params("Fold the towel", 5, REWARD, 2e6);
        q.expiresAt += 1;
        qNonce = thenar.taskNonce(sponsor, q);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.WrongNonce.selector, qNonce, nonce));
        thenar.createTaskWithAuthorization(sponsor, q, 0, validBefore, nonce, sig);

        // Naming another funder doesn't help either.
        bytes32 strangerNonce = thenar.taskNonce(stranger, p);
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.WrongNonce.selector, strangerNonce, nonce));
        thenar.createTaskWithAuthorization(stranger, p, 0, validBefore, nonce, sig);

        // The task it was signed for still goes through.
        vm.prank(relayer);
        thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, nonce, sig);
        assertEq(thenar.taskCount(), 1);
        assertEq(thenar.getTask(0).slotsTotal, 5);
    }

    function test_createTaskWithAuthorization_cannotBeReplayed() public {
        usdc.mint(sponsor, 10e6);
        ThenarProtocol.TaskParams memory p = _params("T", 5, REWARD, 2e6);
        uint256 validBefore = block.timestamp + 1 hours;
        (bytes32 nonce, bytes memory sig) = _authorize(p, validBefore);
        vm.prank(relayer);
        thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, nonce, sig);
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: authorization is used or canceled"));
        thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, nonce, sig);
        assertEq(thenar.taskCount(), 1);
        assertEq(usdc.balanceOf(sponsor), 8e6);
    }

    function test_createTaskWithAuthorization_cannotBeFrontRunIntoABareTransfer() public {
        usdc.mint(sponsor, 10e6);
        ThenarProtocol.TaskParams memory p = _params("T", 5, REWARD, 2e6);
        uint256 validBefore = block.timestamp + 1 hours;
        (bytes32 nonce, bytes memory sig) = _authorize(p, validBefore);
        // receiveWithAuthorization names the protocol as payee: only the protocol may execute it.
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: caller must be the payee"));
        usdc.receiveWithAuthorization(sponsor, address(thenar), p.amount, 0, validBefore, nonce, sig);
    }

    function test_createTaskWithAuthorization_expiredAuthorizationRefused() public {
        usdc.mint(sponsor, 10e6);
        ThenarProtocol.TaskParams memory p = _params("T", 5, REWARD, 2e6);
        uint256 validBefore = block.timestamp + 1 hours;
        (bytes32 nonce, bytes memory sig) = _authorize(p, validBefore);
        vm.warp(validBefore);
        vm.prank(relayer);
        vm.expectRevert(bytes("FiatTokenV2: authorization is expired"));
        thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, nonce, sig);
    }

    function test_createTaskWithAuthorization_respectsTheEscrowCap() public {
        usdc.mint(sponsor, 2_000e6);
        ThenarProtocol.TaskParams memory p = _params("T", 5, REWARD, uint256(MAX_ESCROW) + 1);
        uint256 validBefore = block.timestamp + 1 hours;
        (bytes32 nonce, bytes memory sig) = _authorize(p, validBefore);
        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(ThenarProtocol.EscrowCapExceeded.selector, uint256(MAX_ESCROW) + 1, MAX_ESCROW)
        );
        thenar.createTaskWithAuthorization(sponsor, p, 0, validBefore, nonce, sig);
        assertFalse(usdc.authorizationState(sponsor, nonce), "the authorization is still unspent");
    }

    function test_taskNonce_isBoundToChainAndContract() public {
        ThenarProtocol.TaskParams memory p = _params("T", 5, REWARD, 2e6);
        bytes32 here = thenar.taskNonce(sponsor, p);
        ThenarProtocol other =
            new ThenarProtocol(verifier, treasury, address(registry), address(usdc), address(0), MAX_ESCROW);
        assertTrue(other.taskNonce(sponsor, p) != here, "another deployment");
        vm.chainId(5042);
        assertTrue(thenar.taskNonce(sponsor, p) != here, "another chain");
    }

    // ================================================================
    // Settlement
    // ================================================================

    function test_payout_atSeveralScores() public {
        uint16[7] memory scores = [uint16(10_000), 9_999, 9_000, 7_333, 5_000, 4_001, 4_000];
        uint256[7] memory expected = [uint256(400_000), 399_960, 360_000, 293_320, 200_000, 160_040, 160_000];
        uint256 id = _task(10, uint256(REWARD) * 10);
        uint256 escrow = uint256(REWARD) * 10;
        for (uint256 i; i < scores.length; ++i) {
            address op = makeAddr(string.concat("operator-", vm.toString(i)));
            bytes32 h = keccak256(abi.encode("score", i));
            vm.expectEmit(address(thenar));
            emit ThenarProtocol.TrajectoryAccepted(i, id, op, h, CID, scores[i], expected[i]);
            uint256 tid = _run(id, op, h, scores[i]);
            assertEq(usdc.balanceOf(op), expected[i], "paid reward * score / 10000, in 6-dec USDC");
            assertEq(thenar.getTrajectory(tid).paid, expected[i]);
            escrow -= expected[i];
            assertEq(thenar.getTask(id).escrow, escrow, "escrow drops by exactly the payout");
        }
        assertEq(usdc.balanceOf(address(thenar)), escrow);
    }

    function testFuzz_payout_isRewardTimesScore(uint128 reward, uint16 score) public {
        reward = uint128(bound(reward, 1, MAX_ESCROW));
        score = uint16(bound(score, 4_000, 10_000));
        vm.prank(funder);
        uint256 id = thenar.createTask("T", 1, reward, 1, 1, reward);
        _run(id, alice, keccak256("fuzz"), score);
        uint256 payout = (uint256(reward) * score) / 10_000;
        assertEq(usdc.balanceOf(alice), payout);
        assertEq(thenar.getTask(id).escrow, reward - payout);
        assertEq(usdc.balanceOf(address(thenar)), reward - payout);
        assertEq(thenar.totalEarned(alice), payout);
    }

    function test_scoreOutsideTheAcceptedBandIsRefused() public {
        uint256 id = _task(4, REWARD * 4);
        bytes32 h = keccak256("low");
        bytes memory low = _sign(id, alice, h, 3_999);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.ScoreTooLow.selector);
        thenar.submitTrajectory(id, h, CID, 3_999, low);

        bytes memory high = _sign(id, alice, h, 10_001);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.ScoreTooHigh.selector);
        thenar.submitTrajectory(id, h, CID, 10_001, high);
        assertFalse(thenar.trajectoryUsed(h));
    }

    function test_escrowEmpty_untilToppedUp() public {
        uint256 id = _task(2, REWARD); // covers exactly one perfect run
        _run(id, alice, keccak256("first"), 10_000);
        assertEq(thenar.getTask(id).escrow, 0);

        bytes32 h = keccak256("second");
        bytes memory sig = _sign(id, bob, h, 10_000);
        vm.prank(bob);
        vm.expectRevert(ThenarProtocol.EscrowEmpty.selector);
        thenar.submitTrajectory(id, h, CID, 10_000, sig);

        vm.prank(funder);
        thenar.fundTask(id, REWARD);
        vm.prank(bob);
        thenar.submitTrajectory(id, h, CID, 10_000, sig);
        assertEq(usdc.balanceOf(bob), REWARD);
    }

    function test_aRunIsPaidOnlyOnce_evenOnAnotherTask() public {
        uint256 a = _task(4, REWARD * 4);
        uint256 b = _task(4, REWARD * 4);
        bytes32 h = keccak256("same run");
        _run(a, alice, h, 9_000);
        bytes memory sig = _sign(a, alice, h, 9_000);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.AlreadySubmitted.selector);
        thenar.submitTrajectory(a, h, CID, 9_000, sig);
        bytes memory sigB = _sign(b, alice, h, 9_000);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.AlreadySubmitted.selector);
        thenar.submitTrajectory(b, h, CID, 9_000, sigB);
    }

    function test_oneAccountIsCappedPerTask() public {
        uint256 id = _task(10, REWARD * 10);
        for (uint256 i; i < 5; ++i) _run(id, alice, keccak256(abi.encode("cap", i)), 9_000);
        assertEq(thenar.runsOnTask(id, alice), 5);
        bytes32 h = keccak256("sixth");
        bytes memory sig = _sign(id, alice, h, 9_000);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.CapReached.selector);
        thenar.submitTrajectory(id, h, CID, 9_000, sig);
        // Somebody else still can.
        _run(id, bob, h, 9_000);
    }

    function test_aFilledTaskTakesNoMoreRuns() public {
        uint256 id = _task(2, REWARD * 4);
        _run(id, alice, keccak256("1"), 9_000);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.TaskFilled(id);
        _run(id, bob, keccak256("2"), 9_000);
        assertEq(thenar.slotsFilledOf(id), 2);
        assertEq(thenar.getTask(id).slotsFilled, 2);

        bytes32 h = keccak256("3");
        bytes memory sig = _sign(id, carol, h, 9_000);
        vm.prank(carol);
        vm.expectRevert(ThenarProtocol.NoSlots.selector);
        thenar.submitTrajectory(id, h, CID, 9_000, sig);
    }

    function test_aShardedTaskFillsCompletely() public {
        // 40 slots: 5 shards of 8. Eight operators at five runs each fill every
        // slot whichever shard each one hashes to, by falling back to a shard with room.
        uint256 id = _task(40, uint256(REWARD) * 40);
        uint256 k;
        for (uint256 o; o < 8; ++o) {
            address op = makeAddr(string.concat("op", vm.toString(o)));
            for (uint256 r; r < 5; ++r) _run(id, op, keccak256(abi.encode("shard", k++)), 10_000);
        }
        assertEq(thenar.slotsFilledOf(id), 40);
        assertEq(thenar.getTask(id).escrow, 0);
        assertEq(thenar.contributorsOf(id).length, 8);
        assertFalse(thenar.shardHasRoom(id, alice));

        bytes32 h = keccak256("one too many");
        bytes memory sig = _sign(id, alice, h, 10_000);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.NoSlots.selector);
        thenar.submitTrajectory(id, h, CID, 10_000, sig);
    }

    function test_badVerifierSignaturesAreRefused() public {
        uint256 id = _task(4, REWARD * 4);
        bytes32 h = keccak256("run");

        // Signed by somebody else.
        bytes32 digest = thenar.runDigest(id, alice, h, CID, 9_000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, digest);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.BadSignature.selector);
        thenar.submitTrajectory(id, h, CID, 9_000, abi.encodePacked(r, s, v));

        // Wrong length.
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.BadSignature.selector);
        thenar.submitTrajectory(id, h, CID, 9_000, abi.encodePacked(r, s));

        // The malleable twin of a valid signature (high s).
        (v, r, s) = vm.sign(verifierKey, digest);
        bytes32 highS = bytes32(0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - uint256(s));
        uint8 flipped = v == 27 ? 28 : 27;
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.BadSignature.selector);
        thenar.submitTrajectory(id, h, CID, 9_000, abi.encodePacked(r, highS, flipped));

        // A valid signature over another cid.
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.BadSignature.selector);
        thenar.submitTrajectory(id, h, "ipfs://other", 9_000, abi.encodePacked(r, s, v));

        // The verifier's signature with v as 0/1 is accepted.
        vm.prank(alice);
        thenar.submitTrajectory(id, h, CID, 9_000, abi.encodePacked(r, s, v - 27));
        assertEq(thenar.totalRuns(alice), 1);
    }

    function test_aRunOnAMissingTaskIsRefused() public {
        bytes32 h = keccak256("nowhere");
        bytes memory sig = _sign(3, alice, h, 9_000);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.NoSuchTask.selector, 3));
        thenar.submitTrajectory(3, h, CID, 9_000, sig);
    }

    // ================================================================
    // Expiry and refund
    // ================================================================

    function test_closeTask_refundsUnspentEscrowAfterTheDeadline() public {
        uint256 id = _taskUntil(4, REWARD * 4, uint64(block.timestamp + 7 days));
        uint256 before = usdc.balanceOf(funder);
        vm.warp(block.timestamp + 8 days);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.TaskExpired(id, funder, REWARD * 4);
        vm.prank(funder);
        uint256 refunded = thenar.closeTask(id);

        assertEq(refunded, REWARD * 4, "the whole escrow comes back");
        assertEq(usdc.balanceOf(funder), before + REWARD * 4, "and it reaches the funder");
        assertTrue(thenar.getTask(id).closed);
        assertEq(thenar.getTask(id).escrow, 0);
        assertEq(usdc.balanceOf(address(thenar)), 0);
    }

    function test_closeTask_refundsOnlyWhatRunsDidNotTake() public {
        uint256 id = _taskUntil(4, REWARD * 4, uint64(block.timestamp + 1 days));
        _run(id, alice, keccak256("run"), 10_000);
        _run(id, bob, keccak256("run 2"), 7_500);

        vm.warp(block.timestamp + 2 days);
        uint256 before = usdc.balanceOf(funder);
        vm.prank(funder);
        uint256 refunded = thenar.closeTask(id);

        // One perfect run took one reward, a 75% run three quarters of one.
        assertEq(refunded, REWARD * 4 - REWARD - 300_000, "only the unspent part");
        assertEq(usdc.balanceOf(funder), before + refunded);
        assertEq(usdc.balanceOf(alice), REWARD, "operators keep what they were paid");
        assertEq(usdc.balanceOf(bob), 300_000);
    }

    function test_expiry_blocksRunsFromTheDeadline() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = _taskUntil(4, REWARD * 4, deadline);
        vm.warp(deadline - 1);
        _run(id, alice, keccak256("just in time"), 9_000);

        vm.warp(deadline);
        bytes32 h = keccak256("too late");
        bytes memory sig = _sign(id, bob, h, 9_000);
        vm.prank(bob);
        vm.expectRevert(ThenarProtocol.TaskClosed.selector);
        thenar.submitTrajectory(id, h, CID, 9_000, sig);

        // Closed, it stays closed.
        vm.prank(funder);
        thenar.closeTask(id);
        vm.prank(bob);
        vm.expectRevert(ThenarProtocol.TaskClosed.selector);
        thenar.submitTrajectory(id, h, CID, 9_000, sig);
    }

    function test_closeTask_refusesBeforeTheDeadline() public {
        uint256 id = _taskUntil(1, REWARD, uint64(block.timestamp + 7 days));
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.NotExpired.selector);
        thenar.closeTask(id);
    }

    function test_closeTask_refusesAnyoneButTheFunder() public {
        uint256 id = _taskUntil(1, REWARD, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        vm.prank(stranger);
        vm.expectRevert(ThenarProtocol.NotFunder.selector);
        thenar.closeTask(id);
    }

    function test_closeTask_refusesTwice() public {
        uint256 id = _taskUntil(1, REWARD, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        vm.startPrank(funder);
        thenar.closeTask(id);
        vm.expectRevert(ThenarProtocol.AlreadyClosed.selector);
        thenar.closeTask(id);
        vm.stopPrank();
    }

    function test_taskWithoutADeadlineNeverCloses() public {
        // A funder who wants no deadline is not made to invent one, and cannot
        // then reclaim escrow out from under operators.
        uint256 id = _task(1, REWARD);
        vm.warp(block.timestamp + 3650 days);
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.NotExpired.selector);
        thenar.closeTask(id);
    }

    function test_closeTask_toABlocklistedFunderIsDeferred() public {
        uint256 id = _taskUntil(2, REWARD * 2, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        usdc.blacklist(funder);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.PaymentDeferred(funder, REWARD * 2);
        vm.prank(funder);
        thenar.closeTask(id);
        assertEq(thenar.claimable(funder), REWARD * 2);
        assertEq(thenar.claimableTotal(), REWARD * 2);
        assertTrue(thenar.getTask(id).closed);
    }

    // ================================================================
    // Delegated submission
    // ================================================================

    function test_submitFor_paysTheOperatorAndNotTheRelayer() public {
        uint256 id = _task(2, REWARD * 2);
        bytes32 h = keccak256("relayed");
        bytes memory sig = _sign(id, alice, h, 10_000);

        vm.prank(relayer);
        thenar.submitTrajectoryFor(alice, id, h, CID, 10_000, sig);

        assertEq(usdc.balanceOf(alice), REWARD, "the operator is paid");
        assertEq(usdc.balanceOf(relayer), 0, "the relayer is not");
        assertEq(thenar.totalRuns(alice), 1, "and the run is credited to the operator");
        assertEq(thenar.totalRuns(relayer), 0);
        assertEq(thenar.getTrajectory(0).contributor, alice);
    }

    function test_submitFor_cannotBeUsedToCreditSomeoneElse() public {
        uint256 id = _task(2, REWARD * 2);
        // A signature the verifier issued for alice cannot be redirected to
        // the relayer: the contributor is inside the signed digest.
        bytes32 h = keccak256("stolen");
        bytes memory forAlice = _sign(id, alice, h, 10_000);

        vm.prank(relayer);
        vm.expectRevert(ThenarProtocol.BadSignature.selector);
        thenar.submitTrajectoryFor(relayer, id, h, CID, 10_000, forAlice);

        // Nor can the relayer submit it as their own.
        vm.prank(relayer);
        vm.expectRevert(ThenarProtocol.BadSignature.selector);
        thenar.submitTrajectory(id, h, CID, 10_000, forAlice);
    }

    function test_submitFor_stillRefusesAnUnsignedScore() public {
        uint256 id = _task(2, REWARD * 2);
        bytes32 h = keccak256("forged");
        bytes memory sig = _sign(id, alice, h, 5_000);

        vm.prank(relayer);
        vm.expectRevert(ThenarProtocol.BadSignature.selector);
        thenar.submitTrajectoryFor(alice, id, h, CID, 10_000, sig);
    }

    // ================================================================
    // Passkey runs
    // ================================================================

    function test_passkey_verifiesTheHashOfTheTrajectory() public {
        // The registry is asked for sha256(trajHash), not trajHash. Asserted
        // by watching the call rather than by reading the source, because the
        // whole of v1's passkey bug was a digest that looked right in the
        // source and was wrong on the wire.
        uint256 id = _task(1, REWARD);
        bytes32 h = keccak256("passkey run");

        vm.mockCall(
            address(registry), abi.encodeWithSelector(PasskeyRegistry.hasPasskey.selector, alice), abi.encode(true)
        );
        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(
                PasskeyRegistry.verify.selector, alice, sha256(abi.encodePacked(h)), bytes32(0), bytes32(0)
            ),
            abi.encode(true)
        );

        bytes memory sig = _sign(id, alice, h, 10_000);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.PasskeyRun(0, alice);
        vm.prank(alice);
        thenar.submitTrajectoryWithPasskey(id, h, CID, 10_000, sig, bytes32(0), bytes32(0));
        assertEq(thenar.totalRuns(alice), 1, "the run was recorded through the passkey path");
        assertEq(usdc.balanceOf(alice), REWARD);
    }

    function test_passkey_refusesASignatureOverTheRawHash() public {
        // What v1 asked for. It must not be accepted here, or the fix is a
        // widening rather than a correction.
        uint256 id = _task(1, REWARD);
        bytes32 h = keccak256("passkey run");

        vm.mockCall(
            address(registry), abi.encodeWithSelector(PasskeyRegistry.hasPasskey.selector, alice), abi.encode(true)
        );
        // Only the raw-hash digest is answered true; everything else is false.
        vm.mockCall(address(registry), abi.encodeWithSelector(PasskeyRegistry.verify.selector), abi.encode(false));
        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(PasskeyRegistry.verify.selector, alice, h, bytes32(0), bytes32(0)),
            abi.encode(true)
        );

        bytes memory sig = _sign(id, alice, h, 10_000);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.BadPasskeySignature.selector);
        thenar.submitTrajectoryWithPasskey(id, h, CID, 10_000, sig, bytes32(0), bytes32(0));
    }

    function test_passkey_realP256SignatureThroughTheRegistry() public {
        P256Precompile.ensure(vm);
        uint256 passkey = 0xFACE1D;
        (uint256 x, uint256 y) = vm.publicKeyP256(passkey);
        vm.prank(alice);
        registry.register(bytes32(x), bytes32(y));

        uint256 id = _task(2, REWARD * 2);
        bytes32 h = keccak256("touch id run");
        (bytes32 pr, bytes32 ps) = vm.signP256(passkey, sha256(abi.encodePacked(h)));
        ps = P256Precompile.lowS(ps);
        bytes memory sig = _sign(id, alice, h, 8_000);

        // Another account can't use alice's passkey signature.
        bytes memory bobSig = _sign(id, bob, h, 8_000);
        vm.prank(bob);
        vm.expectRevert(ThenarProtocol.NoPasskey.selector);
        thenar.submitTrajectoryWithPasskey(id, h, CID, 8_000, bobSig, pr, ps);

        // A tampered passkey signature fails.
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.BadPasskeySignature.selector);
        thenar.submitTrajectoryWithPasskey(id, h, CID, 8_000, sig, pr, bytes32(uint256(ps) ^ 1));

        vm.prank(alice);
        uint256 tid = thenar.submitTrajectoryWithPasskey(id, h, CID, 8_000, sig, pr, ps);
        assertEq(thenar.getTrajectory(tid).contributor, alice);
        assertEq(usdc.balanceOf(alice), 320_000);
    }

    function test_passkey_withoutARegistryIsRefused() public {
        ThenarProtocol bare = new ThenarProtocol(verifier, treasury, address(0), address(usdc), address(0), MAX_ESCROW);
        vm.startPrank(funder);
        usdc.approve(address(bare), REWARD);
        uint256 id = bare.createTask("T", 1, REWARD, 1, 1, REWARD);
        vm.stopPrank();
        bytes32 h = keccak256("p");
        bytes32 digest = bare.runDigest(id, alice, h, CID, 9_000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, digest);
        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.NoPasskey.selector);
        bare.submitTrajectoryWithPasskey(id, h, CID, 9_000, abi.encodePacked(r, s, v), bytes32(0), bytes32(0));
    }

    // ================================================================
    // Push payments that fail: claimable
    // ================================================================

    function test_blocklistedContributor_isPaidLaterThroughClaim() public {
        uint256 id = _task(4, REWARD * 4);
        usdc.blacklist(alice);

        vm.expectEmit(address(thenar));
        emit ThenarProtocol.PaymentDeferred(alice, 360_000);
        uint256 tid = _run(id, alice, keccak256("blocked run"), 9_000);

        // The run is recorded and paid on the books; only the transfer waits.
        assertEq(thenar.getTrajectory(tid).paid, 360_000);
        assertEq(thenar.totalEarned(alice), 360_000);
        assertEq(thenar.claimable(alice), 360_000);
        assertEq(thenar.claimableTotal(), 360_000);
        assertEq(usdc.balanceOf(alice), 0);
        assertEq(usdc.balanceOf(address(thenar)), REWARD * 4, "still held, now as a claim");

        // While blocked, claiming fails and the claim survives.
        vm.prank(alice);
        vm.expectRevert(bytes("Blacklistable: account is blacklisted"));
        thenar.claim();
        assertEq(thenar.claimable(alice), 360_000);

        usdc.unBlacklist(alice);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.Claimed(alice, 360_000);
        vm.prank(alice);
        thenar.claim();
        assertEq(usdc.balanceOf(alice), 360_000);
        assertEq(thenar.claimable(alice), 0);
        assertEq(thenar.claimableTotal(), 0);

        vm.prank(alice);
        vm.expectRevert(ThenarProtocol.NothingToClaim.selector);
        thenar.claim();
    }

    function test_claimableTotal_isTheSumOfEveryDeferral() public {
        uint256 id = _task(10, REWARD * 10);
        usdc.blacklist(alice);
        usdc.blacklist(bob);
        _run(id, alice, keccak256("a1"), 10_000); // 400_000
        _run(id, alice, keccak256("a2"), 5_000); // 200_000
        _run(id, bob, keccak256("b1"), 4_500); // 180_000
        _run(id, carol, keccak256("c1"), 9_000); // paid at once

        assertEq(thenar.claimable(alice), 600_000);
        assertEq(thenar.claimable(bob), 180_000);
        assertEq(thenar.claimable(carol), 0);
        assertEq(usdc.balanceOf(carol), 360_000);
        assertEq(thenar.claimableTotal(), 780_000);
        // Solvency: what the protocol holds is escrow plus claims, to the unit.
        assertEq(usdc.balanceOf(address(thenar)), thenar.getTask(id).escrow + thenar.claimableTotal());

        usdc.unBlacklist(bob);
        vm.prank(bob);
        thenar.claim();
        assertEq(thenar.claimableTotal(), 600_000);
        assertEq(usdc.balanceOf(address(thenar)), thenar.getTask(id).escrow + thenar.claimableTotal());

        usdc.unBlacklist(alice);
        vm.prank(alice);
        thenar.claim();
        assertEq(thenar.claimableTotal(), 0);
        assertEq(usdc.balanceOf(alice), 600_000);
        assertEq(usdc.balanceOf(address(thenar)), thenar.getTask(id).escrow);
    }

    // ================================================================
    // Policies and licences
    // ================================================================

    function _three() internal view returns (address[] memory who, uint16[] memory scores) {
        who = new address[](3);
        who[0] = alice;
        who[1] = bob;
        who[2] = carol;
        scores = new uint16[](3);
        scores[0] = 9_000;
        scores[1] = 8_000;
        scores[2] = 7_000;
    }

    function test_mintPolicy_requiresAFilledTask_andSnapshotsTheCapTable() public {
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.NoSuchTask.selector, 0));
        thenar.mintPolicy(0, 1e6);

        uint256 id = _task(3, REWARD * 3);
        _run(id, alice, keccak256("1"), 9_000);
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.NotFilled.selector);
        thenar.mintPolicy(id, 1e6);
        _run(id, alice, keccak256("2"), 9_000);
        _run(id, bob, keccak256("3"), 6_000);

        vm.expectEmit(address(thenar));
        emit ThenarProtocol.PolicyMinted(0, id, 2, 5e6);
        vm.prank(funder);
        uint256 pid = thenar.mintPolicy(id, 5e6);
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.AlreadyMinted.selector);
        thenar.mintPolicy(id, 5e6);

        ThenarProtocol.Policy memory p = thenar.getPolicy(pid);
        assertEq(p.taskId, id);
        assertEq(p.minter, funder);
        assertEq(p.trajectories, 3);
        assertEq(p.licenceFee, 5e6);
        (bool minted, uint256 fromTask) = thenar.policyOfTask(id);
        assertTrue(minted);
        assertEq(fromTask, pid);
        assertTrue(thenar.getTask(id).policyMinted);

        (address[] memory who, uint256[] memory bps, uint256[] memory payout) = thenar.capTable(pid);
        assertEq(who.length, 2);
        assertEq(who[0], alice);
        assertEq(who[1], bob);
        assertEq(bps[0], 7_500, "18000 of 24000 weight");
        assertEq(bps[1], 2_500);
        // 5 USDC less 2.5% protocol fee = 4.875 USDC to split 3:1.
        assertEq(payout[0], 3_656_250);
        assertEq(payout[1], 1_218_750);

        // A minted task takes no more runs.
        bytes32 h = keccak256("late");
        bytes memory sig = _sign(id, carol, h, 9_000);
        vm.prank(carol);
        vm.expectRevert(ThenarProtocol.TaskClosed.selector);
        thenar.submitTrajectory(id, h, CID, 9_000, sig);
    }

    function test_licensePolicy_paysContributorsProRata_andDustToTheTreasury() public {
        (address[] memory who, uint16[] memory scores) = _three();
        // A fee that doesn't split evenly: 1.000001 USDC.
        (, uint256 pid) = _filledPolicy(who, scores, 1_000_001);
        uint256 aliceBefore = usdc.balanceOf(alice);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);
        uint256 held = usdc.balanceOf(address(thenar));

        address buyer = makeAddr("buyer");
        _fundAndApprove(buyer, 5e6);
        // fee = 25_000 (2.5%); pool = 975_001 split 9:8:7 → 365_625 + 325_000 + 284_375 = 975_000; 1 unit of dust.
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.ContributorPaid(pid, alice, 365_625);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.ContributorPaid(pid, bob, 325_000);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.ContributorPaid(pid, carol, 284_375);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.PolicyLicensed(pid, buyer, 1_000_001, 3);
        vm.expectEmit(address(thenar));
        emit ThenarProtocol.Licensed(pid, buyer, buyer, 1_000_001);
        vm.prank(buyer);
        thenar.licensePolicy(pid);

        assertEq(usdc.balanceOf(alice) - aliceBefore, 365_625);
        assertEq(usdc.balanceOf(bob) - bobBefore, 325_000);
        assertEq(usdc.balanceOf(carol) - carolBefore, 284_375);
        assertEq(usdc.balanceOf(treasury), 25_001, "protocol fee plus the rounding dust");
        assertEq(usdc.balanceOf(buyer), 5e6 - 1_000_001);
        assertEq(usdc.balanceOf(address(thenar)), held, "nothing from a licence stays in the protocol");
        assertTrue(thenar.licensed(pid, buyer));

        ThenarProtocol.Policy memory p = thenar.getPolicy(pid);
        assertEq(p.licencesSold, 1);
        assertEq(p.distributed, 975_000);

        // A second licence pays again.
        vm.prank(buyer);
        thenar.licensePolicy(pid);
        assertEq(thenar.getPolicy(pid).licencesSold, 2);
        assertEq(usdc.balanceOf(treasury), 50_002);
    }

    function testFuzz_licence_conservesEveryUnit(uint128 fee, uint16 s1, uint16 s2, uint16 s3) public {
        fee = uint128(bound(fee, 0, 100_000e6));
        address[] memory who = new address[](3);
        who[0] = alice;
        who[1] = bob;
        who[2] = carol;
        uint16[] memory scores = new uint16[](3);
        scores[0] = uint16(bound(s1, 4_000, 10_000));
        scores[1] = uint16(bound(s2, 4_000, 10_000));
        scores[2] = uint16(bound(s3, 4_000, 10_000));
        (, uint256 pid) = _filledPolicy(who, scores, fee);
        uint256 a = usdc.balanceOf(alice);
        uint256 b = usdc.balanceOf(bob);
        uint256 c = usdc.balanceOf(carol);
        address buyer = makeAddr("buyer");
        _fundAndApprove(buyer, fee);
        vm.prank(buyer);
        thenar.licensePolicy(pid);
        uint256 toContributors = (usdc.balanceOf(alice) - a) + (usdc.balanceOf(bob) - b) + (usdc.balanceOf(carol) - c);
        assertEq(toContributors + usdc.balanceOf(treasury), fee, "every unit lands somewhere");
        assertEq(thenar.getPolicy(pid).distributed, toContributors);
        assertGe(usdc.balanceOf(treasury), (uint256(fee) * 250) / 10_000);
        assertLe(usdc.balanceOf(treasury), (uint256(fee) * 250) / 10_000 + 3, "dust is under one unit per contributor");
    }

    function test_licensePolicy_refusesAMissingPolicy() public {
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.NoPolicy.selector);
        thenar.licensePolicy(0);
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.NoPolicy.selector);
        thenar.licensePolicyFor(0, alice);
    }

    function test_licensePolicy_withoutApprovalReverts() public {
        (address[] memory who, uint16[] memory scores) = _three();
        (, uint256 pid) = _filledPolicy(who, scores, 1e6);
        usdc.mint(stranger, 5e6);
        vm.prank(stranger);
        vm.expectRevert();
        thenar.licensePolicy(pid);
        assertFalse(thenar.licensed(pid, stranger));
    }

    function test_licensePolicyFor_licensesTheNamedBuyer_paidByTheCaller() public {
        (address[] memory who, uint16[] memory scores) = _three();
        (, uint256 pid) = _filledPolicy(who, scores, 2e6);
        address payer = makeAddr("ccip receiver");
        address licensee = makeAddr("buyer agent on Base");
        _fundAndApprove(payer, 10e6);

        vm.expectEmit(address(thenar));
        emit ThenarProtocol.Licensed(pid, licensee, payer, 2e6);
        vm.prank(payer);
        thenar.licensePolicyFor(pid, licensee);

        assertTrue(thenar.licensed(pid, licensee), "the named buyer holds the licence");
        assertFalse(thenar.licensed(pid, payer), "the payer does not");
        assertEq(usdc.balanceOf(payer), 8e6, "the fee came from the caller");
        assertEq(usdc.balanceOf(licensee), 0);
        assertEq(usdc.balanceOf(treasury), 50_000);

        vm.prank(payer);
        vm.expectRevert(ThenarProtocol.ZeroAddress.selector);
        thenar.licensePolicyFor(pid, address(0));
    }

    function test_licence_toABlocklistedContributorIsDeferred_andTheRestArePaid() public {
        (address[] memory who, uint16[] memory scores) = _three();
        (, uint256 pid) = _filledPolicy(who, scores, 2_400_000);
        uint256 bobBefore = usdc.balanceOf(bob);
        uint256 carolBefore = usdc.balanceOf(carol);
        usdc.blacklist(alice);
        usdc.blacklist(treasury);
        address buyer = makeAddr("buyer");
        _fundAndApprove(buyer, 5e6);

        // fee 60_000; pool 2_340_000 split 9:8:7 → 877_500 / 780_000 / 682_500.
        vm.prank(buyer);
        thenar.licensePolicy(pid);
        assertTrue(thenar.licensed(pid, buyer), "the sale stands");
        assertEq(thenar.claimable(alice), 877_500);
        assertEq(thenar.claimable(treasury), 60_000);
        assertEq(thenar.claimableTotal(), 937_500);
        assertEq(usdc.balanceOf(bob) - bobBefore, 780_000);
        assertEq(usdc.balanceOf(carol) - carolBefore, 682_500);

        usdc.unBlacklist(alice);
        vm.prank(alice);
        thenar.claim();
        assertEq(thenar.claimableTotal(), 60_000);
    }

    // ================================================================
    // Views
    // ================================================================

    function test_trajectoryOfHash_resolvesARunId() public {
        (bool found, uint256 tid) = thenar.trajectoryOfHash(keccak256("unknown"));
        assertFalse(found);
        assertEq(tid, 0);

        uint256 id = _task(4, REWARD * 4);
        bytes32 h0 = keccak256("first");
        bytes32 h1 = keccak256("second");
        _run(id, alice, h0, 9_000);
        _run(id, bob, h1, 8_000);

        (found, tid) = thenar.trajectoryOfHash(h0);
        assertTrue(found, "trajectory 0 is found, not mistaken for missing");
        assertEq(tid, 0);
        (found, tid) = thenar.trajectoryOfHash(h1);
        assertTrue(found);
        assertEq(tid, 1);
        assertEq(thenar.getTrajectory(tid).trajHash, h1);
    }

    function test_getTrajectory_recordsTheRun() public {
        uint256 id = _task(4, REWARD * 4);
        vm.roll(1234);
        bytes32 h = keccak256("recorded");
        uint256 tid = _run(id, alice, h, 9_500);
        ThenarProtocol.Trajectory memory t = thenar.getTrajectory(tid);
        assertEq(t.taskId, id);
        assertEq(t.contributor, alice);
        assertEq(t.trajHash, h);
        assertEq(t.cid, CID);
        assertEq(t.score, 9_500);
        assertEq(t.paid, 380_000);
        assertEq(t.at, block.timestamp);
        assertEq(t.atBlock, 1234);
        assertTrue(thenar.trajectoryUsed(h));
        assertEq(thenar.weightOnTask(id, alice), 9_500);
    }

    function test_listsAndStats() public {
        uint256 a = _task(4, REWARD * 4);
        uint256 b = _task(4, REWARD * 4);
        _task(4, REWARD * 4);
        _run(a, alice, keccak256("a1"), 9_000);
        _run(b, alice, keccak256("b1"), 7_000);
        _run(b, bob, keccak256("b2"), 8_000);

        ThenarProtocol.Task[] memory page = thenar.getTasks(1, 5);
        assertEq(page.length, 2);
        assertEq(page[0].slotsFilled, 2);
        assertEq(thenar.getTasks(3, 5).length, 0);
        assertEq(thenar.trajectoryCount(), 3);
        assertEq(thenar.policyCount(), 0);

        uint256[] memory mine = thenar.trajectoriesOf(alice);
        assertEq(mine.length, 2);
        assertEq(mine[1], 1);
        uint256[] memory onB = thenar.taskTrajectories(b);
        assertEq(onB.length, 2);
        assertEq(onB[0], 1);
        assertEq(onB[1], 2);
        address[] memory cs = thenar.contributorsOf(b);
        assertEq(cs.length, 2);
        assertEq(cs[0], alice);

        (uint256 runs, uint256 earned, uint256 mean) = thenar.stats(alice);
        assertEq(runs, 2);
        assertEq(earned, 360_000 + 280_000);
        assertEq(mean, 8_000);
        (runs, earned, mean) = thenar.stats(stranger);
        assertEq(runs + earned + mean, 0);
    }

    function test_runDigest_isEip712UnderThenarV1() public view {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Thenar"),
                keccak256("1"),
                block.chainid,
                address(thenar)
            )
        );
        assertEq(thenar.domainSeparator(), domain);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Run(uint256 taskId,address contributor,bytes32 trajHash,string cid,uint16 score)"),
                uint256(3),
                alice,
                keccak256("h"),
                keccak256(bytes(CID)),
                uint16(9_000)
            )
        );
        assertEq(
            thenar.runDigest(3, alice, keccak256("h"), CID, 9_000),
            keccak256(abi.encodePacked("\x19\x01", domain, structHash))
        );
    }

    // ------------------------------------------- fixes from the review

    function test_closeTask_onAFilledTask_returnsWhatImperfectRunsLeft() public {
        uint256 id = _task(4, REWARD * 4); // no deadline
        for (uint256 i; i < 4; ++i) {
            _run(id, i % 2 == 0 ? alice : bob, keccak256(abi.encode("filled", i)), 9_000);
        }
        uint256 before = usdc.balanceOf(funder);
        vm.prank(funder);
        uint256 refunded = thenar.closeTask(id);
        assertEq(refunded, REWARD * 4 - (uint256(REWARD) * 9_000 / 10_000) * 4, "the 10% each run left behind");
        assertEq(usdc.balanceOf(funder), before + refunded);
        assertEq(thenar.getTask(id).escrow, 0);
    }

    function test_closeTask_onAnOpenTaskWithoutDeadline_stillRefuses() public {
        uint256 id = _task(4, REWARD * 4);
        _run(id, alice, keccak256("one"), 9_000);
        vm.prank(funder);
        vm.expectRevert(ThenarProtocol.NotExpired.selector);
        thenar.closeTask(id);
    }

    function test_closeTask_unknownTask_isNoSuchTask() public {
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(ThenarProtocol.NoSuchTask.selector, 42));
        thenar.closeTask(42);
    }

    function test_mintPolicy_onlyTheFunderSetsTheLicenceFee() public {
        uint256 id = _task(1, REWARD);
        _run(id, alice, keccak256("only"), 10_000);
        vm.prank(stranger);
        vm.expectRevert(ThenarProtocol.NotFunder.selector);
        thenar.mintPolicy(id, 0);
        vm.prank(funder);
        thenar.mintPolicy(id, 1e6);
        assertEq(thenar.getPolicy(0).licenceFee, 1e6);
    }
}
