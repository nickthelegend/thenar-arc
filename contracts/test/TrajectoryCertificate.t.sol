// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {TrajectoryCertificate} from "../src/TrajectoryCertificate.sol";

contract TrajectoryCertificateTest is Test {
    AxonProtocolV2 axon;
    TrajectoryCertificate cert;

    uint256 verifierKey = 0xA11CE;
    address verifier;
    address funder = address(0xF00D);
    address alice = address(0xA1);
    address mallory = address(0xBAD);
    uint128 constant REWARD = 0.4 ether;

    function setUp() public {
        verifier = vm.addr(verifierKey);
        axon = new AxonProtocolV2(verifier, address(0xBEEF), address(new PasskeyRegistry()));
        cert = new TrajectoryCertificate(address(axon));
        vm.deal(funder, 100 ether);
        vm.deal(alice, 1 ether);
    }

    function _run(address who, bytes32 h) internal returns (uint256 id) {
        vm.prank(funder);
        id = axon.createTask{value: REWARD * 2}("Task", 2, REWARD, 1, 3);
        bytes32 digest = axon.runDigest(id, who, h, "ipfs://cid", 9000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, digest);
        vm.prank(who);
        axon.submitTrajectory(id, h, "ipfs://cid", 9000, abi.encodePacked(r, s, v));
    }

    function test_mint_goesToTheRecorderNotTheCaller() public {
        _run(alice, keccak256("run"));
        // Mallory pays the gas. The token is still alice's, because the
        // contributor is read from the protocol rather than from the caller.
        vm.prank(mallory);
        address to = cert.mint(0);
        assertEq(to, alice);
        assertEq(cert.ownerOf(0), alice);
        assertEq(cert.balanceOf(alice), 1);
        assertEq(cert.balanceOf(mallory), 0);
    }

    function test_mint_refusesARunTheProtocolNeverAccepted() public {
        vm.expectRevert(TrajectoryCertificate.NoSuchTrajectory.selector);
        cert.mint(0);
    }

    function test_mint_refusesTwice() public {
        _run(alice, keccak256("run"));
        cert.mint(0);
        vm.expectRevert(TrajectoryCertificate.AlreadyMinted.selector);
        cert.mint(0);
    }

    function test_certificateCannotMove() public {
        _run(alice, keccak256("run"));
        cert.mint(0);
        vm.startPrank(alice);
        vm.expectRevert(TrajectoryCertificate.Soulbound.selector);
        cert.transferFrom(alice, mallory, 0);
        vm.expectRevert(TrajectoryCertificate.Soulbound.selector);
        cert.approve(mallory, 0);
        vm.expectRevert(TrajectoryCertificate.Soulbound.selector);
        cert.setApprovalForAll(mallory, true);
        vm.stopPrank();
        assertEq(cert.ownerOf(0), alice, "still the recorder's");
    }

    function test_metadataComesFromTheProtocol() public {
        bytes32 h = keccak256("run");
        _run(alice, h);
        cert.mint(0);
        string memory uri = cert.tokenURI(0);
        assertTrue(_has(uri, "Trajectory #0"), "names the run");
        assertTrue(_has(uri, '"value":9000'), "carries the score the protocol recorded");
        assertTrue(_has(uri, "conveys no rights over the data"), "says what it is not");
    }

    function test_doesNotClaimToBeTransferable() public view {
        // ERC-165 and ERC-721 metadata, but not ERC-721. Claiming the transfer
        // interface would tell a marketplace it can list something it cannot move.
        assertTrue(cert.supportsInterface(0x01ffc9a7), "ERC-165");
        assertTrue(cert.supportsInterface(0x5b5e139f), "ERC-721 metadata");
        assertFalse(cert.supportsInterface(0x80ac58cd), "not ERC-721");
    }

    function _has(string memory hay, string memory needle) private pure returns (bool) {
        bytes memory h = bytes(hay);
        bytes memory n = bytes(needle);
        if (n.length > h.length) return false;
        for (uint256 i = 0; i + n.length <= h.length; i += 1) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; j += 1) {
                if (h[i + j] != n[j]) { ok = false; break; }
            }
            if (ok) return true;
        }
        return false;
    }
}
