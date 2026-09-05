// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PasskeyRegistry
 * @notice Verifies WebAuthn-grade secp256r1 signatures on chain, natively.
 *
 * Axon's operators are gig workers, and the seed phrase is where that funnel
 * dies. Monad ships the P256 precompile from EIP-7951 at 0x0100, so a run can
 * be authorised with Touch ID instead — the same curve a passkey already uses,
 * verified by the chain rather than by a server the operator has to trust.
 *
 * Ethereum mainnet has no such precompile: verifying secp256r1 there costs
 * hundreds of thousands of gas in Solidity. Here it is a staticcall.
 */
contract PasskeyRegistry {
    address public constant P256_VERIFY = 0x0000000000000000000000000000000000000100;

    struct Passkey {
        bytes32 x;
        bytes32 y;
        uint64 registeredAt;
    }

    mapping(address => Passkey) private _keys;
    /// Each signed digest may only be spent once.
    mapping(address => mapping(bytes32 => bool)) public used;

    event PasskeyRegistered(address indexed owner, bytes32 x, bytes32 y);
    event PasskeyRevoked(address indexed owner);
    event DigestAuthorised(address indexed owner, bytes32 indexed digest);

    error NoPasskey();
    error BadSignature();
    error AlreadyUsed();
    error PrecompileUnavailable();

    /// @notice Bind a secp256r1 public key to the caller's address.
    function register(bytes32 x, bytes32 y) external {
        _keys[msg.sender] = Passkey({x: x, y: y, registeredAt: uint64(block.timestamp)});
        emit PasskeyRegistered(msg.sender, x, y);
    }

    function revoke() external {
        delete _keys[msg.sender];
        emit PasskeyRevoked(msg.sender);
    }

    function passkeyOf(address who) external view returns (Passkey memory) {
        return _keys[who];
    }

    function hasPasskey(address who) public view returns (bool) {
        Passkey storage k = _keys[who];
        return k.x != bytes32(0) || k.y != bytes32(0);
    }

    /**
     * @notice Verify a signature against an arbitrary public key.
     * @dev The precompile takes 160 bytes — digest, r, s, x, y — and answers
     *      with 32 bytes of 1 on success or empty on failure.
     */
    function verifyWithKey(bytes32 digest, bytes32 r, bytes32 s, bytes32 x, bytes32 y)
        public view returns (bool)
    {
        (bool ok, bytes memory out) = P256_VERIFY.staticcall(abi.encodePacked(digest, r, s, x, y));
        if (!ok) revert PrecompileUnavailable();
        return out.length == 32 && uint256(bytes32(out)) == 1;
    }

    /// @notice Verify against the key registered to `who`.
    function verify(address who, bytes32 digest, bytes32 r, bytes32 s) public view returns (bool) {
        Passkey storage k = _keys[who];
        if (!hasPasskey(who)) revert NoPasskey();
        return verifyWithKey(digest, r, s, k.x, k.y);
    }

    /**
     * @notice Spend a digest: verify it against the registered key and record
     *         that it has been used, so the same signature cannot be replayed.
     */
    function authorise(address who, bytes32 digest, bytes32 r, bytes32 s) external {
        if (used[who][digest]) revert AlreadyUsed();
        if (!verify(who, digest, r, s)) revert BadSignature();
        used[who][digest] = true;
        emit DigestAuthorised(who, digest);
    }

    /// @notice The exact 160-byte payload the precompile receives, for clients.
    function precompileInput(bytes32 digest, bytes32 r, bytes32 s, bytes32 x, bytes32 y)
        external pure returns (bytes memory)
    {
        return abi.encodePacked(digest, r, s, x, y);
    }
}
