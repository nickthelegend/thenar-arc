// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CorpusManifest} from "../src/CorpusManifest.sol";

contract CorpusManifestTest is Test {
    CorpusManifest manifest;
    address constant VERIFIER = address(0xbEEF0001);
    address constant STRANGER = address(0xdEAD0002);

    function setUp() public {
        manifest = new CorpusManifest(VERIFIER);
    }

    /// Sorted-pair hashing, matching lib/merkle.ts and the contract.
    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function test_onlyTheVerifierMayCommit() public {
        vm.prank(STRANGER);
        vm.expectRevert(CorpusManifest.NotVerifier.selector);
        manifest.commit(0, keccak256("root"), 3);
    }

    function test_anEmptyCorpusCannotBeCommitted() public {
        vm.prank(VERIFIER);
        vm.expectRevert(CorpusManifest.EmptyCorpus.selector);
        manifest.commit(0, bytes32(0), 3);

        vm.prank(VERIFIER);
        vm.expectRevert(CorpusManifest.EmptyCorpus.selector);
        manifest.commit(0, keccak256("root"), 0);
    }

    function test_readingATaskWithNoCommitmentReverts() public {
        vm.expectRevert(CorpusManifest.NoCommitment.selector);
        manifest.latest(7);
    }

    function test_commitStoresAndEmits() public {
        bytes32 root = keccak256("corpus");
        vm.prank(VERIFIER);
        manifest.commit(4, root, 6);

        CorpusManifest.Commitment memory c = manifest.latest(4);
        assertEq(c.root, root);
        assertEq(c.episodes, 6);
        assertEq(manifest.versions(4), 1);
    }

    function test_recommittingTheSameCorpusIsRefused() public {
        bytes32 root = keccak256("corpus");
        vm.prank(VERIFIER);
        manifest.commit(1, root, 2);
        vm.prank(VERIFIER);
        vm.expectRevert(CorpusManifest.Unchanged.selector);
        manifest.commit(1, root, 2);
    }

    /// A corpus grows. The earlier commitment was not wrong and must survive,
    /// because a licence may have been bought against it.
    function test_anOlderRootStaysCheckableAfterTheCorpusGrows() public {
        bytes32 first = keccak256("four episodes");
        bytes32 second = keccak256("five episodes");

        vm.prank(VERIFIER);
        manifest.commit(2, first, 4);
        vm.prank(VERIFIER);
        manifest.commit(2, second, 5);

        assertEq(manifest.versions(2), 2);
        assertEq(manifest.at(2, 0).root, first);
        assertEq(manifest.at(2, 0).episodes, 4);
        assertEq(manifest.latest(2).root, second);
    }

    function test_membershipVerifiesAgainstTheCommittedRoot() public {
        // A four-leaf tree, built by hand so the test does not trust the
        // contract's own arithmetic to check the contract's arithmetic.
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        bytes32 c = keccak256("c");
        bytes32 d = keccak256("d");
        bytes32 ab = _pair(a, b);
        bytes32 cd = _pair(c, d);
        bytes32 root = _pair(ab, cd);

        vm.prank(VERIFIER);
        manifest.commit(9, root, 4);

        bytes32[] memory proof = new bytes32[](2);
        proof[0] = b;
        proof[1] = cd;
        assertTrue(manifest.contains(9, a, proof));
    }

    function test_anEpisodeOutsideTheCorpusDoesNotVerify() public {
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        bytes32 root = _pair(a, b);

        vm.prank(VERIFIER);
        manifest.commit(3, root, 2);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = b;
        assertFalse(manifest.contains(3, keccak256("elsewhere"), proof));
    }

    function test_aProofForOneVersionDoesNotPassForAnother() public {
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        bytes32 firstRoot = _pair(a, b);
        bytes32 c = keccak256("c");
        bytes32 secondRoot = _pair(_pair(a, b), c);

        vm.prank(VERIFIER);
        manifest.commit(5, firstRoot, 2);
        vm.prank(VERIFIER);
        manifest.commit(5, secondRoot, 3);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = b;
        // Valid against version 0, not against the corpus as it now stands.
        assertTrue(manifest.containsAt(5, 0, a, proof));
        assertFalse(manifest.contains(5, a, proof));
    }
}
