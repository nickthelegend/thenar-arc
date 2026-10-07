// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ThenarProtocol} from "../ThenarProtocol.sol";
import {ThenarCcipIntent} from "./ThenarCcipIntent.sol";

/**
 * @title ThenarCcipReceiver
 * @notice Corpus licences on Arc, for buyer agents on other chains.
 *
 *         ThenarCcipSender on Base / Ethereum burns the buyer's USDC with Circle
 *         CCTP V2 (minted here, on Arc) and sends the LICENSE instruction here
 *         with Chainlink CCIP. This contract then pays
 *         `ThenarProtocol.licensePolicyFor(policyId, buyer)`: the fee fans out
 *         to every operator who recorded the corpus, and the buyer holds the
 *         licence on Arc (`ThenarProtocol.licensed`).
 *
 * ## Order of arrival
 *
 * CCIP and CCTP are independent, so the instruction can arrive before the
 * dollars. An order whose dollars are not here yet is recorded Pending and
 * bought by `executePending` (anyone) once the CCTP mint lands.
 *
 * ## Defensive receiving
 *
 * `ccipReceive` (router only) rejects any (source chain, sender) pair not on
 * the owner's allowlist. The message then runs in `try this.processMessage`;
 * if that reverts it is stored as Failed (`MessageFailed`) instead of failing
 * the CCIP execution. Anyone may `retryFailedMessage`; the owner may resolve
 * one only if it still cannot be processed.
 *
 * ## Money accounting
 *
 *  - `pendingTotal`: amounts of Pending orders (here, or still in flight on CCTP).
 *  - `owedTotal`: credits for orders that could not become a licence (no such
 *    policy, an amount below the fee) and overpayments, withdrawable by the
 *    buyer's address on Arc with `withdrawOwed`.
 *
 * An order is bought only from `available() = balance - owedTotal`. The
 * owner's `sweep` reaches only `balance - (pendingTotal + owedTotal)`: CCTP
 * max-fee dust or tokens sent by mistake, never a buyer's money. The owner's
 * other powers are the sender allowlist and resolving unprocessable messages.
 */
contract ThenarCcipReceiver is CCIPReceiver, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Pending,
        Licensed,
        Cancelled,
        Rejected
    }

    enum MessageStatus {
        None,
        Failed,
        Resolved
    }

    struct Order {
        address licensee;
        Status status;
        uint64 sourceChainSelector;
        uint96 amount;
        uint256 policyId;
    }

    struct FailedMessage {
        MessageStatus status;
        uint64 sourceChainSelector;
        bytes sender;
        bytes data;
    }

    ThenarProtocol public immutable protocol;
    IERC20 public immutable usdc;

    mapping(uint64 => mapping(address => bool)) public allowedSenders;
    mapping(bytes32 orderId => Order) private _orders;
    mapping(bytes32 messageId => FailedMessage) private _failed;
    mapping(address licensee => uint256) public owed;

    uint256 public pendingTotal;
    uint256 public owedTotal;
    uint256 public licensesBought;

    event SenderAllowed(uint64 indexed sourceChainSelector, address indexed sender, bool allowed);
    event OrderReceived(
        bytes32 indexed orderId, bytes32 indexed messageId, uint64 indexed sourceChainSelector,
        address licensee, uint256 policyId, uint256 amount
    );
    event OrderLicensed(bytes32 indexed orderId, address indexed licensee, uint256 indexed policyId, uint256 fee);
    event OrderPending(bytes32 indexed orderId, uint256 available, uint256 amount);
    event OrderRejected(bytes32 indexed orderId, address indexed licensee, uint256 amount, bytes reason);
    event OrderCancelled(bytes32 indexed orderId, address indexed licensee, uint256 amount);
    event OwedWithdrawn(address indexed licensee, uint256 amount);
    event MessageFailed(bytes32 indexed messageId, bytes reason);
    event MessageRecovered(bytes32 indexed messageId);
    event MessageResolved(bytes32 indexed messageId);
    event Swept(address indexed to, uint256 amount);

    error SourceNotAllowed(uint64 sourceChainSelector, address sender);
    error OnlySelf();
    error UnknownAction(uint8 action);
    error ZeroAddress();
    error WrongStatus(bytes32 orderId, Status status);
    error NotFunded(uint256 available, uint256 amount);
    error NotLicensee(bytes32 orderId);
    error NotFailed(bytes32 messageId);
    error StillProcessable(bytes32 messageId);
    error NothingOwed(address licensee);
    error NothingToSweep();
    error RenounceDisabled();
    error InsufficientGas();
    error NotBuyable(uint256 policyId, uint256 amount);

    constructor(address router, address protocol_, address usdc_, address initialOwner)
        CCIPReceiver(router)
        Ownable(initialOwner)
    {
        if (protocol_ == address(0) || usdc_ == address(0)) revert ZeroAddress();
        protocol = ThenarProtocol(protocol_);
        usdc = IERC20(usdc_);
    }

    // ----------------------------------------------------------------- owner

    function allowSender(uint64 sourceChainSelector, address sender, bool allowed) external onlyOwner {
        if (sender == address(0)) revert ZeroAddress();
        allowedSenders[sourceChainSelector][sender] = allowed;
        emit SenderAllowed(sourceChainSelector, sender, allowed);
    }

    /// Recover USDC above everything committed (CCTP max-fee dust). Never reaches buyers' money.
    function sweep(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 committed = pendingTotal + owedTotal;
        uint256 bal = usdc.balanceOf(address(this));
        if (bal <= committed) revert NothingToSweep();
        uint256 excess = bal - committed;
        usdc.safeTransfer(to, excess);
        emit Swept(to, excess);
    }

    /// Mark a failed message resolved, only if it still cannot be processed.
    function resolveFailedMessage(bytes32 messageId) external onlyOwner {
        FailedMessage storage f = _failed[messageId];
        if (f.status != MessageStatus.Failed) revert NotFailed(messageId);
        uint256 gasBefore = gasleft();
        try this.processMessage(_rebuild(messageId, f)) {
            revert StillProcessable(messageId);
        } catch {
            if (gasleft() <= gasBefore / 63) revert InsufficientGas();
        }
        f.status = MessageStatus.Resolved;
        emit MessageResolved(messageId);
    }

    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ------------------------------------------------------------------ CCIP

    function _ccipReceive(Client.Any2EVMMessage memory message) internal override {
        address sender = abi.decode(message.sender, (address));
        if (!allowedSenders[message.sourceChainSelector][sender]) {
            revert SourceNotAllowed(message.sourceChainSelector, sender);
        }
        try this.processMessage(message) {}
        catch (bytes memory reason) {
            _failed[message.messageId] = FailedMessage({
                status: MessageStatus.Failed,
                sourceChainSelector: message.sourceChainSelector,
                sender: message.sender,
                data: message.data
            });
            emit MessageFailed(message.messageId, reason);
        }
    }

    /// Run a failed message again. Anyone may; it reverts (and stays Failed) if it still fails.
    function retryFailedMessage(bytes32 messageId) external nonReentrant {
        FailedMessage storage f = _failed[messageId];
        if (f.status != MessageStatus.Failed) revert NotFailed(messageId);
        address sender = abi.decode(f.sender, (address));
        if (!allowedSenders[f.sourceChainSelector][sender]) revert SourceNotAllowed(f.sourceChainSelector, sender);
        f.status = MessageStatus.Resolved;
        this.processMessage(_rebuild(messageId, f));
        emit MessageRecovered(messageId);
    }

    /// Decode and act on a message. Only this contract calls it, so a revert can be caught.
    function processMessage(Client.Any2EVMMessage calldata message) external {
        if (msg.sender != address(this)) revert OnlySelf();
        (uint8 action, bytes memory body) = abi.decode(message.data, (uint8, bytes));
        if (action != ThenarCcipIntent.LICENSE) revert UnknownAction(action);
        (bytes32 orderId, address licensee, uint256 policyId, uint256 amount) =
            abi.decode(body, (bytes32, address, uint256, uint256));
        if (licensee == address(0)) revert ZeroAddress();

        // Its dollars are on their way regardless: anything that can't become a licence is owed back.
        if (_orders[orderId].status != Status.None || amount == 0 || amount > type(uint96).max) {
            _credit(licensee, amount);
            emit OrderRejected(orderId, licensee, amount, "duplicate or invalid order");
            return;
        }
        Order storage o = _orders[orderId];
        o.licensee = licensee;
        o.status = Status.Pending;
        o.sourceChainSelector = message.sourceChainSelector;
        o.amount = uint96(amount);
        o.policyId = policyId;
        pendingTotal += amount;
        emit OrderReceived(orderId, message.messageId, message.sourceChainSelector, licensee, policyId, amount);

        uint256 fee;
        bool buyable;
        (buyable, fee) = _fee(policyId);
        if (!buyable || amount < fee) {
            o.status = Status.Rejected;
            pendingTotal -= amount;
            _credit(licensee, amount);
            emit OrderRejected(orderId, licensee, amount, "no such policy or amount below its fee");
            return;
        }
        uint256 avail = available();
        if (avail < amount) {
            emit OrderPending(orderId, avail, amount);
            return;
        }
        _buy(orderId, o, fee);
    }

    // -------------------------------------------------- permissionless follow-ups

    /// Buy a Pending order once its dollars are here. Reverts (state unchanged) if it can't be bought.
    function executePending(bytes32 orderId) external nonReentrant {
        Order storage o = _orders[orderId];
        if (o.status != Status.Pending) revert WrongStatus(orderId, o.status);
        (bool buyable, uint256 fee) = _fee(o.policyId);
        if (!buyable || o.amount < fee) revert NotBuyable(o.policyId, o.amount);
        uint256 avail = available();
        if (avail < o.amount) revert NotFunded(avail, o.amount);
        _buy(orderId, o, fee);
    }

    /// The licensee takes a Pending order's dollars back on Arc instead.
    function cancelPending(bytes32 orderId) external nonReentrant {
        Order storage o = _orders[orderId];
        if (o.status != Status.Pending) revert WrongStatus(orderId, o.status);
        if (msg.sender != o.licensee) revert NotLicensee(orderId);
        uint256 amount = o.amount;
        uint256 avail = available();
        if (avail < amount) revert NotFunded(avail, amount);
        o.status = Status.Cancelled;
        pendingTotal -= amount;
        emit OrderCancelled(orderId, o.licensee, amount);
        usdc.safeTransfer(o.licensee, amount);
    }

    /// Pay out credits for orders that could not become a licence, and overpayments.
    function withdrawOwed(address licensee) external nonReentrant {
        uint256 amount = owed[licensee];
        if (amount == 0) revert NothingOwed(licensee);
        owed[licensee] = 0;
        owedTotal -= amount;
        emit OwedWithdrawn(licensee, amount);
        usdc.safeTransfer(licensee, amount);
    }

    // ----------------------------------------------------------------- views

    /// USDC free to buy orders with: the balance less credits owed.
    function available() public view returns (uint256) {
        uint256 bal = usdc.balanceOf(address(this));
        return bal > owedTotal ? bal - owedTotal : 0;
    }

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function getFailedMessage(bytes32 messageId) external view returns (FailedMessage memory) {
        return _failed[messageId];
    }

    // ------------------------------------------------------------- internals

    function _fee(uint256 policyId) private view returns (bool buyable, uint256 fee) {
        if (policyId >= protocol.policyCount()) return (false, 0);
        ThenarProtocol.Policy memory p = protocol.getPolicy(policyId);
        return (true, p.licenceFee);
    }

    function _buy(bytes32 orderId, Order storage o, uint256 fee) private {
        uint256 amount = o.amount;
        o.status = Status.Licensed;
        pendingTotal -= amount;
        licensesBought += 1;
        usdc.forceApprove(address(protocol), fee);
        protocol.licensePolicyFor(o.policyId, o.licensee);
        // Anything above the fee (a buyer who overpaid) is theirs to withdraw on Arc.
        if (amount > fee) _credit(o.licensee, amount - fee);
        emit OrderLicensed(orderId, o.licensee, o.policyId, fee);
    }

    function _credit(address licensee, uint256 amount) private {
        if (amount == 0) return;
        owed[licensee] += amount;
        owedTotal += amount;
    }

    function _rebuild(bytes32 messageId, FailedMessage storage f) private view returns (Client.Any2EVMMessage memory) {
        return Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: f.sourceChainSelector,
            sender: f.sender,
            data: f.data,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });
    }
}
