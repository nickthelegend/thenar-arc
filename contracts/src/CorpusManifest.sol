// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CorpusManifest
 * @notice What a task's corpus contains, committed once and checkable by anyone.
 *
 * The protocol records each accepted run's hash as it happens, which proves
 * every episode is real and proves nothing about the set. A buyer who
 * downloads a corpus holds a file, and the only thing telling them it is the
 * whole corpus is the same server that produced it. An episode could be
 * missing and there would be no way to tell — not because anyone lied, but
 * because a list of individually-valid hashes has no statement in it about
 * being complete.
 *
 * So the set gets one hash. A Merkle root over every episode hash in the task,
 * committed here, turns "here is your corpus" into something a buyer can check
 * against the chain: the root they compute from the file they downloaded
 * either matches what was committed or it does not, and a single episode can
 * be proved to belong without downloading the rest.
 *
 * Only the verifier may commit. That is the same key that scores runs and
 * whose signature the protocol already requires, so this introduces no new
 * authority — the party that decides what an episode is worth is the party
 * that says which episodes there were.
 *
 * A root may be replaced, because a corpus grows: a task with four episodes
 * becomes a task with five, and the earlier commitment was not wrong. Every
 * version is kept and emitted, so a licence bought against an older root stays
 * checkable after the corpus has moved on — which is the case that matters,
 * and the reason this does not simply overwrite.
 */
contract CorpusManifest {
    struct Commitment {
        bytes32 root;
        uint32 episodes;
        uint64 at;
    }

    /// @notice The verifier key. The same one the protocol checks signatures against.
    address public immutable verifier;

    /// @dev taskId => every commitment made for it, oldest first.
    mapping(uint256 => Commitment[]) private _history;

    event Committed(
        uint256 indexed taskId,
        bytes32 indexed root,
        uint32 episodes,
        uint256 version
    );

    error NotVerifier();
    error EmptyCorpus();
    error Unchanged();
    error NoCommitment();

    constructor(address verifier_) {
        if (verifier_ == address(0)) revert NotVerifier();
        verifier = verifier_;
    }

    /**
     * @notice Commit the current contents of a task's corpus.
     * @param taskId The task whose episodes the root covers.
     * @param root Merkle root over every accepted episode hash, pairs sorted.
     * @param episodes How many episodes went into it, so a reader can tell a
     *        growing corpus from a replaced one without recomputing.
     */
    function commit(uint256 taskId, bytes32 root, uint32 episodes) external {
        if (msg.sender != verifier) revert NotVerifier();
        // A root over nothing is bytes32(0), and committing it would mean "this
        // task has a corpus" while proving no episode is in it.
        if (root == bytes32(0) || episodes == 0) revert EmptyCorpus();

        Commitment[] storage h = _history[taskId];
        // Re-committing an unchanged corpus costs gas and adds a version that
        // says nothing. It is refused rather than silently accepted, so a
        // version number always means the corpus actually moved.
        if (h.length > 0 && h[h.length - 1].root == root) revert Unchanged();

        h.push(Commitment({root: root, episodes: episodes, at: uint64(block.timestamp)}));
        emit Committed(taskId, root, episodes, h.length - 1);
    }

    /// @notice The current commitment for a task.
    function latest(uint256 taskId) external view returns (Commitment memory) {
        Commitment[] storage h = _history[taskId];
        if (h.length == 0) revert NoCommitment();
        return h[h.length - 1];
    }

    /// @notice A specific version, so a licence bought against an older corpus
    ///         stays checkable after the corpus has grown.
    function at(uint256 taskId, uint256 version) external view returns (Commitment memory) {
        if (version >= _history[taskId].length) revert NoCommitment();
        return _history[taskId][version];
    }

    function versions(uint256 taskId) external view returns (uint256) {
        return _history[taskId].length;
    }

    /**
     * @notice Whether an episode belongs to a task's committed corpus.
     * @dev On chain so a contract can ask, and so the answer does not depend on
     *      anyone's server. The browser runs the same walk against the same
     *      root; this is here for the caller that cannot.
     */
    function contains(uint256 taskId, bytes32 episode, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        Commitment[] storage h = _history[taskId];
        if (h.length == 0) revert NoCommitment();
        return _verify(episode, proof, h[h.length - 1].root);
    }

    function containsAt(
        uint256 taskId,
        uint256 version,
        bytes32 episode,
        bytes32[] calldata proof
    ) external view returns (bool) {
        if (version >= _history[taskId].length) revert NoCommitment();
        return _verify(episode, proof, _history[taskId][version].root);
    }

    /// @dev Sorted pairs, so a proof carries no left/right flags: the ordering
    ///      is re-derived from the values. Matches lib/merkle.ts exactly.
    function _verify(bytes32 leaf, bytes32[] calldata proof, bytes32 root)
        private
        pure
        returns (bool)
    {
        bytes32 node = leaf;
        for (uint256 i = 0; i < proof.length; ++i) {
            bytes32 s = proof[i];
            node = node < s
                ? keccak256(abi.encodePacked(node, s))
                : keccak256(abi.encodePacked(s, node));
        }
        return node == root;
    }
}
