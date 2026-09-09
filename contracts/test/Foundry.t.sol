// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {Foundry} from "../src/Foundry.sol";

contract FoundryGovTest is Test {
    AxonProtocolV2 axon;
    Foundry gov;

    uint256 verifierKey = 0xA11CE;
    address verifier;
    address funder = address(0xF00D);
    address alice = address(0xA1);
    address bob = address(0xB0);
    address outsider = address(0x0117);
    uint128 constant REWARD = 0.4 ether;
    uint256 task;

    function setUp() public {
        verifier = vm.addr(verifierKey);
        axon = new AxonProtocolV2(verifier, address(0xBEEF), address(new PasskeyRegistry()));
        gov = new Foundry{value: 20 ether}(address(axon));
        vm.deal(funder, 100 ether);
        vm.prank(funder);
        task = axon.createTask{value: REWARD * 8}("Seed", 8, REWARD, 1, 3);
    }

    function _work(address who, bytes32 h, uint16 score) internal {
        bytes32 d = axon.runDigest(task, who, h, "ipfs://cid", score);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, d);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(who);
        axon.submitTrajectory(task, h, "ipfs://cid", score, sig);
    }

    function _propose(address who) internal returns (uint256) {
        vm.prank(who);
        return gov.propose("Put the mug on the shelf", 4, 0.5 ether, 1, 3);
    }

    function test_onlyContributorsCanPropose() public {
        vm.prank(outsider);
        vm.expectRevert(Foundry.NoStanding.selector);
        gov.propose("Anything", 1, 1 ether, 1, 1);
    }

    function test_onlyContributorsCanVote() public {
        _work(alice, keccak256("a"), 9000);
        uint256 id = _propose(alice);
        vm.prank(outsider);
        vm.expectRevert(Foundry.NoStanding.selector);
        gov.vote(id, true);
    }

    function test_aCarriedVoteFundsTheTask() public {
        _work(alice, keccak256("a"), 9000);
        _work(bob, keccak256("b"), 9000);
        uint256 id = _propose(alice);

        vm.prank(alice); gov.vote(id, true);
        vm.prank(bob); gov.vote(id, true);

        vm.warp(block.timestamp + 4 days);
        uint256 before = address(gov).balance;
        // Executed by someone with no stake: once voting closes there is
        // nothing left to decide, and a decision only its proposer can enact
        // is one they can also quietly drop.
        vm.prank(outsider);
        uint256 newTask = gov.execute(id);

        assertEq(address(gov).balance, before - 2 ether, "the treasury paid for it");
        assertGt(newTask, task, "and a new task exists");
    }

    function test_aTieIsNotAMandate() public {
        _work(alice, keccak256("a"), 9000);
        _work(bob, keccak256("b"), 9000);
        uint256 id = _propose(alice);
        vm.prank(alice); gov.vote(id, true);
        vm.prank(bob); gov.vote(id, false);
        vm.warp(block.timestamp + 4 days);
        vm.expectRevert(Foundry.Rejected.selector);
        gov.execute(id);
    }

    function test_weightIsFrozenWhenTheVoteIsCast() public {
        _work(alice, keccak256("a1"), 9000);
        _work(bob, keccak256("b1"), 9000);
        uint256 id = _propose(alice);

        vm.prank(bob); gov.vote(id, false);   // 9000 against
        vm.prank(alice); gov.vote(id, true);  // 9000 for

        // Alice records more work after voting. It must not retroactively
        // strengthen a ballot she already cast.
        _work(alice, keccak256("a2"), 9000);

        vm.warp(block.timestamp + 4 days);
        vm.expectRevert(Foundry.Rejected.selector);
        gov.execute(id);
    }

    function test_cannotVoteTwice() public {
        _work(alice, keccak256("a"), 9000);
        uint256 id = _propose(alice);
        vm.startPrank(alice);
        gov.vote(id, true);
        vm.expectRevert(Foundry.AlreadyVoted.selector);
        gov.vote(id, false);
        vm.stopPrank();
    }

    function test_cannotExecuteWhileVotingIsOpen() public {
        _work(alice, keccak256("a"), 9000);
        uint256 id = _propose(alice);
        vm.prank(alice); gov.vote(id, true);
        vm.expectRevert(Foundry.StillOpen.selector);
        gov.execute(id);
    }

    function test_cannotExecuteTwice() public {
        _work(alice, keccak256("a"), 9000);
        uint256 id = _propose(alice);
        vm.prank(alice); gov.vote(id, true);
        vm.warp(block.timestamp + 4 days);
        gov.execute(id);
        vm.expectRevert(Foundry.AlreadyExecuted.selector);
        gov.execute(id);
    }

    function test_cannotSpendMoreThanTheTreasuryHas() public {
        _work(alice, keccak256("a"), 9000);
        vm.prank(alice);
        uint256 id = gov.propose("Enormous", 100, 1 ether, 1, 3);
        vm.prank(alice); gov.vote(id, true);
        vm.warp(block.timestamp + 4 days);
        vm.expectRevert(Foundry.TreasuryTooSmall.selector);
        gov.execute(id);
    }
}
