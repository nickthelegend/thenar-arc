// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ITokenMessengerV2} from "../interfaces/ITokenMessengerV2.sol";
import {ThenarCcipIntent} from "./ThenarCcipIntent.sol";

/**
 * @title ThenarCcipSender
 * @notice Deployed on a source chain (Base Sepolia / Ethereum Sepolia; Base /
 *         Ethereum on mainnet). A buyer agent holding USDC there licenses a
 *         Thenar corpus on Arc in one transaction, never holding anything on Arc.
 *
 *         "CCTP moves the dollars, CCIP carries the instruction" (USDC is not a
 *         CCIP token on Arc):
 *           1. `buyLicence` burns `fee + maxFee` USDC here with Circle CCTP V2,
 *              minted on Arc (domain 26) to ThenarCcipReceiver;
 *           2. and sends the LICENSE instruction there with Chainlink CCIP.
 *         The receiver buys `ThenarProtocol.licensePolicyFor(policyId, buyer)`
 *         once both have arrived, in either order; the fee fans out to every
 *         operator who recorded the corpus.
 *
 *         CCIP fees are paid in this chain's native coin (`msg.value`,
 *         `feeToken = address(0)`); any excess is refunded.
 *
 * @dev Ownerless: every destination parameter is immutable.
 */
contract ThenarCcipSender is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IRouterClient public immutable router;
    IERC20 public immutable usdc;
    ITokenMessengerV2 public immutable tokenMessenger;
    uint64 public immutable arcChainSelector;
    address public immutable arcReceiver;
    /// Gas for the receiver's `ccipReceive` on Arc: record the order and buy the licence (fan-out included).
    uint256 public immutable licenceGasLimit;

    uint32 public constant ARC_CCTP_DOMAIN = ThenarCcipIntent.ARC_CCTP_DOMAIN;

    /// Orders from this contract, so each one has a unique id.
    uint256 public orders;

    event LicenceOrdered(
        bytes32 indexed messageId,
        bytes32 indexed orderId,
        address indexed licensee,
        uint256 policyId,
        uint256 amount,
        uint256 maxFee,
        uint256 ccipFee
    );

    error ZeroAddress();
    error InvalidAmount(uint256 amount);
    error InsufficientFee(uint256 sent, uint256 fee);
    error RefundFailed();

    constructor(
        address router_,
        address usdc_,
        address tokenMessenger_,
        uint64 arcChainSelector_,
        address arcReceiver_,
        uint256 licenceGasLimit_
    ) {
        if (router_ == address(0) || usdc_ == address(0) || tokenMessenger_ == address(0) || arcReceiver_ == address(0)) {
            revert ZeroAddress();
        }
        router = IRouterClient(router_);
        usdc = IERC20(usdc_);
        tokenMessenger = ITokenMessengerV2(tokenMessenger_);
        arcChainSelector = arcChainSelector_;
        arcReceiver = arcReceiver_;
        licenceGasLimit = licenceGasLimit_;
    }

    /// The order id the next `buyLicence` from `licensee` will carry.
    function nextOrderId(address licensee) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), licensee, orders));
    }

    /// The CCIP fee, in this chain's native coin, for a licence order.
    function quote(uint256 policyId, uint256 amount) external view returns (uint256) {
        return router.getFee(
            arcChainSelector,
            _message(ThenarCcipIntent.license(nextOrderId(msg.sender), msg.sender, policyId, amount))
        );
    }

    /**
     * License policy `policyId` on Arc for `msg.sender`, paying `amount` USDC
     * (the policy's licence fee) from this chain.
     *
     * Approve this contract for `amount + maxFee` first. `maxFee` and
     * `minFinalityThreshold` pass straight to CCTP V2: `(0, 2000)` is a
     * standard transfer; a fast transfer uses `minFinalityThreshold <= 1000`
     * and a `maxFee` from Circle's fee API. The receiver gets at least `amount`.
     *
     * If the licence can't be bought on Arc (wrong amount, no such policy),
     * the dollars are held for `msg.sender`'s address on Arc
     * (ThenarCcipReceiver.withdrawOwed).
     */
    function buyLicence(uint256 policyId, uint256 amount, uint256 maxFee, uint32 minFinalityThreshold)
        external
        payable
        nonReentrant
        returns (bytes32 messageId, bytes32 orderId)
    {
        if (amount == 0 || amount > type(uint96).max) revert InvalidAmount(amount);
        orderId = nextOrderId(msg.sender);
        orders += 1;

        uint256 total = amount + maxFee;
        usdc.safeTransferFrom(msg.sender, address(this), total);
        usdc.forceApprove(address(tokenMessenger), total);
        tokenMessenger.depositForBurn(
            total,
            ARC_CCTP_DOMAIN,
            bytes32(uint256(uint160(arcReceiver))),
            address(usdc),
            bytes32(0), // anyone may complete the mint on Arc
            maxFee,
            minFinalityThreshold
        );

        Client.EVM2AnyMessage memory m = _message(ThenarCcipIntent.license(orderId, msg.sender, policyId, amount));
        uint256 fee = router.getFee(arcChainSelector, m);
        if (msg.value < fee) revert InsufficientFee(msg.value, fee);
        messageId = router.ccipSend{value: fee}(arcChainSelector, m);
        if (msg.value > fee) {
            (bool ok,) = msg.sender.call{value: msg.value - fee}("");
            if (!ok) revert RefundFailed();
        }
        emit LicenceOrdered(messageId, orderId, msg.sender, policyId, amount, maxFee, fee);
    }

    function _message(bytes memory data) private view returns (Client.EVM2AnyMessage memory) {
        return Client.EVM2AnyMessage({
            receiver: abi.encode(arcReceiver),
            data: data,
            tokenAmounts: new Client.EVMTokenAmount[](0),
            extraArgs: Client._argsToBytes(
                Client.GenericExtraArgsV2({gasLimit: licenceGasLimit, allowOutOfOrderExecution: true})
            ),
            feeToken: address(0)
        });
    }
}
