// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SalesLog
 * @notice Every corpus sale, stated on Arc by the seller.
 *
 * The server's sales table is the server's word, and a server can edit its own
 * table. A line here is the same statement with a block and a sequence number
 * nobody can change afterwards. It carries the sha256 of the exact bytes
 * served, so a buyer can hash the file they received and find it in the log,
 * and anyone can count what was sold without asking us.
 *
 * Kept in storage as well as emitted, so `saleCount` and `getSale` read it in
 * one call from any RPC, with no indexer.
 *
 * A buyer that is an ERC-8004 agent on Arc's Identity Registry is logged with
 * its agent id (`buyerAgent` is agentId + 1; 0 means none), after the seller
 * checked the payer is that agent's wallet or owner. Agents' purchase history
 * is then on chain beside their ERC-8004 identity.
 */
contract SalesLog {
    error NotSeller();
    error AlreadyLogged(bytes32 saleId);
    error NoSuchSale(uint256 seq);

    /// How a pull was granted.
    enum Terms {
        X402,     // paid per request: an x402 (EIP-3009 USDC) payment settled on Arc
        Licence,  // an on-chain corpus licence (ThenarProtocol.licensed), e.g. bought over CCIP
        Gateway   // paid from a Circle Gateway unified balance
    }

    struct Sale {
        bytes32 saleId;   // the settlement tx hash
        uint256 taskId;
        Terms terms;
        address buyer;
        address asset;    // the token paid in; zero for a free pull
        uint256 amount;   // atomic units of `asset`; zero for a free pull
        bytes32 sha256;   // of the bytes served
        uint64 at;
        uint256 buyerAgent; // ERC-8004 agent id + 1, 0 when the buyer is not a registered agent
    }

    event CorpusSold(
        uint256 indexed seq, bytes32 indexed saleId, uint256 indexed taskId,
        Terms terms, address buyer, address asset, uint256 amount, bytes32 sha256, uint256 buyerAgent
    );

    address public immutable seller;
    Sale[] private _sales;
    /// saleId => seq + 1, so a sale cannot be logged twice.
    mapping(bytes32 => uint256) public seqOf;
    /// sha256 => how many sales served exactly those bytes.
    mapping(bytes32 => uint256) public servedCount;

    constructor(address seller_) {
        seller = seller_;
    }

    function logSale(
        bytes32 saleId, uint256 taskId, Terms terms, address buyer, address asset, uint256 amount, bytes32 digest,
        uint256 buyerAgent
    ) external returns (uint256 seq) {
        if (msg.sender != seller) revert NotSeller();
        if (seqOf[saleId] != 0) revert AlreadyLogged(saleId);
        _sales.push(Sale({
            saleId: saleId, taskId: taskId, terms: terms, buyer: buyer,
            asset: asset, amount: amount, sha256: digest, at: uint64(block.timestamp), buyerAgent: buyerAgent
        }));
        seq = _sales.length;
        seqOf[saleId] = seq;
        servedCount[digest] += 1;
        emit CorpusSold(seq, saleId, taskId, terms, buyer, asset, amount, digest, buyerAgent);
    }

    function saleCount() external view returns (uint256) {
        return _sales.length;
    }

    /// @notice Sales are numbered from 1.
    function getSale(uint256 seq) external view returns (Sale memory) {
        if (seq == 0 || seq > _sales.length) revert NoSuchSale(seq);
        return _sales[seq - 1];
    }
}
