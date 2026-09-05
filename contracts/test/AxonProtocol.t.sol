// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxonProtocol} from "../src/AxonProtocol.sol";

contract AxonProtocolTest is Test {
    AxonProtocol axon;

    uint256 verifierKey = 0xA11CE;
    address verifier;
    address treasury = address(0xBEEF);
    address funder = address(0xF00D);

    address alice = address(0xA1);
    address bob = address(0xB0);
    address carol = address(0xCA);

    uint128 constant REWARD = 0.4 ether;

    function setUp() public {
        verifier = vm.addr(verifierKey);
        axon = new AxonProtocol(verifier, treasury);
        vm.deal(funder, 100 ether);
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
        vm.deal(carol, 10 ether);
    }

    function _task(uint32 slots) internal returns (uint256 id) {
        vm.prank(funder);
        id = axon.createTask{value: REWARD * slots}("Put the pen in the drawer", slots, REWARD, 1, 3);
    }

    function _sign(uint256 taskId, address who, bytes32 h, string memory cid, uint16 score)
        internal view returns (bytes memory)
    {
        bytes32 digest = axon.runDigest(taskId, who, h, cid, score);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _submit(uint256 taskId, address who, bytes32 h, uint16 score) internal returns (uint256) {
        bytes memory sig = _sign(taskId, who, h, "ipfs://cid", score);
        vm.prank(who);
        return axon.submitTrajectory(taskId, h, "ipfs://cid", score, sig);
    }

    // ------------------------------------------------------------ tasks

    function test_createTask_escrowsAndEmits() public {
        uint256 id = _task(10);
        AxonProtocol.Task memory t = axon.getTask(id);
        assertEq(t.slotsTotal, 10);
        assertEq(t.slotsFilled, 0);
        assertEq(t.escrow, REWARD * 10);
        assertEq(t.rewardPerTrajectory, REWARD);
        assertEq(address(axon).balance, REWARD * 10);
    }

    function test_createTask_rejectsUnderfunded() public {
        vm.prank(funder);
        vm.expectRevert(AxonProtocol.Underfunded.selector);
        axon.createTask{value: REWARD - 1}("x", 5, REWARD, 1, 1);
    }

    function test_createTask_rejectsZeroSlots() public {
        vm.prank(funder);
        vm.expectRevert(AxonProtocol.ZeroSlots.selector);
        axon.createTask{value: REWARD}("x", 0, REWARD, 1, 1);
    }

    // ------------------------------------------------------- submission

    function test_submit_paysInTheSameCall() public {
        uint256 id = _task(10);
        uint256 before = alice.balance;

        _submit(id, alice, keccak256("run-1"), 9000);

        uint256 expected = (uint256(REWARD) * 9000) / 10_000;
        assertEq(alice.balance - before, expected, "operator paid in the submit call");

        AxonProtocol.Task memory t = axon.getTask(id);
        assertEq(t.slotsFilled, 1);
        assertEq(t.escrow, REWARD * 10 - expected);
        assertEq(axon.totalRuns(alice), 1);
        assertEq(axon.totalEarned(alice), expected);
    }

    function test_submit_rejectsForgedScore() public {
        uint256 id = _task(10);
        // Signature is for 5000; the caller tries to submit 10000.
        bytes memory sig = _sign(id, alice, keccak256("r"), "ipfs://cid", 5000);
        vm.prank(alice);
        vm.expectRevert(AxonProtocol.BadSignature.selector);
        axon.submitTrajectory(id, keccak256("r"), "ipfs://cid", 10_000, sig);
    }

    function test_submit_rejectsSignatureIssuedForSomeoneElse() public {
        uint256 id = _task(10);
        bytes memory sig = _sign(id, alice, keccak256("r"), "ipfs://cid", 9000);
        vm.prank(bob);
        vm.expectRevert(AxonProtocol.BadSignature.selector);
        axon.submitTrajectory(id, keccak256("r"), "ipfs://cid", 9000, sig);
    }

    function test_submit_rejectsReplay() public {
        uint256 id = _task(10);
        _submit(id, alice, keccak256("same"), 9000);
        bytes memory sig = _sign(id, bob, keccak256("same"), "ipfs://cid", 9000);
        vm.prank(bob);
        vm.expectRevert(AxonProtocol.AlreadySubmitted.selector);
        axon.submitTrajectory(id, keccak256("same"), "ipfs://cid", 9000, sig);
    }

    function test_submit_rejectsBelowFloor() public {
        uint256 id = _task(10);
        bytes memory sig = _sign(id, alice, keccak256("r"), "ipfs://cid", 3999);
        vm.prank(alice);
        vm.expectRevert(AxonProtocol.ScoreTooLow.selector);
        axon.submitTrajectory(id, keccak256("r"), "ipfs://cid", 3999, sig);
    }

    function test_submit_enforcesPerAccountCap() public {
        uint256 id = _task(50);
        for (uint256 i; i < 5; ++i) {
            _submit(id, alice, keccak256(abi.encode("a", i)), 8000);
        }
        bytes32 h = keccak256("a-6");
        bytes memory sig = _sign(id, alice, h, "ipfs://cid", 8000);
        vm.prank(alice);
        vm.expectRevert(AxonProtocol.CapReached.selector);
        axon.submitTrajectory(id, h, "ipfs://cid", 8000, sig);
    }

    function test_submit_exhaustsSlots() public {
        uint256 id = _task(2);
        _submit(id, alice, keccak256("1"), 8000);
        _submit(id, bob, keccak256("2"), 8000);

        bytes32 h = keccak256("3");
        bytes memory sig = _sign(id, carol, h, "ipfs://cid", 8000);
        vm.prank(carol);
        vm.expectRevert(AxonProtocol.NoSlots.selector);
        axon.submitTrajectory(id, h, "ipfs://cid", 8000, sig);
    }

    // ---------------------------------------------------------- policies

    function _fillTask() internal returns (uint256 id) {
        id = _task(3);
        _submit(id, alice, keccak256("p1"), 9000);
        _submit(id, bob, keccak256("p2"), 6000);
        _submit(id, alice, keccak256("p3"), 5000);
    }

    function test_mintPolicy_snapshotsWeightedCapTable() public {
        uint256 id = _fillTask();
        uint256 pid = axon.mintPolicy(id, 4 ether);

        (address[] memory who, uint256[] memory bps, ) = axon.capTable(pid);
        assertEq(who.length, 2);
        assertEq(who[0], alice);
        assertEq(who[1], bob);
        // alice 9000+5000 = 14000, bob 6000, total 20000
        assertEq(bps[0], 7000);
        assertEq(bps[1], 3000);
    }

    function test_mintPolicy_requiresFilled() public {
        uint256 id = _task(3);
        _submit(id, alice, keccak256("x"), 9000);
        vm.expectRevert(AxonProtocol.NotFilled.selector);
        axon.mintPolicy(id, 1 ether);
    }

    function test_licensePolicy_paysEveryContributorInOneCall() public {
        uint256 id = _fillTask();
        uint256 pid = axon.mintPolicy(id, 4 ether);

        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        uint256 t0 = treasury.balance;

        vm.prank(carol);
        axon.licensePolicy{value: 4 ether}(pid);

        uint256 fee = (4 ether * 250) / 10_000;
        uint256 pool = 4 ether - fee;

        assertEq(alice.balance - a0, (pool * 7000) / 10_000, "alice paid by weight");
        assertEq(bob.balance - b0, (pool * 3000) / 10_000, "bob paid by weight");
        assertEq(treasury.balance - t0, fee, "protocol fee plus dust");

        AxonProtocol.Policy memory p = axon.getPolicy(pid);
        assertEq(p.licencesSold, 1);
    }

    function test_licensePolicy_rejectsWrongFee() public {
        uint256 id = _fillTask();
        uint256 pid = axon.mintPolicy(id, 4 ether);
        vm.prank(carol);
        vm.expectRevert(AxonProtocol.WrongFee.selector);
        axon.licensePolicy{value: 3 ether}(pid);
    }

    function test_licensePolicy_conservesValue() public {
        uint256 id = _fillTask();
        uint256 pid = axon.mintPolicy(id, 4 ether);

        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        uint256 t0 = treasury.balance;

        vm.prank(carol);
        axon.licensePolicy{value: 4 ether}(pid);

        uint256 out = (alice.balance - a0) + (bob.balance - b0) + (treasury.balance - t0);
        assertEq(out, 4 ether, "every wei of the licence leaves the contract");
    }

    // ----------------------------------------------------- deferred pay

    function test_failedPushBecomesClaimable() public {
        Rejector r = new Rejector();
        uint256 id = _task(2);

        _submit(id, address(r), keccak256("r1"), 8000);

        uint256 expected = (uint256(REWARD) * 8000) / 10_000;
        assertEq(address(r).balance, 0, "push refused");
        assertEq(axon.claimable(address(r)), expected, "credited instead");

        r.claim(axon);
        assertEq(address(r).balance, 0);
        assertEq(axon.claimable(address(r)), expected, "still owed while it refuses");
    }

    // --------------------------------------------------------- accounting

    function test_statsTrackMeanScore() public {
        uint256 id = _task(5);
        _submit(id, alice, keccak256("s1"), 9000);
        _submit(id, alice, keccak256("s2"), 7000);
        (uint256 runs, , uint256 mean) = axon.stats(alice);
        assertEq(runs, 2);
        assertEq(mean, 8000);
    }

    function test_contractNeverHoldsMoreThanEscrow() public {
        uint256 id = _task(4);
        _submit(id, alice, keccak256("e1"), 10_000);
        AxonProtocol.Task memory t = axon.getTask(id);
        assertEq(address(axon).balance, t.escrow);
    }

    function testFuzz_payoutIsProportionalToScore(uint16 score) public {
        score = uint16(bound(score, 4000, 10_000));
        uint256 id = _task(3);
        uint256 before = alice.balance;
        _submit(id, alice, keccak256(abi.encode(score)), score);
        assertEq(alice.balance - before, (uint256(REWARD) * score) / 10_000);
    }
}

/// Refuses every incoming transfer, to exercise the deferred-payment path.
contract Rejector {
    function claim(AxonProtocol a) external {
        try a.claim() {} catch {}
    }
    receive() external payable { revert("no"); }
}
