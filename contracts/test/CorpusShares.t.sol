// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CorpusShares} from "../src/CorpusShares.sol";
import {MockERC3009} from "./mocks/MockERC3009.sol";

/// Dividends are declared and paid in USDC (6 decimals), pulled from the issuer.
contract CorpusSharesTest is Test {
    CorpusShares shares;
    MockERC3009 usdc;
    address issuer = address(0x1551);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address mallory = address(0xBAD);

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockERC3009("USDC", "2");
        shares = new CorpusShares("Thenar Robot Corpus", "THNRC", issuer, address(usdc));
        vm.startPrank(issuer);
        shares.addToControlList(alice);
        shares.addToControlList(bob);
        usdc.approve(address(shares), type(uint256).max);
        vm.stopPrank();
        usdc.mint(issuer, 100e6);
    }

    function test_metadata() public view {
        assertEq(shares.name(), "Thenar Robot Corpus");
        assertEq(shares.symbol(), "THNRC");
        assertEq(shares.decimals(), 0);
        assertEq(shares.issuer(), issuer);
        assertEq(address(shares.usdc()), address(usdc));
    }

    function test_onlyTheIssuerAdmitsAndIssues() public {
        vm.expectRevert(CorpusShares.NotIssuer.selector);
        vm.prank(mallory);
        shares.addToControlList(mallory);

        vm.expectRevert(CorpusShares.NotIssuer.selector);
        vm.prank(mallory);
        shares.issue(mallory, 1, bytes32(0));

        vm.expectRevert(CorpusShares.NotIssuer.selector);
        vm.prank(mallory);
        shares.setDividend(uint64(block.timestamp + 60), uint64(block.timestamp + 60), 1e6);
    }

    function test_admittingTwiceListsOnce() public {
        vm.prank(issuer);
        shares.addToControlList(alice);
        assertEq(shares.getControlListCount(), 2);
        address[] memory m = shares.getControlListMembers(0, 10);
        assertEq(m.length, 2);
        assertEq(m[0], alice);
        assertEq(shares.getControlListMembers(5, 10).length, 0);
        assertTrue(shares.isInControlList(bob));
        assertFalse(shares.isInControlList(mallory));
    }

    function test_anUnlistedAddressCannotHold() public {
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.AccountIsNotInControlList.selector, mallory));
        vm.prank(issuer);
        shares.issue(mallory, 100, keccak256("run"));

        vm.expectRevert(CorpusShares.ZeroAmount.selector);
        vm.prank(issuer);
        shares.issue(alice, 0, keccak256("run"));
    }

    function test_issueNamesTheRun() public {
        vm.expectEmit(address(shares));
        emit CorpusShares.Issued(alice, 7, keccak256("run"));
        vm.prank(issuer);
        shares.issue(alice, 7, keccak256("run"));
        assertEq(shares.totalSupply(), 7);
    }

    function test_sharesMoveOnlyBetweenListedHumans() public {
        vm.prank(issuer);
        shares.issue(alice, 100, keccak256("run"));

        vm.prank(alice);
        shares.transfer(bob, 40);
        assertEq(shares.balanceOf(alice), 60);
        assertEq(shares.balanceOf(bob), 40);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.AccountIsNotInControlList.selector, mallory));
        vm.prank(alice);
        shares.transfer(mallory, 1);

        vm.prank(alice);
        shares.approve(mallory, 10);
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.AccountIsNotInControlList.selector, mallory));
        vm.prank(mallory);
        shares.transferFrom(alice, mallory, 10);

        // An approved spender moves between listed holders, within the allowance.
        vm.prank(mallory);
        shares.transferFrom(alice, bob, 10);
        assertEq(shares.allowance(alice, mallory), 0);
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.InsufficientAllowance.selector, 0, 1));
        vm.prank(mallory);
        shares.transferFrom(alice, bob, 1);
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.InsufficientBalance.selector, 50, 51));
        vm.prank(alice);
        shares.transfer(bob, 51);
    }

    function test_theRecordDateMustBeAhead() public {
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.RecordDateNotInFuture.selector, uint64(block.timestamp)));
        vm.prank(issuer);
        shares.setDividend(uint64(block.timestamp), uint64(block.timestamp + 10), 1e6);

        vm.expectRevert(
            abi.encodeWithSelector(
                CorpusShares.ExecutionBeforeRecord.selector, uint64(block.timestamp + 10), uint64(block.timestamp + 9)
            )
        );
        vm.prank(issuer);
        shares.setDividend(uint64(block.timestamp + 10), uint64(block.timestamp + 9), 1e6);

        vm.expectRevert(CorpusShares.ZeroAmount.selector);
        vm.prank(issuer);
        shares.setDividend(uint64(block.timestamp + 10), uint64(block.timestamp + 10), 0);
    }

    function test_setDividend_pullsTheUsdc() public {
        vm.expectEmit(address(shares));
        emit CorpusShares.DividendDeclared(1, uint64(block.timestamp + 60), uint64(block.timestamp + 120), 3e6);
        vm.prank(issuer);
        shares.setDividend(uint64(block.timestamp + 60), uint64(block.timestamp + 120), 3e6);
        assertEq(usdc.balanceOf(issuer), 97e6);
        assertEq(usdc.balanceOf(address(shares)), 3e6);
        assertEq(shares.getDividendsCount(), 1);

        // Without an approval there is nothing to pull.
        address poorIssuer = makeAddr("issuer without approval");
        CorpusShares other = new CorpusShares("X", "X", poorIssuer, address(usdc));
        usdc.mint(poorIssuer, 1e6);
        vm.prank(poorIssuer);
        vm.expectRevert();
        other.setDividend(uint64(block.timestamp + 60), uint64(block.timestamp + 60), 1e6);
    }

    function test_aDividendPaysWhoHeldAtTheRecordDate() public {
        vm.startPrank(issuer);
        shares.issue(alice, 75, keccak256("a"));
        shares.issue(bob, 25, keccak256("b"));
        uint256 id = shares.setDividend(uint64(block.timestamp + 60), uint64(block.timestamp + 120), 1e6);
        vm.stopPrank();
        assertEq(id, 1);

        // Before the record date nothing is owed yet.
        (, uint256 owed,,, bool reached,) = shares.getDividendFor(id, alice);
        assertFalse(reached);
        assertEq(owed, 0);
        (,,,, uint256 supplyAtRecord) = shares.getDividend(id);
        assertEq(supplyAtRecord, 0, "not reached yet");

        // After the snapshot alice sells everything to bob: it must not move the dividend.
        vm.warp(block.timestamp + 61);
        vm.prank(alice);
        shares.transfer(bob, 75);

        (uint256 bal, uint256 a,,, bool r2,) = shares.getDividendFor(id, alice);
        assertTrue(r2);
        assertEq(bal, 75);
        assertEq(a, 0.75e6);
        (, uint256 b,,,,) = shares.getDividendFor(id, bob);
        assertEq(b, 0.25e6);
        (,, uint256 amount,, uint256 supply) = shares.getDividend(id);
        assertEq(amount, 1e6);
        assertEq(supply, 100);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.DividendNotPayable.selector, id, uint64(1_000_120)));
        vm.prank(alice);
        shares.claimDividend(id);

        vm.warp(block.timestamp + 60);
        vm.expectEmit(address(shares));
        emit CorpusShares.DividendClaimed(id, alice, 0.75e6);
        vm.prank(alice);
        shares.claimDividend(id);
        assertEq(usdc.balanceOf(alice), 0.75e6);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.AlreadyClaimed.selector, id, alice));
        vm.prank(alice);
        shares.claimDividend(id);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NothingOwed.selector, id, mallory));
        vm.prank(mallory);
        shares.claimDividend(id);

        vm.prank(bob);
        shares.claimDividend(id);
        assertEq(usdc.balanceOf(bob), 0.25e6);
        (,,, uint256 claimed,) = shares.getDividend(id);
        assertEq(claimed, 1e6);
        assertEq(usdc.balanceOf(address(shares)), 0);
    }

    function test_sharesBoughtAfterTheSnapshotEarnNothing() public {
        vm.startPrank(issuer);
        shares.issue(alice, 10, keccak256("a"));
        uint256 id = shares.setDividend(uint64(block.timestamp + 60), uint64(block.timestamp + 60), 1e6);
        vm.warp(block.timestamp + 61);
        shares.issue(bob, 90, keccak256("b"));
        vm.stopPrank();

        (, uint256 a,,,,) = shares.getDividendFor(id, alice);
        (, uint256 b,,,,) = shares.getDividendFor(id, bob);
        assertEq(a, 1e6);
        assertEq(b, 0);
    }

    function test_anUnknownDividendReverts() public {
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NoSuchDividend.selector, 0));
        shares.getDividend(0);
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NoSuchDividend.selector, 1));
        shares.claimDividend(1);
    }

    function test_balanceHistoryIsCheckpointed() public {
        vm.prank(issuer);
        shares.issue(alice, 10, keccak256("a"));
        uint64 t0 = uint64(block.timestamp);
        vm.warp(t0 + 100);
        vm.prank(alice);
        shares.transfer(bob, 4);
        assertEq(shares.balanceOfAt(alice, t0 - 1), 0);
        assertEq(shares.balanceOfAt(alice, t0), 10);
        assertEq(shares.balanceOfAt(alice, t0 + 99), 10);
        assertEq(shares.balanceOfAt(alice, t0 + 100), 6);
        assertEq(shares.balanceOfAt(bob, t0 + 100), 4);
        assertEq(shares.totalSupplyAt(t0 + 100), 10);
    }
}

contract CorpusSharesReclaimTest is Test {
    CorpusShares shares;
    MockERC3009 usdc;
    address issuer = address(0x1551);
    address alice = address(0xA11CE);

    function setUp() public {
        vm.warp(1_000_000);
        usdc = new MockERC3009("USDC", "2");
        shares = new CorpusShares("Thenar Robot Corpus", "THNRC", issuer, address(usdc));
        usdc.mint(issuer, 10e6);
        vm.prank(issuer);
        usdc.approve(address(shares), type(uint256).max);
    }

    function test_aDividendWithNoHoldersComesBack() public {
        vm.prank(issuer);
        uint256 id = shares.setDividend(uint64(block.timestamp + 60), uint64(block.timestamp + 120), 1e6);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NothingToReclaim.selector, id));
        vm.prank(issuer);
        shares.reclaimDividend(id);

        vm.warp(block.timestamp + 61);
        uint256 before = usdc.balanceOf(issuer);
        vm.expectEmit(address(shares));
        emit CorpusShares.DividendReclaimed(id, 1e6);
        vm.prank(issuer);
        shares.reclaimDividend(id);
        assertEq(usdc.balanceOf(issuer) - before, 1e6);

        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NothingToReclaim.selector, id));
        vm.prank(issuer);
        shares.reclaimDividend(id);
    }

    function test_aDividendWithHoldersCannotBeTakenBack() public {
        vm.startPrank(issuer);
        shares.addToControlList(alice);
        shares.issue(alice, 10, keccak256("a"));
        uint256 id = shares.setDividend(uint64(block.timestamp + 60), uint64(block.timestamp + 60), 1e6);
        vm.warp(block.timestamp + 61);
        vm.expectRevert(abi.encodeWithSelector(CorpusShares.NothingToReclaim.selector, id));
        shares.reclaimDividend(id);
        vm.stopPrank();
    }

    function test_onlyTheIssuerReclaims() public {
        vm.prank(issuer);
        uint256 id = shares.setDividend(uint64(block.timestamp + 60), uint64(block.timestamp + 60), 1e6);
        vm.warp(block.timestamp + 61);
        vm.expectRevert(CorpusShares.NotIssuer.selector);
        vm.prank(alice);
        shares.reclaimDividend(id);
    }
}
