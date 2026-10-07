// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {ThenarProtocol} from "../../src/ThenarProtocol.sol";
import {PasskeyRegistry} from "../../src/PasskeyRegistry.sol";
import {MockBlocklistUSDC} from "../mocks/MockBlocklistUSDC.sol";

/**
 * Shared fixture for the unit suites: ThenarProtocol escrowing a USDC that
 * behaves like Circle's (6 decimals, EIP-3009 "USDC"/"2", a blocklist).
 */
abstract contract ThenarBase is Test {
    bytes32 internal constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    ThenarProtocol internal thenar;
    PasskeyRegistry internal registry;
    MockBlocklistUSDC internal usdc;

    uint256 internal verifierKey = 0xA11CE;
    address internal verifier;
    address internal treasury = makeAddr("treasury");
    address internal funder = makeAddr("funder");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal relayer = makeAddr("relayer");
    address internal stranger = makeAddr("stranger");

    /// 0.40 USDC per perfect run.
    uint128 internal constant REWARD = 0.4e6;
    /// Most a single task may escrow.
    uint128 internal constant MAX_ESCROW = 1_000e6;
    string internal constant CID = "ipfs://cid";

    function _deploy(address verdicts) internal {
        verifier = vm.addr(verifierKey);
        registry = new PasskeyRegistry();
        usdc = new MockBlocklistUSDC();
        thenar = new ThenarProtocol(verifier, treasury, address(registry), address(usdc), verdicts, MAX_ESCROW);
        _fundAndApprove(funder, 10_000e6);
    }

    function _fundAndApprove(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(thenar), type(uint256).max);
    }

    function _sign(uint256 taskId, address who, bytes32 h, uint16 score) internal view returns (bytes memory) {
        bytes32 digest = thenar.runDigest(taskId, who, h, CID, score);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _task(uint32 slots, uint256 amount) internal returns (uint256 id) {
        vm.prank(funder);
        id = thenar.createTask("Task", slots, REWARD, 1, 3, amount);
    }

    function _taskUntil(uint32 slots, uint256 amount, uint64 expiresAt) internal returns (uint256 id) {
        vm.prank(funder);
        id = thenar.createTaskUntil("Task", slots, REWARD, 1, 3, expiresAt, amount);
    }

    /// The contributor submits a verifier-signed run themselves.
    function _run(uint256 taskId, address who, bytes32 h, uint16 score) internal returns (uint256 trajectoryId) {
        // Signed before the prank: arguments evaluate first, so `_sign` would
        // otherwise consume the prank on its own view call.
        bytes memory sig = _sign(taskId, who, h, score);
        vm.prank(who);
        trajectoryId = thenar.submitTrajectory(taskId, h, CID, score, sig);
    }

    /// Fill a task with one run per contributor and mint its policy.
    function _filledPolicy(address[] memory who, uint16[] memory scores, uint128 licenceFee)
        internal
        returns (uint256 taskId, uint256 policyId)
    {
        taskId = _task(uint32(who.length), uint256(REWARD) * who.length);
        for (uint256 i; i < who.length; ++i) {
            _run(taskId, who[i], keccak256(abi.encode("policy run", taskId, i)), scores[i]);
        }
        vm.prank(funder); // only the funder sets the licence fee
        policyId = thenar.mintPolicy(taskId, licenceFee);
    }

    function _receiveDigest(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        return keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
    }
}
