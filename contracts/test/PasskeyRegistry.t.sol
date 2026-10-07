// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {P256Precompile} from "./utils/P256Precompile.sol";

/**
 * PasskeyRegistry against a secp256r1 verifier at 0x0100. Locally that is the
 * Solidity stand-in from utils/P256Precompile.sol (cancun has no precompile
 * there); test/fork/ThenarArcFork.t.sol runs the same checks against Arc
 * testnet's real precompile.
 *
 * The fixed vector below is a genuine secp256r1 signature produced by
 * WebCrypto, the same curve and encoding a passkey uses.
 */
contract PasskeyRegistryTest is Test {
    PasskeyRegistry reg;
    address alice = address(0xA1);

    bytes32 constant DIGEST = 0x7d9a9dd8b47e1bfe72856deb62097356dea1b6fbb40696cdb88ba911a017795b;
    bytes32 constant R = 0x53ebe57d38736b8cc3c11ebb12321edf85cb8312ff968525fa1bc8711d8c017d;
    bytes32 constant S = 0x7754c7011e16f2b8e50ce603e5833347de68077f40b78e661d6d2e404b1ee47e;
    bytes32 constant X = 0x70dd2b6396c2faefa77626826a9385e30a21fd89464fd95422b2b7a225a71f68;
    bytes32 constant Y = 0x5410c665847de22b35ad5a7be819ae5b8382563c2909f5f14e17c2aace0f8076;

    function setUp() public {
        P256Precompile.ensure(vm);
        reg = new PasskeyRegistry();
    }

    function test_precompileAcceptsARealSignature() public view {
        assertTrue(reg.verifyWithKey(DIGEST, R, S, X, Y), "real P256 signature must verify");
    }

    function test_precompileRejectsATamperedSignature() public view {
        assertFalse(reg.verifyWithKey(DIGEST, bytes32(uint256(R) ^ 1), S, X, Y));
    }

    function test_precompileRejectsAnotherDigest() public view {
        assertFalse(reg.verifyWithKey(keccak256("different"), R, S, X, Y));
    }

    function test_precompileRejectsAnotherKey() public view {
        assertFalse(reg.verifyWithKey(DIGEST, R, S, Y, X));
    }

    function test_aFreshPasskeySignatureVerifies() public {
        uint256 key = 0xBEEFCAFE;
        (uint256 x, uint256 y) = vm.publicKeyP256(key);
        bytes32 digest = sha256(abi.encodePacked(keccak256("a trajectory")));
        (bytes32 r, bytes32 s) = vm.signP256(key, digest);
        s = P256Precompile.lowS(s);
        vm.prank(alice);
        reg.register(bytes32(x), bytes32(y));
        assertTrue(reg.verify(alice, digest, r, s));
        assertFalse(reg.verify(alice, sha256("another"), r, s));
    }

    function test_registerThenVerify() public {
        vm.expectEmit(address(reg));
        emit PasskeyRegistry.PasskeyRegistered(alice, X, Y);
        vm.prank(alice);
        reg.register(X, Y);
        assertTrue(reg.hasPasskey(alice));
        assertTrue(reg.verify(alice, DIGEST, R, S));
        PasskeyRegistry.Passkey memory k = reg.passkeyOf(alice);
        assertEq(k.x, X);
        assertEq(k.y, Y);
        assertEq(k.registeredAt, block.timestamp);
    }

    function test_verifyRevertsWithoutAKey() public {
        vm.expectRevert(PasskeyRegistry.NoPasskey.selector);
        reg.verify(alice, DIGEST, R, S);
    }

    function test_authoriseSpendsTheDigestOnce() public {
        vm.prank(alice);
        reg.register(X, Y);
        vm.expectEmit(address(reg));
        emit PasskeyRegistry.DigestAuthorised(alice, DIGEST);
        reg.authorise(alice, DIGEST, R, S);
        assertTrue(reg.used(alice, DIGEST));
        vm.expectRevert(PasskeyRegistry.AlreadyUsed.selector);
        reg.authorise(alice, DIGEST, R, S);
    }

    function test_authoriseRejectsABadSignature() public {
        vm.prank(alice);
        reg.register(X, Y);
        vm.expectRevert(PasskeyRegistry.BadSignature.selector);
        reg.authorise(alice, DIGEST, bytes32(uint256(R) ^ 1), S);
        assertFalse(reg.used(alice, DIGEST));
    }

    function test_revokeClearsTheKey() public {
        vm.startPrank(alice);
        reg.register(X, Y);
        reg.revoke();
        vm.stopPrank();
        assertFalse(reg.hasPasskey(alice));
        vm.expectRevert(PasskeyRegistry.NoPasskey.selector);
        reg.verify(alice, DIGEST, R, S);
    }

    function test_precompileInputIs160Bytes() public view {
        bytes memory input = reg.precompileInput(DIGEST, R, S, X, Y);
        assertEq(input.length, 160);
        assertEq(input, abi.encodePacked(DIGEST, R, S, X, Y));
    }
}
