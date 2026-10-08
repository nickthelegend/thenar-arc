// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IIdentityRegistry8004} from "./interfaces/IIdentityRegistry8004.sol";
import {IReputationRegistry8004} from "./interfaces/IReputationRegistry8004.sol";

interface IThenarProtocolVerifier {
    function verifier() external view returns (address);
}

/**
 * @title ThenarVerdicts
 * @notice Thenar's verifier as an ERC-8004 agent on Arc, and every verdict it
 *         signed that moved money, written to Arc's Reputation Registry.
 *
 * The verifier scores each recording and signs it; ThenarProtocol pays the
 * operator only against that signature. The verifier registers itself as an
 * agent in Arc's ERC-8004 Identity Registry, and anyone calls
 * `bindVerifier(agentId)` once: the binding holds only if that agent's
 * verified wallet (or owner) is the protocol's verifier key.
 *
 * From then on, every accepted run ThenarProtocol pays is written here as
 * ERC-8004 feedback on the verifier's agent:
 *
 *   giveFeedback(verifierAgentId, score, 2, "runVerdict", "thenar", "", "", trajHash)
 *
 * `score` is the verdict on a 0.00–100.00 scale (the protocol's 0–10000 with
 * two decimals) and `feedbackHash` is the run id, so the registry holds the
 * verifier's complete record of paid verdicts, client-filterable to this
 * contract (which only the protocol can drive, from a payout transaction).
 * Buyer agents rate the same agent from their own addresses after a purchase
 * (tag "corpusQuality", feedbackHash = sha256 of the bytes served), so a
 * reader can set the verifier's verdicts against what paying buyers found.
 *
 * Nothing here holds money. A failed registry write is reported
 * (`FeedbackFailed`) and never reaches the payout.
 *
 * Admin: the deployer sets the protocol address once (the two contracts
 * reference each other). There is no other power.
 */
contract ThenarVerdicts {
    string public constant TAG_VERDICT = "runVerdict";
    string public constant TAG_SOURCE = "thenar";

    IIdentityRegistry8004 public immutable identity;
    IReputationRegistry8004 public immutable reputation;
    address public immutable deployer;

    address public protocol;
    /// The verifier's ERC-8004 agent id + 1 (0 = not bound).
    uint256 private _agentPlusOne;

    uint64 public verdicts;
    uint64 public written;
    uint256 public scoreSum;

    event ProtocolSet(address indexed protocol);
    event VerifierBound(uint256 indexed agentId, address indexed verifier);
    event VerdictRecorded(
        uint256 indexed trajectoryId, uint256 indexed taskId, address indexed contributor,
        bytes32 trajHash, uint16 score, uint256 paid, bool feedbackWritten
    );
    event FeedbackFailed(uint256 indexed trajectoryId, bytes reason);

    error NotDeployer();
    error NotProtocol(address caller);
    error AlreadySet();
    error ZeroAddress();
    error NotVerifierAgent(uint256 agentId);
    error SelfAuthorized(uint256 agentId);

    constructor(address identity_, address reputation_) {
        if (identity_ == address(0) || reputation_ == address(0)) revert ZeroAddress();
        identity = IIdentityRegistry8004(identity_);
        reputation = IReputationRegistry8004(reputation_);
        deployer = msg.sender;
    }

    /// One time: the protocol this contract takes verdicts from.
    function setProtocol(address protocol_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (protocol != address(0)) revert AlreadySet();
        if (protocol_ == address(0)) revert ZeroAddress();
        protocol = protocol_;
        emit ProtocolSet(protocol_);
    }

    /**
     * Bind the verifier's ERC-8004 agent. Permissionless: it holds only if the
     * agent's verified wallet, or its owner, is the protocol's verifier key.
     * Rebinding is allowed under the same rule (a new registration).
     */
    function bindVerifier(uint256 agentId) external {
        address v = IThenarProtocolVerifier(protocol).verifier();
        if (identity.getAgentWallet(agentId) != v && identity.ownerOf(agentId) != v) revert NotVerifierAgent(agentId);
        // ERC-8004 refuses feedback from an agent's own owner or operators.
        if (identity.isAuthorizedOrOwner(address(this), agentId)) revert SelfAuthorized(agentId);
        _agentPlusOne = agentId + 1;
        emit VerifierBound(agentId, v);
    }

    function verifierAgent() external view returns (bool bound, uint256 agentId) {
        return (_agentPlusOne != 0, _agentPlusOne == 0 ? 0 : _agentPlusOne - 1);
    }

    /// Called by ThenarProtocol for every run it pays.
    function recordVerdict(
        uint256 trajectoryId, uint256 taskId, address contributor, bytes32 trajHash, uint16 score, uint256 paid
    ) external {
        if (msg.sender != protocol) revert NotProtocol(msg.sender);
        verdicts += 1;
        scoreSum += score;

        bool ok = false;
        uint256 plusOne = _agentPlusOne;
        if (plusOne != 0) {
            try reputation.giveFeedback(plusOne - 1, int128(uint128(score)), 2, TAG_VERDICT, TAG_SOURCE, "", "", trajHash) {
                ok = true;
                written += 1;
            } catch (bytes memory reason) {
                emit FeedbackFailed(trajectoryId, reason);
            }
        }
        emit VerdictRecorded(trajectoryId, taskId, contributor, trajHash, score, paid, ok);
    }

    /// Mean verdict across every paid run, 0–10000.
    function meanScore() external view returns (uint256) {
        return verdicts == 0 ? 0 : scoreSum / verdicts;
    }
}
