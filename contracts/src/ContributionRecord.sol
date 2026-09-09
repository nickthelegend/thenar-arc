// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAxonTotals {
    function totalScore(address who) external view returns (uint256);
}

/**
 * @title ContributionRecord
 * @notice A running total of work recorded, in a shape wallets can read.
 *
 * A points or token system was rejected here, and the reason still holds for
 * the thing that was rejected: this protocol's whole argument is that it
 * settles real money per run, and issuing a second currency alongside AVAX
 * would be the exact substitution — points now, value later, maybe — that the
 * pitch exists to reject.
 *
 * So this is not that, and it is built so it cannot become that. It cannot be
 * transferred, sold, approved, spent or redeemed; there is no treasury behind
 * it, no market, and nothing it entitles the holder to. Every function that
 * would move it reverts, and says why.
 *
 * What is left is the useful part of the idea: contribution weight, which
 * already exists in the protocol as a mapping nobody outside this project
 * knows how to query, expressed in the one interface every wallet and explorer
 * already reads. `sync` mints the difference between what an address has
 * earned and what this has recorded — the protocol remains the source of truth
 * and this is a mirror of it that can never disagree by more than the runs
 * since it was last synced.
 *
 * If that sounds like it does less than a token, that is the point.
 */
contract ContributionRecord {
    IAxonTotals public immutable axon;

    string public constant name = "Thenar Contribution";
    string public constant symbol = "CONTRIB";
    /// Score is an integer 0..10000 per run. Decimals would imply a divisibility
    /// this has no use for, and divisibility is what money needs.
    uint8 public constant decimals = 0;

    mapping(address => uint256) public balanceOf;
    uint256 public totalSupply;

    error NotTransferable();
    error NothingToSync();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Synced(address indexed who, uint256 added, uint256 total);

    constructor(address protocol) {
        axon = IAxonTotals(protocol);
    }

    /**
     * @notice Bring an address's record up to what the protocol says it earned.
     *
     * Callable by anyone for anyone: there is nothing to gain by syncing
     * somebody else, and requiring the holder to do it would leave the record
     * of people who never came back permanently understated.
     */
    function sync(address who) external returns (uint256 added) {
        uint256 earned = axon.totalScore(who);
        uint256 have = balanceOf[who];
        if (earned <= have) revert NothingToSync();

        added = earned - have;
        balanceOf[who] = earned;
        totalSupply += added;

        emit Synced(who, added, earned);
        // Minting is the only Transfer this contract will ever emit, and it is
        // emitted so a wallet showing balances notices the change at all.
        emit Transfer(address(0), who, added);
    }

    /// What `sync` would add right now.
    function pending(address who) external view returns (uint256) {
        uint256 earned = axon.totalScore(who);
        uint256 have = balanceOf[who];
        return earned > have ? earned - have : 0;
    }

    // ------------------------------------------------------------ not money

    /// Every one of these reverts. A record that can move is a currency, and a
    /// currency is the thing this protocol argues against issuing.
    function transfer(address, uint256) external pure returns (bool) { revert NotTransferable(); }
    function transferFrom(address, address, uint256) external pure returns (bool) { revert NotTransferable(); }
    function approve(address, uint256) external pure returns (bool) { revert NotTransferable(); }
    function allowance(address, address) external pure returns (uint256) { return 0; }
}
