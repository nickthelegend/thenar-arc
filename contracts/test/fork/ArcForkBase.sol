// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {ThenarProtocol} from "../../src/ThenarProtocol.sol";
import {ThenarVerdicts} from "../../src/ThenarVerdicts.sol";
import {PasskeyRegistry} from "../../src/PasskeyRegistry.sol";

interface IFiatToken {
    function name() external view returns (string memory);
    function version() external view returns (string memory);
    function decimals() external view returns (uint8);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function RECEIVE_WITH_AUTHORIZATION_TYPEHASH() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    function isBlacklisted(address account) external view returns (bool);
    function blacklister() external view returns (address);
    function blacklist(address account) external;
    function unBlacklist(address account) external;
}

/**
 * Shared setup for the Arc testnet fork suites. Opt-in, so `forge test` stays offline:
 *
 *   ARC_FORK_TESTS=1 <arc-foundry>/forge test --network arc --match-path 'test/fork/*' -vv
 *
 * ARC_TESTNET_RPC overrides the RPC (default https://rpc.testnet.arc.io).
 * Circle's Arc Foundry (`--network arc`) runs Arc's precompiles, so the native
 * USDC balance (18 decimals) and its ERC-20 view at 0x3600…0000 (6 decimals)
 * move together, Memo's CallFrom works, and P-256 verifies at 0x0100.
 */
abstract contract ArcForkBase is Test {
    // Arc testnet (5042002): Circle, ERC-8004, Memo and Chainlink CCIP (script/ArcConfig.sol).
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant IDENTITY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address internal constant REPUTATION = 0x8004B663056A597Dffe9eCcC1965A193B7388713;
    address internal constant MEMO = 0x5294E9927c3306DcBaDb03fe70b92e01cCede505;
    address internal constant TOKEN_MESSENGER_V2 = 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA;
    address internal constant CCIP_ROUTER = 0xdE4E7FED43FAC37EB21aA0643d9852f75332eab8;
    uint64 internal constant ARC_SELECTOR = 3034092155422581607;
    uint64 internal constant BASE_SEPOLIA = 10344971235874465080;
    uint32 internal constant BASE_CCTP_DOMAIN = 6;
    /// Anvil dev account #1: on Circle's blocklist on Arc testnet.
    address internal constant BLOCKLISTED = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    uint128 internal constant REWARD = 0.4e6;
    uint128 internal constant MAX_ESCROW = 1_000e6;
    string internal constant CID = "ipfs://bafkreithenarforkrun";

    uint256 internal verifierKey = 0xA11CE;
    address internal verifier;
    address internal treasury = makeAddr("thenar treasury");
    address internal funder = makeAddr("sponsor");

    PasskeyRegistry internal passkeys;
    ThenarVerdicts internal verdicts;
    ThenarProtocol internal thenar;

    function setUp() public virtual {
        if (vm.envOr("ARC_FORK_TESTS", uint256(0)) != 1) vm.skip(true);
        vm.createSelectFork(vm.envOr("ARC_TESTNET_RPC", string("https://rpc.testnet.arc.io")));
        assertEq(block.chainid, 5042002, "not Arc testnet");
        verifier = vm.addr(verifierKey);
    }

    /// The real contracts, wired as Deploy.s.sol wires them, against Circle's USDC and ERC-8004.
    function _deployThenar() internal {
        passkeys = new PasskeyRegistry();
        verdicts = new ThenarVerdicts(IDENTITY, REPUTATION);
        thenar = new ThenarProtocol(verifier, treasury, address(passkeys), USDC, address(verdicts), MAX_ESCROW);
        verdicts.setProtocol(address(thenar));
    }

    /// Give `who` `amount6` USDC (6 decimals) the Arc way: set the native balance (18 decimals),
    /// which is the same balance the ERC-20 at 0x3600…0000 reports.
    function _giveUsdc(address who, uint256 amount6) internal {
        vm.deal(who, amount6 * 1e12);
    }

    function _sign(uint256 taskId, address who, bytes32 h, uint16 score) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, thenar.runDigest(taskId, who, h, CID, score));
        return abi.encodePacked(r, s, v);
    }

    function _task(uint32 slots, uint256 amount) internal returns (uint256 id) {
        _giveUsdc(funder, amount);
        vm.startPrank(funder);
        IERC20Like(USDC).approve(address(thenar), amount);
        id = thenar.createTask("Arc fork task", slots, REWARD, 1, 3, amount);
        vm.stopPrank();
    }

    function _run(uint256 taskId, address who, bytes32 h, uint16 score) internal returns (uint256 trajectoryId) {
        bytes memory sig = _sign(taskId, who, h, score);
        vm.prank(who);
        trajectoryId = thenar.submitTrajectory(taskId, h, CID, score, sig);
    }

    function _usdc(address who) internal view returns (uint256) {
        return IERC20Like(USDC).balanceOf(who);
    }
}

interface IERC20Like {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}
