// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ContributionRecord} from "../src/ContributionRecord.sol";
import {ThenarBase} from "./utils/ThenarBase.sol";

contract ContributionRecordTest is ThenarBase {
    ContributionRecord rec;
    uint256 task;

    function setUp() public {
        _deploy(address(0));
        rec = new ContributionRecord(address(thenar));
        task = _task(10, uint256(REWARD) * 10);
    }

    function _work(address who, bytes32 h, uint16 score) internal {
        _run(task, who, h, score);
    }

    function test_mirrorsWhatTheProtocolRecorded() public {
        _work(alice, keccak256("a1"), 9000);
        _work(alice, keccak256("a2"), 8000);
        vm.expectEmit(address(rec));
        emit ContributionRecord.Synced(alice, 17000, 17000);
        rec.sync(alice);
        assertEq(rec.balanceOf(alice), 17000, "the protocol's own total");
        assertEq(rec.totalSupply(), 17000);
        assertEq(rec.balanceOf(alice), thenar.totalScore(alice));
    }

    function test_syncingTwiceAddsOnlyTheNewWork() public {
        _work(alice, keccak256("a1"), 9000);
        rec.sync(alice);
        _work(alice, keccak256("a2"), 8000);
        assertEq(rec.pending(alice), 8000, "only the run since the last sync");
        rec.sync(alice);
        assertEq(rec.balanceOf(alice), 17000);
        assertEq(rec.pending(alice), 0);
        vm.expectRevert(ContributionRecord.NothingToSync.selector);
        rec.sync(alice);
    }

    function test_nothingRecordedNothingToSync() public {
        vm.expectRevert(ContributionRecord.NothingToSync.selector);
        rec.sync(bob);
    }

    function test_anyoneMaySyncAnyone() public {
        _work(alice, keccak256("a1"), 9000);
        // Bob syncs alice. Nothing is gained by it, and requiring alice to do
        // it would leave people who never came back permanently understated.
        vm.prank(bob);
        rec.sync(alice);
        assertEq(rec.balanceOf(alice), 9000);
        assertEq(rec.balanceOf(bob), 0);
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
