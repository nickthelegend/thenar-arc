// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TrajectoryCertificate} from "../src/TrajectoryCertificate.sol";
import {ThenarBase} from "./utils/ThenarBase.sol";

contract TrajectoryCertificateTest is ThenarBase {
    TrajectoryCertificate cert;
    address mallory = makeAddr("mallory");

    function setUp() public {
        vm.warp(1_800_000_000);
        _deploy(address(0));
        cert = new TrajectoryCertificate(address(thenar));
    }

    function _runOnNewTask(address who, bytes32 h) internal returns (uint256 trajectoryId) {
        uint256 id = _task(2, uint256(REWARD) * 2);
        trajectoryId = _run(id, who, h, 9000);
    }

    function test_mint_goesToTheRecorderNotTheCaller() public {
        _runOnNewTask(alice, keccak256("run"));
        // Mallory pays the gas. The token is still alice's, because the
        // contributor is read from the protocol rather than from the caller.
        vm.prank(mallory);
        address to = cert.mint(0);
        assertEq(to, alice);
        assertEq(cert.ownerOf(0), alice);
        assertEq(cert.balanceOf(alice), 1);
        assertEq(cert.balanceOf(mallory), 0);
        assertTrue(cert.minted(0));
    }

    function test_mint_readsTheProtocolsCurrentTrajectoryLayout() public {
        // The protocol's Trajectory has grown an `atBlock` field the certificate's
        // interface does not declare; decoding must still land every field it reads.
        _runOnNewTask(alice, keccak256("first"));
        _runOnNewTask(bob, keccak256("second"));
        assertEq(cert.mint(1), bob);
        assertEq(cert.ownerOf(1), bob);
        vm.expectRevert(TrajectoryCertificate.NoToken.selector);
        cert.ownerOf(0);
    }

    function test_mint_refusesARunTheProtocolNeverAccepted() public {
        vm.expectRevert(TrajectoryCertificate.NoSuchTrajectory.selector);
        cert.mint(0);
    }

    function test_mint_refusesTwice() public {
        _runOnNewTask(alice, keccak256("run"));
        cert.mint(0);
        vm.expectRevert(TrajectoryCertificate.AlreadyMinted.selector);
        cert.mint(0);
    }

    function test_certificateCannotMove() public {
        _runOnNewTask(alice, keccak256("run"));
        cert.mint(0);
        vm.startPrank(alice);
        vm.expectRevert(TrajectoryCertificate.Soulbound.selector);
        cert.transferFrom(alice, mallory, 0);
        vm.expectRevert(TrajectoryCertificate.Soulbound.selector);
        cert.safeTransferFrom(alice, mallory, 0);
        vm.expectRevert(TrajectoryCertificate.Soulbound.selector);
        cert.safeTransferFrom(alice, mallory, 0, "");
        vm.expectRevert(TrajectoryCertificate.Soulbound.selector);
        cert.approve(mallory, 0);
        vm.expectRevert(TrajectoryCertificate.Soulbound.selector);
        cert.setApprovalForAll(mallory, true);
        vm.stopPrank();
        assertEq(cert.ownerOf(0), alice, "still the recorder's");
        assertEq(cert.getApproved(0), address(0));
        assertFalse(cert.isApprovedForAll(alice, mallory));
    }

    function test_metadataComesFromTheProtocol() public {
        bytes32 h = keccak256("run");
        _runOnNewTask(alice, h);
        cert.mint(0);
        string memory uri = cert.tokenURI(0);
        assertTrue(_has(uri, "Trajectory #0"), "names the run");
        assertTrue(_has(uri, '"value":9000'), "carries the score the protocol recorded");
        assertTrue(_has(uri, string.concat('"Recorded at","display_type":"date","value":', vm.toString(block.timestamp))));
        assertTrue(_has(uri, vm.toString(h)), "carries the run id");
        assertTrue(_has(uri, "conveys no rights over the data"), "says what it is not");
    }

    function test_tokenURI_ofAnUnmintedTokenReverts() public {
        _runOnNewTask(alice, keccak256("run"));
        vm.expectRevert(TrajectoryCertificate.NoToken.selector);
        cert.tokenURI(0);
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
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }
}
