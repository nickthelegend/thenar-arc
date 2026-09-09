// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAxonGov {
    function totalScore(address who) external view returns (uint256);
    function createTask(
        string calldata name, uint32 slots, uint128 rewardPerTrajectory,
        uint8 scenario, uint8 difficulty
    ) external payable returns (uint256);
}

/**
 * @title Foundry
 * @notice A treasury the people who filled the corpus decide how to spend.
 *
 * Governance was rejected for having no constituency, and that was the right
 * objection to token-holder governance, which invents one by selling it. This
 * has a constituency already: every address the protocol has paid carries a
 * recorded weight, earned by doing the work this treasury exists to buy more
 * of. Nobody can acquire a vote here except by contributing.
 *
 * What it governs is deliberately narrow — which task gets funded next, and
 * for how much. A treasury that can only do one thing cannot be voted into
 * doing something else, and the one thing is the thing the protocol is for.
 *
 * Weight is read from the protocol at the moment a vote is cast and frozen
 * into that vote. Reading it at execution instead would let a late run change
 * the meaning of a ballot already posted, which is the kind of detail that
 * decides whether a vote is worth casting.
 */
contract Foundry {
    IAxonGov public immutable axon;

    struct Proposal {
        string name;          // the task instruction to fund
        uint32 slots;
        uint128 rewardPerTrajectory;
        uint8 scenario;
        uint8 difficulty;
        address proposer;
        uint64 closesAt;
        uint256 forWeight;
        uint256 againstWeight;
        bool executed;
    }

    Proposal[] private _proposals;
    mapping(uint256 => mapping(address => uint256)) public voted;

    /// A proposal has to be worth the treasury's while to consider: without a
    /// floor, one address with one run could fill the list.
    uint256 public constant MIN_WEIGHT_TO_PROPOSE = 4_000;
    uint64 public constant VOTING_PERIOD = 3 days;

    error NoStanding();
    error AlreadyVoted();
    error VotingClosed();
    error StillOpen();
    error AlreadyExecuted();
    error Rejected();
    error TreasuryTooSmall();
    error NoSuchProposal();

    event Proposed(uint256 indexed id, address indexed proposer, string name, uint256 cost);
    event Voted(uint256 indexed id, address indexed who, bool support, uint256 weight);
    event Executed(uint256 indexed id, uint256 taskId, uint256 spent);
    event Funded(address indexed from, uint256 amount);

    constructor(address protocol) payable {
        axon = IAxonGov(protocol);
        if (msg.value > 0) emit Funded(msg.sender, msg.value);
    }

    receive() external payable { emit Funded(msg.sender, msg.value); }

    function cost(uint256 id) public view returns (uint256) {
        Proposal storage p = _proposals[id];
        return uint256(p.rewardPerTrajectory) * p.slots;
    }

    function propose(
        string calldata name, uint32 slots, uint128 rewardPerTrajectory,
        uint8 scenario, uint8 difficulty
    ) external returns (uint256 id) {
        if (axon.totalScore(msg.sender) < MIN_WEIGHT_TO_PROPOSE) revert NoStanding();

        _proposals.push(Proposal({
            name: name, slots: slots, rewardPerTrajectory: rewardPerTrajectory,
            scenario: scenario, difficulty: difficulty,
            proposer: msg.sender, closesAt: uint64(block.timestamp) + VOTING_PERIOD,
            forWeight: 0, againstWeight: 0, executed: false
        }));
        id = _proposals.length - 1;
        emit Proposed(id, msg.sender, name, uint256(rewardPerTrajectory) * slots);
    }

    /**
     * @notice Vote with the weight the protocol says you have earned.
     *
     * Frozen at the moment of the vote. Reading it at execution would let a
     * run recorded afterwards change what a ballot already cast means.
     */
    function vote(uint256 id, bool support) external returns (uint256 weight) {
        if (id >= _proposals.length) revert NoSuchProposal();
        Proposal storage p = _proposals[id];
        if (block.timestamp >= p.closesAt) revert VotingClosed();
        if (voted[id][msg.sender] != 0) revert AlreadyVoted();

        weight = axon.totalScore(msg.sender);
        if (weight == 0) revert NoStanding();

        voted[id][msg.sender] = weight;
        if (support) p.forWeight += weight; else p.againstWeight += weight;
        emit Voted(id, msg.sender, support, weight);
    }

    /**
     * @notice Fund the task, if the vote carried.
     *
     * Callable by anyone once voting has closed. There is nothing left to
     * decide by then, and a decision that only its proposer can enact is a
     * decision they can also quietly drop.
     */
    function execute(uint256 id) external returns (uint256 taskId) {
        if (id >= _proposals.length) revert NoSuchProposal();
        Proposal storage p = _proposals[id];
        if (block.timestamp < p.closesAt) revert StillOpen();
        if (p.executed) revert AlreadyExecuted();
        // A tie is not a mandate.
        if (p.forWeight <= p.againstWeight) revert Rejected();

        uint256 due = cost(id);
        if (address(this).balance < due) revert TreasuryTooSmall();

        p.executed = true;
        taskId = axon.createTask{value: due}(
            p.name, p.slots, p.rewardPerTrajectory, p.scenario, p.difficulty
        );
        emit Executed(id, taskId, due);
    }

    function proposalCount() external view returns (uint256) { return _proposals.length; }
    function getProposal(uint256 id) external view returns (Proposal memory) { return _proposals[id]; }
}
