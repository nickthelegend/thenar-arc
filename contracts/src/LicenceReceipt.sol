// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IWarpMessenger {
    function sendWarpMessage(bytes calldata payload) external returns (bytes32 messageID);
    function getBlockchainID() external view returns (bytes32 blockchainID);
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
 * @title LicenceReceipt
 * @notice A licence proof any other chain can check, without asking us.
 *
 * Warp receipts were on the blocked list because I assumed cross-chain
 * anything needed a second chain I could not afford gas on. That is true of
 * *delivering* a message and false of *producing* one. The Warp precompile is
 * live on Fuji's C-Chain — getBlockchainID answers — and a message sent
 * through it is signed by the chain's own validators. The signed message is
 * the artefact, and it exists whether or not anybody has yet carried it
 * somewhere.
 *
 * That distinction is the whole idea here. A licence is currently provable by
 * reading this contract, which means trusting an RPC endpoint someone chose. A
 * Warp receipt is provable by checking Fuji's validator signatures, which any
 * chain that knows Fuji's validator set can do offline and without us.
 *
 * Nothing is asserted by the caller. The policy is read from the protocol at
 * attestation time, so a receipt cannot claim a licence fee, a contributor
 * count or a mint date that the protocol does not hold.
 *
 * What this does not do is deliver. Delivery needs a destination chain and gas
 * on it; this produces the proof and returns its id.
 */
contract LicenceReceipt {
    IWarpMessenger constant WARP = IWarpMessenger(0x0200000000000000000000000000000000000005);

    IAxonPolicies public immutable axon;

    /// Bumped if the payload layout ever changes, so a reader can refuse a
    /// receipt it does not know how to parse rather than misread one.
    uint8 public constant FORMAT = 1;

    error NoSuchPolicy();

    event Attested(uint256 indexed policyId, bytes32 indexed messageID, address indexed by);

    constructor(address protocol) {
        axon = IAxonPolicies(protocol);
    }

    /// The chain these receipts are signed by, for a verifier that needs to
    /// know whose validator set to check against.
    function sourceChain() external view returns (bytes32) {
        return WARP.getBlockchainID();
    }

    /**
     * @notice Emit a signed receipt for a policy, as the protocol records it.
     *
     * Callable by anyone. A receipt states facts already public on this chain,
     * so there is nothing to gate — and a proof only its subject can produce is
     * one they can also refuse to produce.
     */
    function attest(uint256 policyId) external returns (bytes32 messageID) {
        if (policyId >= axon.policyCount()) revert NoSuchPolicy();
        IAxonPolicies.Policy memory p = axon.getPolicy(policyId);

        // Read from the protocol, never from the caller. The payload is the
        // claim, so every field in it has to come from the contract that would
        // be lied about.
        bytes memory payload = abi.encode(
            FORMAT,
            address(axon),
            policyId,
            p.taskId,
            p.minter,
            p.trajectories,
            p.mintedAt,
            p.licenceFee,
            p.licencesSold,
            p.distributed
        );

        messageID = WARP.sendWarpMessage(payload);
        emit Attested(policyId, messageID, msg.sender);
    }

    /// What `attest` would sign, so a reader can check a receipt against the
    /// live protocol without decoding a transaction.
    function payloadFor(uint256 policyId) external view returns (bytes memory) {
        IAxonPolicies.Policy memory p = axon.getPolicy(policyId);
        return abi.encode(
            FORMAT, address(axon), policyId, p.taskId, p.minter,
            p.trajectories, p.mintedAt, p.licenceFee, p.licencesSold, p.distributed
        );
    }
}
