// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SalesLog} from "../src/SalesLog.sol";

contract SalesLogTest is Test {
    SalesLog sales;
    address seller = address(0x5E11);
    address constant USDC = 0x3600000000000000000000000000000000000000;

    function setUp() public {
        vm.warp(1_800_000_000);
        sales = new SalesLog(seller);
    }

    function test_onlyTheSellerLogs() public {
        vm.expectRevert(SalesLog.NotSeller.selector);
        sales.logSale(bytes32("x"), 1, SalesLog.Terms.X402, address(1), USDC, 10_000, bytes32("h"), 0);
        assertEq(sales.seller(), seller);
    }

    function test_aSaleIsReadableBackAndCannotBeLoggedTwice() public {
        vm.startPrank(seller);
        uint256 seq = sales.logSale(bytes32("tx"), 3, SalesLog.Terms.X402, address(1), USDC, 10_000, bytes32("h"), 0);
        assertEq(seq, 1);
        vm.expectRevert(abi.encodeWithSelector(SalesLog.AlreadyLogged.selector, bytes32("tx")));
        sales.logSale(bytes32("tx"), 3, SalesLog.Terms.X402, address(1), USDC, 10_000, bytes32("h"), 0);
        sales.logSale(bytes32("licence"), 3, SalesLog.Terms.Licence, address(1), address(0), 0, bytes32("h"), 0);
        vm.stopPrank();

        assertEq(sales.saleCount(), 2);
        SalesLog.Sale memory s = sales.getSale(1);
        assertEq(s.saleId, bytes32("tx"));
        assertEq(s.taskId, 3);
        assertEq(uint8(s.terms), uint8(SalesLog.Terms.X402));
        assertEq(s.buyer, address(1));
        assertEq(s.asset, USDC);
        assertEq(s.amount, 10_000);
        assertEq(s.sha256, bytes32("h"));
        assertEq(s.at, block.timestamp);
        assertEq(s.buyerAgent, 0, "not an agent");
        assertEq(uint8(sales.getSale(2).terms), uint8(SalesLog.Terms.Licence));
        assertEq(sales.seqOf(bytes32("licence")), 2);
        assertEq(sales.servedCount(bytes32("h")), 2);

        vm.expectRevert(abi.encodeWithSelector(SalesLog.NoSuchSale.selector, 3));
        sales.getSale(3);
        vm.expectRevert(abi.encodeWithSelector(SalesLog.NoSuchSale.selector, 0));
        sales.getSale(0);
    }

    function test_buyerAgentIsStoredAndEmitted() public {
        address agentWallet = makeAddr("buyer agent wallet");
        uint256 agentIdPlusOne = 42 + 1; // ERC-8004 agent 42
        bytes32 digest = sha256("the bytes served");
        vm.expectEmit(address(sales));
        emit SalesLog.CorpusSold(
            1, bytes32("gw"), 9, SalesLog.Terms.Gateway, agentWallet, USDC, 2_500_000, digest, agentIdPlusOne
        );
        vm.prank(seller);
        sales.logSale(bytes32("gw"), 9, SalesLog.Terms.Gateway, agentWallet, USDC, 2_500_000, digest, agentIdPlusOne);

        SalesLog.Sale memory s = sales.getSale(1);
        assertEq(s.buyerAgent, 43);
        assertEq(uint8(s.terms), uint8(SalesLog.Terms.Gateway));
        assertEq(s.buyer, agentWallet);
        assertEq(sales.servedCount(digest), 1);
    }

    function test_termsAreX402LicenceGateway() public pure {
        assertEq(uint8(SalesLog.Terms.X402), 0);
        assertEq(uint8(SalesLog.Terms.Licence), 1);
        assertEq(uint8(SalesLog.Terms.Gateway), 2);
    }
}
