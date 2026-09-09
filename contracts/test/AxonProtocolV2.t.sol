// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";

/**
 * The three things v2 exists for.
 *
 * Everything else it does is v1's behaviour and is covered by v1's suite; a
 * redeploy is only worth making for changes to what the contract will accept,
 * so those are what is tested here — including, in each case, the thing that
 * must still be refused.
 */
contract AxonProtocolV2Test is Test {
    AxonProtocolV2 axon;
    PasskeyRegistry registry;

    uint256 verifierKey = 0xA11CE;
    address verifier;
    address treasury = address(0xBEEF);
    address funder = address(0xF00D);
    address alice = address(0xA1);
    address relayer = address(0xEE);
    address stranger = address(0x51);

    uint128 constant REWARD = 0.4 ether;

    function setUp() public {
        verifier = vm.addr(verifierKey);
        registry = new PasskeyRegistry();
        axon = new AxonProtocolV2(verifier, treasury, address(registry));
        vm.deal(funder, 100 ether);
        vm.deal(alice, 1 ether);
        vm.deal(relayer, 1 ether);
        vm.deal(stranger, 1 ether);
    }

    function _sign(uint256 taskId, address who, bytes32 h, uint16 score)
        internal view returns (bytes memory)
    {
        bytes32 digest = axon.runDigest(taskId, who, h, "ipfs://cid", score);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------- expiry and refund

    function test_closeTask_refundsUnspentEscrowAfterTheDeadline() public {
        vm.prank(funder);
        uint256 id = axon.createTaskUntil{value: REWARD * 4}("Task", 4, REWARD, 1, 3,
            uint64(block.timestamp + 7 days));

        uint256 before = funder.balance;
        vm.warp(block.timestamp + 8 days);
        vm.prank(funder);
        uint256 refunded = axon.closeTask(id);

        assertEq(refunded, REWARD * 4, "the whole escrow comes back");
        assertEq(funder.balance, before + REWARD * 4, "and it reaches the funder");
    }

    function test_closeTask_refundsOnlyWhatRunsDidNotTake() public {
        vm.prank(funder);
        uint256 id = axon.createTaskUntil{value: REWARD * 4}("Task", 4, REWARD, 1, 3,
            uint64(block.timestamp + 1 days));

        bytes32 h = keccak256("run");
        // Signed before the prank, not inside the call: arguments evaluate
        // first, so `_sign` would otherwise consume the prank on its own view
        // call and the submit would arrive from the test contract instead.
        bytes memory sig = _sign(id, alice, h, 10_000);
        vm.prank(alice);
        axon.submitTrajectory(id, h, "ipfs://cid", 10_000, sig);

        vm.warp(block.timestamp + 2 days);
        vm.prank(funder);
        uint256 refunded = axon.closeTask(id);

        // One perfect run took one full reward; the rest is the funder's.
        assertEq(refunded, REWARD * 3, "only the unspent part");
    }

    function test_closeTask_refusesBeforeTheDeadline() public {
        vm.prank(funder);
        uint256 id = axon.createTaskUntil{value: REWARD}("Task", 1, REWARD, 1, 3,
            uint64(block.timestamp + 7 days));
        vm.prank(funder);
        vm.expectRevert(AxonProtocolV2.NotExpired.selector);
        axon.closeTask(id);
    }

    function test_closeTask_refusesAnyoneButTheFunder() public {
        vm.prank(funder);
        uint256 id = axon.createTaskUntil{value: REWARD}("Task", 1, REWARD, 1, 3,
            uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        vm.prank(stranger);
        vm.expectRevert(AxonProtocolV2.NotFunder.selector);
        axon.closeTask(id);
    }

    function test_closeTask_refusesTwice() public {
        vm.prank(funder);
        uint256 id = axon.createTaskUntil{value: REWARD}("Task", 1, REWARD, 1, 3,
            uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days);
        vm.startPrank(funder);
        axon.closeTask(id);
        vm.expectRevert(AxonProtocolV2.AlreadyClosed.selector);
        axon.closeTask(id);
        vm.stopPrank();
    }

    function test_taskWithoutADeadlineNeverCloses() public {
        // v1's behaviour, kept: a funder who wants no deadline is not made to
        // invent one, and cannot then reclaim escrow out from under operators.
        vm.prank(funder);
        uint256 id = axon.createTask{value: REWARD}("Task", 1, REWARD, 1, 3);
        vm.warp(block.timestamp + 3650 days);
        vm.prank(funder);
        vm.expectRevert(AxonProtocolV2.NotExpired.selector);
        axon.closeTask(id);
    }

    // ------------------------------------------------ delegated submission

    function test_submitFor_paysTheOperatorAndNotTheRelayer() public {
        vm.prank(funder);
        uint256 id = axon.createTask{value: REWARD * 2}("Task", 2, REWARD, 1, 3);

        bytes32 h = keccak256("relayed");
        uint256 operatorBefore = alice.balance;
        uint256 relayerBefore = relayer.balance;

        vm.prank(relayer);
        axon.submitTrajectoryFor(alice, id, h, "ipfs://cid", 10_000, _sign(id, alice, h, 10_000));

        assertEq(alice.balance, operatorBefore + REWARD, "the operator is paid");
        assertEq(relayer.balance, relayerBefore, "the relayer is not");
        assertEq(axon.totalRuns(alice), 1, "and the run is credited to the operator");
        assertEq(axon.totalRuns(relayer), 0);
    }

    function test_submitFor_cannotBeUsedToCreditSomeoneElse() public {
        vm.prank(funder);
        uint256 id = axon.createTask{value: REWARD * 2}("Task", 2, REWARD, 1, 3);

        // A signature the verifier issued for alice cannot be redirected to
        // the relayer: the contributor is inside the signed digest.
        bytes32 h = keccak256("stolen");
        bytes memory forAlice = _sign(id, alice, h, 10_000);

        vm.prank(relayer);
        vm.expectRevert(AxonProtocolV2.BadSignature.selector);
        axon.submitTrajectoryFor(relayer, id, h, "ipfs://cid", 10_000, forAlice);
    }

    function test_submitFor_stillRefusesAnUnsignedScore() public {
        vm.prank(funder);
        uint256 id = axon.createTask{value: REWARD * 2}("Task", 2, REWARD, 1, 3);
        bytes32 h = keccak256("forged");
        bytes memory sig = _sign(id, alice, h, 5_000);

        vm.prank(relayer);
        vm.expectRevert(AxonProtocolV2.BadSignature.selector);
        axon.submitTrajectoryFor(alice, id, h, "ipfs://cid", 10_000, sig);
    }

    // ------------------------------------------------------ passkey digest

    function test_passkey_verifiesTheHashOfTheTrajectory() public {
        // The registry is asked for sha256(trajHash), not trajHash. Asserted
        // by watching the call rather than by reading the source, because the
        // whole of v1's passkey bug was a digest that looked right in the
        // source and was wrong on the wire.
        vm.prank(funder);
        uint256 id = axon.createTask{value: REWARD}("Task", 1, REWARD, 1, 3);
        bytes32 h = keccak256("passkey run");

        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(PasskeyRegistry.hasPasskey.selector, alice),
            abi.encode(true)
        );
        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(
                PasskeyRegistry.verify.selector, alice, sha256(abi.encodePacked(h)), bytes32(0), bytes32(0)
            ),
            abi.encode(true)
        );

        bytes memory sig = _sign(id, alice, h, 10_000);
        vm.prank(alice);
        axon.submitTrajectoryWithPasskey(id, h, "ipfs://cid", 10_000, sig, bytes32(0), bytes32(0));
        assertEq(axon.totalRuns(alice), 1, "the run was recorded through the passkey path");
    }

    function test_passkey_refusesASignatureOverTheRawHash() public {
        // What v1 asked for. It must not be accepted here, or the fix is a
        // widening rather than a correction.
        vm.prank(funder);
        uint256 id = axon.createTask{value: REWARD}("Task", 1, REWARD, 1, 3);
        bytes32 h = keccak256("passkey run");

        vm.mockCall(
            address(registry),
            abi.encodeWithSelector(PasskeyRegistry.hasPasskey.selector, alice),
            abi.encode(true)
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
        vm.expectRevert(AxonProtocolV2.BadPasskeySignature.selector);
        axon.submitTrajectoryWithPasskey(id, h, "ipfs://cid", 10_000, sig, bytes32(0), bytes32(0));
    }
}
