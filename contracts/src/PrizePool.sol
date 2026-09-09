// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAxonWeights {
    function weightOnTask(uint256 taskId, address who) external view returns (uint256);
}

/**
 * @title PrizePool
 * @notice A funded pot for one task, split by work the protocol already
 *         recorded.
 *
 * Leaderboard prizes were rejected for inventing an economy the contract does
 * not have. The objection was to the invention, not to prizes: a pot that
 * holds no money and pays in a number nobody can spend is exactly the
 * points-system this project exists to argue against. So this holds real
 * AVAX, and pays it.
 *
 * The part that took thought is who decides the winners. A pool that takes a
 * list of addresses from whoever settles it hands that caller the power to
 * leave people out, and no amount of on-chain verification of the amounts
 * fixes a list that is missing a name. So there is no list. Contributors enter
 * themselves, the contract reads their weight from the protocol, and
 * settlement divides the pot by those verified weights.
 *
 * The result is that nobody can be omitted by anyone else and nobody can
 * inflate their own share: entering with no recorded work on the task reverts,
 * and entering twice changes nothing.
 */
contract PrizePool {
    IAxonWeights public immutable axon;
    uint256 public immutable taskId;
    uint64 public immutable closesAt;

    address[] private _entrants;
    mapping(address => bool) public entered;
    uint256 public totalWeight;
    bool public settled;

    error NoRecordedWork();
    error AlreadyEntered();
    error EntryClosed();
    error NotClosedYet();
    error AlreadySettled();
    error NothingToSplit();

    event Funded(address indexed from, uint256 amount);
    event Entered(address indexed who, uint256 weight);
    event Settled(uint256 pot, uint256 entrants);
    event Awarded(address indexed who, uint256 amount, uint256 weight);

    constructor(address protocol, uint256 taskId_, uint64 closesAt_) payable {
        axon = IAxonWeights(protocol);
        taskId = taskId_;
        closesAt = closesAt_;
        if (msg.value > 0) emit Funded(msg.sender, msg.value);
    }

    /// Anyone may add to the pot, at any time. A prize that can only be
    /// topped up by its creator is a prize with one sponsor.
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /**
     * @notice Enter the pool, if the protocol says you worked on this task.
     *
     * Self-entry rather than a list, so that being in the pool is not
     * somebody's decision. The weight is read from the protocol at entry and
     * stored, which fixes each entrant's share against work already done —
     * otherwise a late run could dilute everyone who entered earlier.
     */
    function enter() external returns (uint256 weight) {
        if (block.timestamp >= closesAt) revert EntryClosed();
        if (entered[msg.sender]) revert AlreadyEntered();

        weight = axon.weightOnTask(taskId, msg.sender);
        if (weight == 0) revert NoRecordedWork();

        entered[msg.sender] = true;
        _entrants.push(msg.sender);
        totalWeight += weight;
        _weight[msg.sender] = weight;
        emit Entered(msg.sender, weight);
    }

    mapping(address => uint256) private _weight;

    function weightOf(address who) external view returns (uint256) { return _weight[who]; }
    function entrants() external view returns (address[] memory) { return _entrants; }
    function entrantCount() external view returns (uint256) { return _entrants.length; }

    /**
     * @notice Pay everyone who entered, in proportion to their recorded work.
     *
     * Callable by anyone once entry has closed. There is nothing to decide by
     * then, so there is no reason to restrict who may push the button — and a
     * pot that only its creator can release is a pot that can be withheld.
     *
     * A payment that fails does not block the rest: the loop keeps going and
     * whatever is left stays in the contract rather than reverting everyone
     * else's share along with it.
     */
    function settle() external {
        if (block.timestamp < closesAt) revert NotClosedYet();
        if (settled) revert AlreadySettled();
        uint256 pot = address(this).balance;
        if (pot == 0 || totalWeight == 0) revert NothingToSplit();

        settled = true;
        emit Settled(pot, _entrants.length);

        for (uint256 i; i < _entrants.length; ++i) {
            address who = _entrants[i];
            uint256 share = (pot * _weight[who]) / totalWeight;
            if (share == 0) continue;
            emit Awarded(who, share, _weight[who]);
            (bool ok, ) = payable(who).call{value: share, gas: 30_000}("");
            // Deliberately ignored. One contributor whose address cannot
            // receive must not cost everyone else their share.
            ok;
        }
    }

    /// What each entrant would get if it settled now.
    function projected(address who) external view returns (uint256) {
        if (totalWeight == 0) return 0;
        return (address(this).balance * _weight[who]) / totalWeight;
    }
}
