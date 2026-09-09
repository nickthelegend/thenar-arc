// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {Referrals} from "../src/Referrals.sol";

contract ReferralsTest is Test {
    AxonProtocolV2 axon;
    Referrals ref;

    uint256 verifierKey = 0xA11CE;
    address verifier;
    address funder = address(0xF00D);
    address veteran = address(0xA1);
    address newcomer = address(0xB0);
    address stranger = address(0x51);
    uint128 constant REWARD = 0.1 ether;
    uint256 constant BOUNTY = 0.05 ether;
    uint256 task;

    function setUp() public {
        verifier = vm.addr(verifierKey);
        axon = new AxonProtocolV2(verifier, address(0xBEEF), address(new PasskeyRegistry()));
        ref = new Referrals{value: 1 ether}(address(axon), BOUNTY);
        vm.deal(funder, 100 ether);
        vm.prank(funder);
        task = axon.createTask{value: REWARD * 20}("Task", 20, REWARD, 1, 3);
    }

    function _work(address who, bytes32 h, uint16 score) internal {
        bytes32 d = axon.runDigest(task, who, h, "ipfs://cid", score);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, d);
        bytes memory sig = abi.encodePacked(r, s, v);
        vm.prank(who);
        axon.submitTrajectory(task, h, "ipfs://cid", score, sig);
    }

    function test_paysTheReferrerWhenTheNewcomerHasDoneTheWork() public {
        _work(veteran, keccak256("v"), 9000);
        _work(newcomer, keccak256("n1"), 9000);
        _work(newcomer, keccak256("n2"), 9000);

        uint256 before = veteran.balance;
        vm.prank(newcomer);
        ref.claim(veteran);
        assertEq(veteran.balance - before, BOUNTY, "the referrer was paid");
        assertEq(ref.referrerOf(newcomer), veteran);
    }

    function test_paysNothingForSigningUp() public {
        _work(veteran, keccak256("v"), 9000);
        // One run at 9,000 is below the threshold. Existing is not enough.
        _work(newcomer, keccak256("n1"), 9000);
        vm.prank(newcomer);
        vm.expectRevert(Referrals.NotEnoughWork.selector);
        ref.claim(veteran);
    }

    function test_theReferrerMustHaveContributedToo() public {
        _work(newcomer, keccak256("n1"), 9000);
        _work(newcomer, keccak256("n2"), 9000);
        vm.prank(newcomer);
        vm.expectRevert(Referrals.ReferrerHasNoWork.selector);
        ref.claim(stranger);
    }

    function test_cannotReferYourself() public {
        _work(newcomer, keccak256("n1"), 9000);
        _work(newcomer, keccak256("n2"), 9000);
        vm.prank(newcomer);
        vm.expectRevert(Referrals.CannotReferYourself.selector);
        ref.claim(newcomer);
    }

    function test_cannotClaimTwice() public {
        _work(veteran, keccak256("v"), 9000);
        _work(newcomer, keccak256("n1"), 9000);
        _work(newcomer, keccak256("n2"), 9000);
        vm.startPrank(newcomer);
        ref.claim(veteran);
        vm.expectRevert(Referrals.AlreadyClaimed.selector);
        ref.claim(veteran);
        vm.stopPrank();
    }

    function test_aReferrerIsCapped() public {
        // Its own task: eleven newcomers doing two runs each needs more slots
        // than the shared one has, and running out of slots would fail this
        // for a reason that has nothing to do with the cap.
        vm.prank(funder);
        task = axon.createTask{value: REWARD * 40}("Wide", 40, REWARD, 1, 3);
        _work(veteran, keccak256("v"), 9000);
        for (uint160 i = 1; i <= 11; ++i) {
            address n = address(0x1000 + i);
            _work(n, keccak256(abi.encode("a", i)), 9000);
            _work(n, keccak256(abi.encode("b", i)), 9000);
            vm.prank(n);
            if (i <= 10) ref.claim(veteran);
            else {
                vm.expectRevert(Referrals.ReferrerAtCap.selector);
                ref.claim(veteran);
            }
        }
        assertEq(ref.referredBy(veteran), 10, "ten and no more");
    }
}
