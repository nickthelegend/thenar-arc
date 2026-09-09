// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct TeleporterFeeInfo {
    address feeTokenAddress;
    uint256 amount;
}

struct TeleporterMessageInput {
    bytes32 destinationBlockchainID;
    address destinationAddress;
    TeleporterFeeInfo feeInfo;
    uint256 requiredGasLimit;
    address[] allowedRelayerAddresses;
    bytes message;
}

interface ITeleporterMessenger {
    function sendCrossChainMessage(TeleporterMessageInput calldata messageInput)
        external
        returns (bytes32 messageID);
}

interface IAxonPolicies {
    struct Policy {
        uint256 taskId;
        address minter;
        uint32 trajectories;
        uint64 mintedAt;
        uint128 licenceFee;
        uint32 licencesSold;
        uint128 distributed;
    }

    function getPolicy(uint256 id) external view returns (Policy memory);
    function policyCount() external view returns (uint256);
}

/**
 * @title PolicyAnnouncer
 * @notice Deliver a minted policy to another chain, rather than only proving it here.
 *
 * LicenceReceipt stops one step short on purpose: it produces a Warp message
 * signed by this chain's validators and says, correctly, that delivery is a
 * separate problem needing a destination chain and gas on it. This is that
 * step. Interchain Messaging carries the signed message the rest of the way,
 * and a contract on the destination chain ends up holding the policy without
 * ever having asked us for it.
 *
 * The difference matters for the thing being built. A policy that is only
 * readable here is a policy other people have to trust our endpoint for. A
 * policy delivered by ICM is verified against this chain's validator
 * signatures by the receiving chain itself, so a market on another chain can
 * price a licence without trusting Thenar at all.
 *
 * As with the receipt, nothing is asserted by the caller. The policy is read
 * out of the protocol at announcement time, so an announcement cannot claim a
 * trajectory count, a licence fee or a mint date the protocol does not hold.
 */
contract PolicyAnnouncer {
    ITeleporterMessenger public immutable messenger;
    IAxonPolicies public immutable protocol;

    /// @notice Gas the destination is allowed for the receive call. Enough for
    ///         one struct write and an event; a relayer that offers less is
    ///         refused by the messenger rather than half-applying the message.
    uint256 public constant RECEIVE_GAS = 300_000;

    event PolicyAnnounced(
        uint256 indexed policyId,
        bytes32 indexed destinationBlockchainID,
        address destinationAddress,
        bytes32 messageID
    );

    error NoSuchPolicy();

    constructor(address messenger_, address protocol_) {
        messenger = ITeleporterMessenger(messenger_);
        protocol = IAxonPolicies(protocol_);
    }

    /**
     * @notice Announce a minted policy to a contract on another chain.
     * @dev Permissionless by design. The announcement carries only what the
     *      protocol already published, so there is nothing for a caller to
     *      gain by sending one that the destination could not have read here
     *      anyway — and no reason to keep an honest one from being sent.
     * @return messageID The messenger's id for the message, for tracing the
     *      delivery on the destination chain.
     */
    function announce(uint256 policyId, bytes32 destinationBlockchainID, address destinationAddress)
        external
        returns (bytes32 messageID)
    {
        if (policyId >= protocol.policyCount()) revert NoSuchPolicy();
        IAxonPolicies.Policy memory p = protocol.getPolicy(policyId);

        messageID = messenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainID,
                destinationAddress: destinationAddress,
                // No fee. A relayer that carries this is doing so because the
                // network operator runs it, which is the arrangement on a
                // chain the operator owns.
                feeInfo: TeleporterFeeInfo({feeTokenAddress: address(0), amount: 0}),
                requiredGasLimit: RECEIVE_GAS,
                allowedRelayerAddresses: new address[](0),
                message: abi.encode(
                    policyId, p.taskId, p.minter, p.trajectories, p.mintedAt, p.licenceFee
                )
            })
        );

        emit PolicyAnnounced(policyId, destinationBlockchainID, destinationAddress, messageID);
    }
}
