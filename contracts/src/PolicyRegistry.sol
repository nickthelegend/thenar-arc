// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITeleporterReceiver {
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external;
}

/**
 * @title PolicyRegistry
 * @notice What another chain knows about a Thenar policy, without asking us.
 *
 * This is the far end of an announcement. It lives on a different chain from
 * the protocol, holds no connection to it, and cannot call it. Everything it
 * knows arrived as a message whose authenticity was established by the
 * destination chain's own validators checking the source chain's signatures —
 * not by trusting a relayer, and not by trusting Thenar.
 *
 * The trust rule is the whole contract. Three things are checked before a
 * policy is written: the messenger delivered it, the source chain is the one
 * this registry was told to believe, and the sender on that chain is the
 * announcer it was told to believe. A message failing any of them is rejected
 * rather than recorded, because a registry that recorded whatever arrived
 * would be worth exactly as much as an unauthenticated HTTP endpoint.
 *
 * Announcements are idempotent. A relayer may deliver, and the protocol may
 * re-announce, without the record changing underneath a reader — the same
 * policy arriving twice updates nothing and emits nothing.
 */
contract PolicyRegistry is ITeleporterReceiver {
    struct Policy {
        uint256 taskId;
        address minter;
        uint32 trajectories;
        uint64 mintedAt;
        uint128 licenceFee;
        uint64 receivedAt;
        bool known;
    }

    address public immutable messenger;
    bytes32 public immutable sourceBlockchainID;
    address public immutable announcer;

    mapping(uint256 => Policy) private _policies;
    uint256[] private _ids;

    event PolicyReceived(
        uint256 indexed policyId, uint256 indexed taskId, uint32 trajectories, uint128 licenceFee
    );

    error NotMessenger();
    error WrongSourceChain(bytes32 got);
    error WrongAnnouncer(address got);

    constructor(address messenger_, bytes32 sourceBlockchainID_, address announcer_) {
        messenger = messenger_;
        sourceBlockchainID = sourceBlockchainID_;
        announcer = announcer_;
    }

    /// @inheritdoc ITeleporterReceiver
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID_,
        address originSenderAddress,
        bytes calldata message
    ) external {
        // Only the messenger has checked the validator signatures. A direct
        // call has proved nothing, however well-formed its arguments look.
        if (msg.sender != messenger) revert NotMessenger();
        if (sourceBlockchainID_ != sourceBlockchainID) revert WrongSourceChain(sourceBlockchainID_);
        if (originSenderAddress != announcer) revert WrongAnnouncer(originSenderAddress);

        (
            uint256 policyId,
            uint256 taskId,
            address minter,
            uint32 trajectories,
            uint64 mintedAt,
            uint128 licenceFee
        ) = abi.decode(message, (uint256, uint256, address, uint32, uint64, uint128));

        if (_policies[policyId].known) return;

        _policies[policyId] = Policy({
            taskId: taskId,
            minter: minter,
            trajectories: trajectories,
            mintedAt: mintedAt,
            licenceFee: licenceFee,
            receivedAt: uint64(block.timestamp),
            known: true
        });
        _ids.push(policyId);

        emit PolicyReceived(policyId, taskId, trajectories, licenceFee);
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return _policies[policyId];
    }

    function knows(uint256 policyId) external view returns (bool) {
        return _policies[policyId].known;
    }

    function count() external view returns (uint256) {
        return _ids.length;
    }

    function idAt(uint256 i) external view returns (uint256) {
        return _ids[i];
    }
}
