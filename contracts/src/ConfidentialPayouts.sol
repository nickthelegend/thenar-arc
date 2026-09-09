// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ConfidentialPayouts
 * @notice Contributor earnings that add up in public and read only to their owner.
 *
 * Confidential payouts were on the blocked list as "needs eERC", and eERC is an
 * Avalanche standard I cannot deploy here. What that reasoning missed is that
 * the property being asked for is not a standard — it is additively homomorphic
 * encryption, which is EVM arithmetic and needs no L1 and no new chain.
 *
 * Every payout on this protocol is currently public: the amount is in the
 * transaction, the recipient is in the event, and anyone can total a
 * contributor's income to the wei. That is fine for auditing the protocol and
 * poor for the contributor, who did not sign up to publish their earnings.
 *
 * So an amount is added here as an ElGamal ciphertext on secp256k1 under the
 * contributor's own key. Ciphertexts add — (c1,c2) + (c1',c2') is an encryption
 * of the sum — so the running total accumulates on chain without the chain
 * ever holding a number. Only the holder of the private key can open it.
 *
 * What is deliberately not claimed. This hides amounts, not recipients: who was
 * paid is still visible, and hiding that needs a mixer, which is a different
 * project with different consequences. There are no range proofs, so a caller
 * who is trusted to add can add anything — here that caller is the protocol's
 * own verifier, which already decides what a run is worth, so it grants nothing
 * new. A production eERC adds exactly those proofs, and this is not one.
 */
contract ConfidentialPayouts {
    /// secp256k1, the curve Ethereum keys already live on, so a contributor
    /// needs no second keypair to be paid confidentially.
    uint256 constant P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F;
    uint256 constant A = 0;

    struct Point { uint256 x; uint256 y; }
    /// An ElGamal ciphertext: (r·G, m·G + r·PK).
    struct Cipher { Point c1; Point c2; }

    address public immutable adder;

    mapping(address => Cipher) private _total;
    mapping(address => Point) public keyOf;
    mapping(address => uint32) public entries;

    error NotTheAdder();
    error NoKey();
    error KeyAlreadySet();
    error NotOnCurve();

    event KeyRegistered(address indexed who, uint256 x, uint256 y);
    event Accrued(address indexed who, uint32 entries);

    constructor(address adder_) {
        adder = adder_;
    }

    /**
     * @notice Publish the public key your earnings will be encrypted to.
     *
     * Set once. Rotating it would strand the total already accumulated under
     * the old key — the ciphertexts are not re-encryptable without decrypting
     * them, which is the whole point.
     */
    function registerKey(uint256 x, uint256 y) external {
        if (keyOf[msg.sender].x != 0 || keyOf[msg.sender].y != 0) revert KeyAlreadySet();
        if (!onCurve(x, y)) revert NotOnCurve();
        keyOf[msg.sender] = Point(x, y);
        emit KeyRegistered(msg.sender, x, y);
    }

    /**
     * @notice Add an encrypted amount to someone's running total.
     *
     * The ciphertext is produced off chain by whoever knows the amount — here
     * the verifier, which already decides what a run pays. This contract never
     * sees the number, and adding is the only thing it can do with it.
     */
    function accrue(address who, Cipher calldata amount) external {
        if (msg.sender != adder) revert NotTheAdder();
        if (keyOf[who].x == 0 && keyOf[who].y == 0) revert NoKey();

        Cipher storage t = _total[who];
        if (entries[who] == 0) {
            t.c1 = amount.c1;
            t.c2 = amount.c2;
        } else {
            (t.c1.x, t.c1.y) = add(t.c1.x, t.c1.y, amount.c1.x, amount.c1.y);
            (t.c2.x, t.c2.y) = add(t.c2.x, t.c2.y, amount.c2.x, amount.c2.y);
        }
        entries[who] += 1;
        emit Accrued(who, entries[who]);
    }

    /// The encrypted total. Public, and meaningless without the private key.
    function totalOf(address who) external view returns (Cipher memory) {
        return _total[who];
    }

    // ------------------------------------------------------- curve arithmetic

    function onCurve(uint256 x, uint256 y) public pure returns (bool) {
        if (x == 0 && y == 0) return false;
        if (x >= P || y >= P) return false;
        // y² = x³ + 7
        uint256 lhs = mulmod(y, y, P);
        uint256 rhs = addmod(mulmod(mulmod(x, x, P), x, P), 7, P);
        return lhs == rhs;
    }

    /// Affine point addition. Doubling included, because two payouts of the
    /// same amount to the same key produce identical points and a version that
    /// only handled distinct points would revert on exactly that case.
    function add(uint256 x1, uint256 y1, uint256 x2, uint256 y2)
        public pure returns (uint256 x3, uint256 y3)
    {
        if (x1 == 0 && y1 == 0) return (x2, y2);
        if (x2 == 0 && y2 == 0) return (x1, y1);

        uint256 lam;
        if (x1 == x2) {
            // P + (-P) is the identity, which this representation writes as
            // (0,0) — the one value onCurve rejects, so it cannot be mistaken
            // for a real point.
            if (addmod(y1, y2, P) == 0) return (0, 0);
            uint256 num = mulmod(3, mulmod(x1, x1, P), P);
            lam = mulmod(addmod(num, A, P), inv(mulmod(2, y1, P)), P);
        } else {
            lam = mulmod(addmod(y2, P - y1, P), inv(addmod(x2, P - x1, P)), P);
        }
        x3 = addmod(mulmod(lam, lam, P), P - addmod(x1, x2, P), P);
        y3 = addmod(mulmod(lam, addmod(x1, P - x3, P), P), P - y1, P);
    }

    /// Modular inverse by Fermat, which needs no extended Euclid in Solidity.
    function inv(uint256 v) public pure returns (uint256) {
        return expmod(v, P - 2, P);
    }

    function expmod(uint256 b, uint256 e, uint256 m) internal pure returns (uint256 r) {
        r = 1;
        b %= m;
        while (e > 0) {
            if (e & 1 == 1) r = mulmod(r, b, m);
            b = mulmod(b, b, m);
            e >>= 1;
        }
    }
}
