// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CorpusAccess} from "../src/CorpusAccess.sol";

contract CorpusAccessTest is Test {
    CorpusAccess acc;
    address treasury = address(0xBEEF);
    address buyer = address(0xB0);
    uint256 constant PRICE = 0.001 ether;

    function setUp() public {
        acc = new CorpusAccess(treasury, PRICE);
        vm.deal(buyer, 10 ether);
    }

    function test_subscribe_grantsAccessAndPaysTheTreasury() public {
        uint256 before = treasury.balance;
        vm.prank(buyer);
        acc.subscribe{value: PRICE * 7}(7);
        assertTrue(acc.active(buyer), "access is live");
        assertEq(treasury.balance, before + PRICE * 7, "the treasury was paid");
        assertApproxEqAbs(acc.remaining(buyer), 7 days, 2);
    }

    function test_accessExpires() public {
        vm.prank(buyer);
        acc.subscribe{value: PRICE * 2}(2);
        vm.warp(block.timestamp + 3 days);
        assertFalse(acc.active(buyer), "two days does not last three");
        assertEq(acc.remaining(buyer), 0);
    }

    function test_renewingEarlyAddsRatherThanReplaces() public {
        vm.startPrank(buyer);
        acc.subscribe{value: PRICE * 10}(10);
        vm.warp(block.timestamp + 2 days);
        acc.subscribe{value: PRICE * 10}(10);
        vm.stopPrank();
        // Eight days left plus ten bought. Renewing early must not cost the
        // days already paid for.
        assertApproxEqAbs(acc.remaining(buyer), 18 days, 2);
    }

    function test_refusesUnderpayment() public {
        vm.prank(buyer);
        vm.expectRevert(CorpusAccess.Underpaid.selector);
        acc.subscribe{value: PRICE * 3 - 1}(3);
    }

    function test_refusesADurationItCannotHonour() public {
        vm.startPrank(buyer);
        vm.expectRevert(CorpusAccess.BadDuration.selector);
        acc.subscribe{value: PRICE}(0);
        vm.expectRevert(CorpusAccess.BadDuration.selector);
        acc.subscribe{value: PRICE * 400}(400);
        vm.stopPrank();
    }

    function test_oneSubscriptionIsNotAnother() public {
        vm.prank(buyer);
        acc.subscribe{value: PRICE}(1);
        assertTrue(acc.active(buyer));
        assertFalse(acc.active(address(0xC0FFEE)), "nobody else got access");
    }
}
