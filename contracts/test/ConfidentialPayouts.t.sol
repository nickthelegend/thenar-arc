// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ConfidentialPayouts} from "../src/ConfidentialPayouts.sol";

contract ConfidentialPayoutsTest is Test {
    ConfidentialPayouts cp;
    address verifierBackend = address(0xA11CE);
    address alice = address(0xA1);
    address mallory = address(0xBAD);

    uint256 constant P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F;
    uint256 constant GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 constant GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;

    function setUp() public {
        cp = new ConfidentialPayouts(verifierBackend);
    }

    /// k·G by double-and-add, using the contract's own addition so the test
    /// and the thing under test agree about the group.
    function mul(uint256 k, uint256 px, uint256 py) internal view returns (uint256, uint256) {
        uint256 rx; uint256 ry;
        uint256 ax = px; uint256 ay = py;
        while (k > 0) {
            if (k & 1 == 1) (rx, ry) = cp.add(rx, ry, ax, ay);
            (ax, ay) = cp.add(ax, ay, ax, ay);
            k >>= 1;
        }
        return (rx, ry);
    }

    function encrypt(uint256 m, uint256 r, uint256 pkx, uint256 pky)
        internal view returns (ConfidentialPayouts.Cipher memory c)
    {
        (uint256 c1x, uint256 c1y) = mul(r, GX, GY);
        (uint256 mgx, uint256 mgy) = mul(m, GX, GY);
        (uint256 rpx, uint256 rpy) = mul(r, pkx, pky);
        (uint256 c2x, uint256 c2y) = cp.add(mgx, mgy, rpx, rpy);
        c.c1 = ConfidentialPayouts.Point(c1x, c1y);
        c.c2 = ConfidentialPayouts.Point(c2x, c2y);
    }

    function test_theGeneratorIsOnTheCurve() public view {
        assertTrue(cp.onCurve(GX, GY));
        assertFalse(cp.onCurve(1, 1), "a point that is not on it is refused");
        assertFalse(cp.onCurve(0, 0), "and the identity is not a key");
    }

    function test_encryptedAmountsAddToTheSum() public {
        uint256 sk = 0xC0FFEE;
        (uint256 pkx, uint256 pky) = mul(sk, GX, GY);
        vm.prank(alice);
        cp.registerKey(pkx, pky);

        // Two payouts the chain never sees the value of.
        vm.startPrank(verifierBackend);
        cp.accrue(alice, encrypt(700, 11, pkx, pky));
        cp.accrue(alice, encrypt(1300, 29, pkx, pky));
        vm.stopPrank();

        // Decrypt: m·G = c2 − sk·c1. Compare against the point for 2000.
        ConfidentialPayouts.Cipher memory t = cp.totalOf(alice);
        (uint256 sx, uint256 sy) = mul(sk, t.c1.x, t.c1.y);
        (uint256 mx, uint256 my) = cp.add(t.c2.x, t.c2.y, sx, P - sy);
        (uint256 ex, uint256 ey) = mul(2000, GX, GY);

        assertEq(mx, ex, "the total decrypts to 700 + 1300");
        assertEq(my, ey);
        assertEq(cp.entries(alice), 2);
    }

    function test_twoIdenticalPayoutsDoNotBreakTheAddition() public {
        // The same amount with the same randomness produces the same point,
        // and adding a point to itself is doubling — a case a naive addition
        // would divide by zero on.
        uint256 sk = 0xBEEF;
        (uint256 pkx, uint256 pky) = mul(sk, GX, GY);
        vm.prank(alice);
        cp.registerKey(pkx, pky);

        ConfidentialPayouts.Cipher memory same = encrypt(500, 7, pkx, pky);
        vm.startPrank(verifierBackend);
        cp.accrue(alice, same);
        cp.accrue(alice, same);
        vm.stopPrank();

        ConfidentialPayouts.Cipher memory t = cp.totalOf(alice);
        (uint256 sx, uint256 sy) = mul(sk, t.c1.x, t.c1.y);
        (uint256 mx, uint256 my) = cp.add(t.c2.x, t.c2.y, sx, P - sy);
        (uint256 ex, uint256 ey) = mul(1000, GX, GY);
        assertEq(mx, ex, "500 twice is 1000");
        assertEq(my, ey);
    }

    function test_theChainNeverHoldsTheNumber() public {
        uint256 sk = 0xFEED;
        (uint256 pkx, uint256 pky) = mul(sk, GX, GY);
        vm.prank(alice);
        cp.registerKey(pkx, pky);
        // Encrypted before the prank: arguments evaluate first, and encrypt()
        // makes view calls that would otherwise consume it.
        ConfidentialPayouts.Cipher memory c = encrypt(4242, 13, pkx, pky);
        vm.prank(verifierBackend);
        cp.accrue(alice, c);

        // The stored total is a curve point, not the amount, and is not the
        // point for the amount either — without the key it is noise.
        ConfidentialPayouts.Cipher memory t = cp.totalOf(alice);
        (uint256 px, uint256 py) = mul(4242, GX, GY);
        assertTrue(t.c2.x != px || t.c2.y != py, "the ciphertext is not the plaintext point");
        assertTrue(t.c2.x != 4242, "and obviously not the number");
    }

    function test_onlyTheAdderCanAccrue() public {
        uint256 sk = 0xD00D;
        (uint256 pkx, uint256 pky) = mul(sk, GX, GY);
        vm.prank(alice);
        cp.registerKey(pkx, pky);
        ConfidentialPayouts.Cipher memory c = encrypt(1, 2, pkx, pky);
        vm.prank(mallory);
        vm.expectRevert(ConfidentialPayouts.NotTheAdder.selector);
        cp.accrue(alice, c);
    }

    function test_noKeyNoAccrual() public {
        ConfidentialPayouts.Cipher memory c = encrypt(1, 2, GX, GY);
        vm.prank(verifierBackend);
        vm.expectRevert(ConfidentialPayouts.NoKey.selector);
        cp.accrue(alice, c);
    }

    function test_aKeyIsSetOnce() public {
        (uint256 pkx, uint256 pky) = mul(0xAB, GX, GY);
        vm.startPrank(alice);
        cp.registerKey(pkx, pky);
        vm.expectRevert(ConfidentialPayouts.KeyAlreadySet.selector);
        cp.registerKey(pkx, pky);
        vm.stopPrank();
    }

    function test_aKeyMustBeAPoint() public {
        vm.prank(alice);
        vm.expectRevert(ConfidentialPayouts.NotOnCurve.selector);
        cp.registerKey(12345, 67890);
    }
}
