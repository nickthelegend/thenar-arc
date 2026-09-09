// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {PrizePool} from "../src/PrizePool.sol";

contract PrizePoolTest is Test {
    AxonProtocolV2 axon;
    PrizePool pool;

    uint256 verifierKey = 0xA11CE;
    address verifier;
    address funder = address(0xF00D);
    address alice = address(0xA1);
    address bob = address(0xB0);
    address idler = address(0x1D);
    uint128 constant REWARD = 0.4 ether;
    uint256 taskId;

    function setUp() public {
        verifier = vm.addr(verifierKey);
        axon = new AxonProtocolV2(verifier, address(0xBEEF), address(new PasskeyRegistry()));
        vm.deal(funder, 100 ether);
        vm.prank(funder);
        taskId = axon.createTask{value: REWARD * 8}("Task", 8, REWARD, 1, 3);
        pool = new PrizePool{value: 10 ether}(address(axon), taskId, uint64(block.timestamp + 7 days));
    }

    function _submit(address who, bytes32 h, uint16 score) internal {
        bytes32 digest = axon.runDigest(taskId, who, h, "ipfs://cid", score);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(who);
        axon.submitTrajectory(taskId, h, "ipfs://cid", score, sig);
    }

    function test_splitsByWorkTheProtocolRecorded() public {
        _submit(alice, keccak256("a1"), 9000);
        _submit(alice, keccak256("a2"), 9000);
        _submit(bob, keccak256("b1"), 6000);

        vm.prank(alice); pool.enter();
        vm.prank(bob); pool.enter();

        uint256 aBefore = alice.balance;
        uint256 bBefore = bob.balance;
        vm.warp(block.timestamp + 8 days);
        pool.settle();

        // 18000 against 6000: three quarters and one quarter of ten ether.
        assertEq(alice.balance - aBefore, 7.5 ether, "alice's share");
        assertEq(bob.balance - bBefore, 2.5 ether, "bob's share");
    }

    function test_enteringWithNoRecordedWorkReverts() public {
        vm.prank(idler);
        vm.expectRevert(PrizePool.NoRecordedWork.selector);
        pool.enter();
    }

    function test_nobodyCanBeOmittedByAnyoneElse() public {
        _submit(alice, keccak256("a1"), 9000);
        _submit(bob, keccak256("b1"), 9000);

        // Alice settles. She cannot leave bob out — she never supplies a list;
        // bob entered himself and the contract already holds his weight.
        vm.prank(alice); pool.enter();
        vm.prank(bob); pool.enter();
        uint256 bBefore = bob.balance;
        vm.warp(block.timestamp + 8 days);
        vm.prank(alice);
        pool.settle();
        assertEq(bob.balance - bBefore, 5 ether, "bob was paid regardless of who settled");
    }

    function test_enteringTwiceChangesNothing() public {
        _submit(alice, keccak256("a1"), 9000);
        vm.startPrank(alice);
        pool.enter();
        vm.expectRevert(PrizePool.AlreadyEntered.selector);
        pool.enter();
        vm.stopPrank();
        assertEq(pool.entrantCount(), 1);
    }

    function test_aLateRunCannotDiluteWhoAlreadyEntered() public {
        _submit(alice, keccak256("a1"), 9000);
        vm.prank(alice); pool.enter();

        // Alice records more work after entering. Her share is fixed at what
        // it was when she entered, or entering early would be a mistake.
        _submit(alice, keccak256("a2"), 9000);
        assertEq(pool.weightOf(alice), 9000, "the weight is the one at entry");
    }

    function test_cannotSettleBeforeEntryCloses() public {
        _submit(alice, keccak256("a1"), 9000);
        vm.prank(alice); pool.enter();
        vm.expectRevert(PrizePool.NotClosedYet.selector);
        pool.settle();
    }

    function test_cannotSettleTwice() public {
        _submit(alice, keccak256("a1"), 9000);
        vm.prank(alice); pool.enter();
        vm.warp(block.timestamp + 8 days);
        pool.settle();
        vm.expectRevert(PrizePool.AlreadySettled.selector);
        pool.settle();
    }

    function test_anyoneCanTopUpThePot() public {
        address sponsor = address(0x5EED);
        vm.deal(sponsor, 5 ether);
        vm.prank(sponsor);
        (bool ok, ) = payable(address(pool)).call{value: 5 ether}("");
        assertTrue(ok);
        assertEq(address(pool).balance, 15 ether, "a prize with one sponsor is not much of a prize");
    }
}
