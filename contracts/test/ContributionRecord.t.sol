// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {ContributionRecord} from "../src/ContributionRecord.sol";

contract ContributionRecordTest is Test {
    AxonProtocolV2 axon;
    ContributionRecord rec;

    uint256 verifierKey = 0xA11CE;
    address verifier;
    address funder = address(0xF00D);
    address alice = address(0xA1);
    address bob = address(0xB0);
    uint128 constant REWARD = 0.1 ether;
    uint256 task;

    function setUp() public {
        verifier = vm.addr(verifierKey);
        axon = new AxonProtocolV2(verifier, address(0xBEEF), address(new PasskeyRegistry()));
        rec = new ContributionRecord(address(axon));
        vm.deal(funder, 100 ether);
        vm.prank(funder);
        task = axon.createTask{value: REWARD * 10}("Task", 10, REWARD, 1, 3);
    }

    function _work(address who, bytes32 h, uint16 score) internal {
        bytes32 d = axon.runDigest(task, who, h, "ipfs://cid", score);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, d);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(who);
        axon.submitTrajectory(task, h, "ipfs://cid", score, sig);
    }

    function test_mirrorsWhatTheProtocolRecorded() public {
        _work(alice, keccak256("a1"), 9000);
        _work(alice, keccak256("a2"), 8000);
        rec.sync(alice);
        assertEq(rec.balanceOf(alice), 17000, "the protocol's own total");
        assertEq(rec.totalSupply(), 17000);
    }

    function test_syncingTwiceAddsOnlyTheNewWork() public {
        _work(alice, keccak256("a1"), 9000);
        rec.sync(alice);
        _work(alice, keccak256("a2"), 8000);
        assertEq(rec.pending(alice), 8000, "only the run since the last sync");
        rec.sync(alice);
        assertEq(rec.balanceOf(alice), 17000);
        vm.expectRevert(ContributionRecord.NothingToSync.selector);
        rec.sync(alice);
    }

    function test_anyoneMaySyncAnyone() public {
        _work(alice, keccak256("a1"), 9000);
        // Bob syncs alice. Nothing is gained by it, and requiring alice to do
        // it would leave people who never came back permanently understated.
        vm.prank(bob);
        rec.sync(alice);
        assertEq(rec.balanceOf(alice), 9000);
    }

    function test_itCannotBeMoved() public {
        _work(alice, keccak256("a1"), 9000);
        rec.sync(alice);
        vm.startPrank(alice);
        vm.expectRevert(ContributionRecord.NotTransferable.selector);
        rec.transfer(bob, 1);
        vm.expectRevert(ContributionRecord.NotTransferable.selector);
        rec.approve(bob, 1);
        vm.expectRevert(ContributionRecord.NotTransferable.selector);
        rec.transferFrom(alice, bob, 1);
        vm.stopPrank();
        assertEq(rec.balanceOf(alice), 9000, "still alice's");
        assertEq(rec.balanceOf(bob), 0, "and never bob's");
        assertEq(rec.allowance(alice, bob), 0, "nothing is ever spendable on anyone's behalf");
    }

    function test_hasNoDivisibility() public view {
        // Divisibility is what money needs. A count of recorded score has no
        // use for it, and implying otherwise is how this becomes a currency.
        assertEq(rec.decimals(), 0);
    }
}
