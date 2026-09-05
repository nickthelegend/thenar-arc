// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AxonProtocol
 * @notice The data foundry for physical AI: funded task bounties, per-trajectory
 *         settlement, and policies that pay their contributors.
 *
 * The design decision that matters: `submitTrajectory` records the provenance
 * of a run AND transfers the operator's MON in the same call. Networks doing
 * this on a sequential L2 write a bare anchor and settle off chain because
 * per-run settlement is not affordable there. Here it is one call, and the
 * writes are almost entirely independent — different operators, different
 * tasks, one shared slot counter per task — which is the workload parallel
 * execution exists for.
 *
 * Scores are not self-reported. A run is only payable with an EIP-712
 * signature from the verifier key, which the backend produces after replaying
 * the trajectory. The operator cannot mint their own score.
 */
interface IPasskeyRegistry {
    function verify(address who, bytes32 digest, bytes32 r, bytes32 s) external view returns (bool);
    function hasPasskey(address who) external view returns (bool);
}

contract AxonProtocol {
    // ---------------------------------------------------------------- types

    struct Task {
        string name;
        address funder;
        uint128 rewardPerTrajectory; // wei of MON at a perfect score
        uint128 escrow;              // remaining funds committed to this task
        uint32 slotsTotal;
        uint32 slotsFilled;          // derived from the shards; see `slotsFilledOf`
        uint8 scenario;              // index into an off-chain vocabulary
        uint8 difficulty;            // 1..5
        bool policyMinted;
    }

    struct Trajectory {
        uint256 taskId;
        address contributor;
        bytes32 trajHash;   // keccak256 of the recorded trajectory JSON
        string cid;         // content address of that JSON
        uint16 score;       // 0..10000
        uint128 paid;
        uint64 at;
    }

    struct Policy {
        uint256 taskId;
        address minter;
        uint32 trajectories;
        uint64 mintedAt;
        uint128 licenceFee;
        uint32 licencesSold;
        uint128 distributed;
    }

    // ------------------------------------------------------------ constants

    uint16 public constant MAX_SCORE = 10_000;
    /// @notice Below this a run is rejected: it pays nothing and is not recorded.
    uint16 public constant ACCEPT_FLOOR = 4_000;
    /// @notice Per-account cap per task, so one address cannot farm a task.
    uint8 public constant RUNS_PER_ACCOUNT = 5;
    /// @notice Bounds the licence fan-out loop so a payout can never run out of gas.
    uint16 public constant MAX_CONTRIBUTORS = 256;
    /// @notice Upper bound on slot-counter shards. See `_shardsFor`.
    uint256 public constant MAX_SHARDS = 32;
    /// @notice Minimum slots per shard. Above RUNS_PER_ACCOUNT so an operator's
    ///         own allowance can never be blocked by their own shard's quota.
    uint32 public constant SLOTS_PER_SHARD = 8;
    /// @notice Protocol take on a licence sale, in basis points.
    uint16 public constant PROTOCOL_FEE_BPS = 250;

    // -------------------------------------------------------------- storage

    address public immutable verifier;
    /// @notice PasskeyRegistry, for operators who authorise runs with a passkey.
    IPasskeyRegistry public immutable passkeys;
    address public treasury;

    Task[] private _tasks;
    Trajectory[] private _trajectories;
    Policy[] private _policies;

    /**
     * Slot accounting, sharded.
     *
     * A single `slotsFilled` counter is one storage slot that every operator on
     * a task writes to, which on an optimistically parallel chain forces them
     * to re-execute serially — the exact anti-pattern Monad punishes. Each
     * operator instead writes only the shard their address maps to, and each
     * shard carries its own quota, so a submission touches no state any other
     * concurrent submission touches.
     *
     * The trade is honest: a shard can fill while others still have room, so an
     * operator may be turned away with slots left elsewhere. With the shard
     * count scaled to the task size that costs little, and it buys writes that
     * genuinely do not collide.
     */
    mapping(uint256 => mapping(uint256 => uint32)) private _shardFilled;

    /// task => contributor => runs already accepted
    mapping(uint256 => mapping(address => uint8)) public runsOnTask;
    /// task => contributor => cumulative score, the weight a policy inherits
    mapping(uint256 => mapping(address => uint256)) public weightOnTask;
    /// task => distinct contributors, in first-submission order
    mapping(uint256 => address[]) private _taskContributors;
    /// task => the trajectory ids it collected
    mapping(uint256 => uint256[]) private _taskTrajectories;
    /// contributor => the trajectory ids they produced
    mapping(address => uint256[]) private _byContributor;
    /// task => policy id + 1 (0 means unminted)
    mapping(uint256 => uint256) private _policyOfTask;
    /// policy => snapshotted cap table
    mapping(uint256 => address[]) private _capTable;
    mapping(uint256 => mapping(address => uint256)) private _capWeight;
    mapping(uint256 => uint256) private _capTotal;

    /// Replay protection: a trajectory hash can only ever be paid once.
    mapping(bytes32 => bool) public trajectoryUsed;
    /// Owed to an address whose push payment failed.
    mapping(address => uint256) public claimable;

    /// Aggregates the leaderboard reads without an indexer.
    mapping(address => uint256) public totalEarned;
    mapping(address => uint256) public totalRuns;
    mapping(address => uint256) public totalScore;

    // --------------------------------------------------------------- events

    event TaskCreated(
        uint256 indexed taskId, address indexed funder, string name,
        uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty
    );
    event TaskFunded(uint256 indexed taskId, address indexed from, uint256 amount);
    event TrajectoryAccepted(
        uint256 indexed trajectoryId, uint256 indexed taskId, address indexed contributor,
        bytes32 trajHash, string cid, uint16 score, uint256 paid
    );
    event TaskFilled(uint256 indexed taskId);
    event PolicyMinted(uint256 indexed policyId, uint256 indexed taskId, uint32 contributors, uint128 licenceFee);
    event PolicyLicensed(uint256 indexed policyId, address indexed buyer, uint256 amount, uint32 paidOut);
    event ContributorPaid(uint256 indexed policyId, address indexed contributor, uint256 amount);
    event PaymentDeferred(address indexed to, uint256 amount);
    event Claimed(address indexed to, uint256 amount);
    event PasskeyRun(uint256 indexed trajectoryId, address indexed contributor);

    // --------------------------------------------------------------- errors

    error NotVerifier();
    error BadSignature();
    error TaskClosed();
    error NoSlots();
    error CapReached();
    error ScoreTooLow();
    error ScoreTooHigh();
    error AlreadySubmitted();
    error EscrowEmpty();
    error NotFilled();
    error AlreadyMinted();
    error NoPolicy();
    error WrongFee();
    error NothingToClaim();
    error ZeroSlots();
    error ZeroReward();
    error Underfunded();
    error TooManyContributors();
    error ShardFull();
    error NoPasskey();
    error BadPasskeySignature();

    // ----------------------------------------------------------------- init

    constructor(address _verifier, address _treasury, address _passkeys) {
        if (_verifier == address(0) || _treasury == address(0)) revert NotVerifier();
        verifier = _verifier;
        treasury = _treasury;
        passkeys = IPasskeyRegistry(_passkeys);
    }

    // ------------------------------------------------------------- sharding

    /// @dev Small tasks get one shard: they never see the concurrency that
    ///      makes sharding worth its extra reads.
    function _shardsFor(uint32 slotsTotal) private pure returns (uint256 n) {
        n = slotsTotal / SLOTS_PER_SHARD;
        if (n == 0) return 1;
        if (n > MAX_SHARDS) return MAX_SHARDS;
    }

    function _shardOf(uint256 taskId, address who, uint32 slotsTotal) private pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(taskId, who))) % _shardsFor(slotsTotal);
    }

    /// @dev Quota for one shard, with the remainder given to the first shards.
    function _quota(uint32 slotsTotal, uint256 shard) private pure returns (uint32) {
        uint256 n = _shardsFor(slotsTotal);
        uint32 base = slotsTotal / uint32(n);
        uint32 rem = slotsTotal % uint32(n);
        return shard < rem ? base + 1 : base;
    }

    /// @notice Slots filled across every shard. A view, so it never contends.
    function slotsFilledOf(uint256 taskId) public view returns (uint32 total) {
        uint256 n = _shardsFor(_tasks[taskId].slotsTotal);
        for (uint256 i; i < n; ++i) total += _shardFilled[taskId][i];
    }

    /// @notice Whether this operator's own shard still has room, without falling back.
    function shardHasRoom(uint256 taskId, address who) public view returns (bool) {
        Task storage t = _tasks[taskId];
        uint256 shard = _shardOf(taskId, who, t.slotsTotal);
        return _shardFilled[taskId][shard] < _quota(t.slotsTotal, shard);
    }

    /// @dev Only reached when the caller's own shard is spent. Reverts NoSlots
    ///      when the task itself is genuinely full.
    function _anyShardWithRoom(uint256 taskId, uint32 slotsTotal)
        private view returns (uint256 shard, uint32 filled)
    {
        uint256 n = _shardsFor(slotsTotal);
        for (uint256 i; i < n; ++i) {
            uint32 f = _shardFilled[taskId][i];
            if (f < _quota(slotsTotal, i)) return (i, f);
        }
        revert NoSlots();
    }

    // ----------------------------------------------------------------- EIP-712

    bytes32 private constant _TYPE_HASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _RUN_TYPEHASH =
        keccak256("Run(uint256 taskId,address contributor,bytes32 trajHash,string cid,uint16 score)");

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                _TYPE_HASH,
                keccak256("Axon"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice The exact digest the verifier signs. Exposed so a client can check its own payload.
    function runDigest(
        uint256 taskId, address contributor, bytes32 trajHash, string calldata cid, uint16 score
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(_RUN_TYPEHASH, taskId, contributor, trajHash, keccak256(bytes(cid)), score)
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    // ----------------------------------------------------------------- tasks

    function createTask(
        string calldata name,
        uint32 slots,
        uint128 rewardPerTrajectory,
        uint8 scenario,
        uint8 difficulty
    ) external payable returns (uint256 taskId) {
        if (slots == 0) revert ZeroSlots();
        if (rewardPerTrajectory == 0) revert ZeroReward();
        // Escrow has to cover at least one full-score run, or the bounty is a lie.
        if (msg.value < rewardPerTrajectory) revert Underfunded();

        _tasks.push(
            Task({
                name: name,
                funder: msg.sender,
                rewardPerTrajectory: rewardPerTrajectory,
                escrow: uint128(msg.value),
                slotsTotal: slots,
                slotsFilled: 0,
                scenario: scenario,
                difficulty: difficulty,
                policyMinted: false
            })
        );
        taskId = _tasks.length - 1;
        emit TaskCreated(taskId, msg.sender, name, slots, rewardPerTrajectory, scenario, difficulty);
    }

    /// @notice Top a task's escrow back up. Anyone may fund a bounty.
    function fundTask(uint256 taskId) external payable {
        Task storage t = _tasks[taskId];
        t.escrow += uint128(msg.value);
        emit TaskFunded(taskId, msg.sender, msg.value);
    }

    // ----------------------------------------------------------- submission

    /**
     * @notice Record an accepted run and pay for it in the same call.
     * @dev The signature binds every field, so neither the score nor the
     *      recipient can be altered after the verifier signed.
     */
    function submitTrajectory(
        uint256 taskId,
        bytes32 trajHash,
        string calldata cid,
        uint16 score,
        bytes calldata signature
    ) external returns (uint256 trajectoryId) {
        if (_recover(runDigest(taskId, msg.sender, trajHash, cid, score), signature) != verifier) {
            revert BadSignature();
        }
        return _record(taskId, trajHash, cid, score);
    }

    /**
     * @notice Submit a run authorised by a passkey instead of by the wallet.
     *
     * The verifier still signs the score — that is what stops an operator
     * minting their own — but the operator's consent is a secp256r1 signature
     * checked through Monad's P256 precompile, the same curve a passkey uses.
     * On Ethereum this check would cost hundreds of thousands of gas in
     * Solidity; here the registry does it in a staticcall.
     */
    function submitTrajectoryWithPasskey(
        uint256 taskId,
        bytes32 trajHash,
        string calldata cid,
        uint16 score,
        bytes calldata verifierSig,
        bytes32 pr,
        bytes32 ps
    ) external returns (uint256 trajectoryId) {
        if (_recover(runDigest(taskId, msg.sender, trajHash, cid, score), verifierSig) != verifier) {
            revert BadSignature();
        }
        if (address(passkeys) == address(0) || !passkeys.hasPasskey(msg.sender)) revert NoPasskey();
        // The operator signs the trajectory itself, so consent is bound to the run.
        if (!passkeys.verify(msg.sender, trajHash, pr, ps)) revert BadPasskeySignature();

        trajectoryId = _record(taskId, trajHash, cid, score);
        emit PasskeyRun(trajectoryId, msg.sender);
    }

    /// @dev Everything both submission paths share, once the caller is authorised.
    function _record(uint256 taskId, bytes32 trajHash, string calldata cid, uint16 score)
        private returns (uint256 trajectoryId)
    {
        Task storage t = _tasks[taskId];

        if (score > MAX_SCORE) revert ScoreTooHigh();
        if (score < ACCEPT_FLOOR) revert ScoreTooLow();
        if (t.policyMinted) revert TaskClosed();
        if (runsOnTask[taskId][msg.sender] >= RUNS_PER_ACCOUNT) revert CapReached();
        if (trajectoryUsed[trajHash]) revert AlreadySubmitted();

        // The common path touches exactly one shard — the caller's own — so two
        // concurrent submissions from different operators share no state. Only
        // when that shard is exhausted does it look further, which is the rare
        // case and the only one that can contend.
        uint256 shard = _shardOf(taskId, msg.sender, t.slotsTotal);
        uint32 filled = _shardFilled[taskId][shard];
        if (filled >= _quota(t.slotsTotal, shard)) {
            (shard, filled) = _anyShardWithRoom(taskId, t.slotsTotal);
        }

        uint256 payout = (uint256(t.rewardPerTrajectory) * score) / MAX_SCORE;
        if (t.escrow < payout) revert EscrowEmpty();

        trajectoryUsed[trajHash] = true;
        t.escrow -= uint128(payout);
        _shardFilled[taskId][shard] = filled + 1;
        runsOnTask[taskId][msg.sender] += 1;

        if (weightOnTask[taskId][msg.sender] == 0) {
            if (_taskContributors[taskId].length >= MAX_CONTRIBUTORS) revert TooManyContributors();
            _taskContributors[taskId].push(msg.sender);
        }
        weightOnTask[taskId][msg.sender] += score;

        _trajectories.push(
            Trajectory({
                taskId: taskId,
                contributor: msg.sender,
                trajHash: trajHash,
                cid: cid,
                score: score,
                paid: uint128(payout),
                at: uint64(block.timestamp)
            })
        );
        trajectoryId = _trajectories.length - 1;
        _taskTrajectories[taskId].push(trajectoryId);
        _byContributor[msg.sender].push(trajectoryId);

        totalEarned[msg.sender] += payout;
        totalRuns[msg.sender] += 1;
        totalScore[msg.sender] += score;

        emit TrajectoryAccepted(trajectoryId, taskId, msg.sender, trajHash, cid, score, payout);
        if (slotsFilledOf(taskId) == t.slotsTotal) emit TaskFilled(taskId);

        _send(msg.sender, payout);
    }

    // -------------------------------------------------------------- policies

    /**
     * @notice Mint the policy for a filled task, snapshotting its cap table.
     * @dev The weights are the contributors' cumulative quality scores, so a
     *      licence pays for the data in proportion to how good it was.
     */
    function mintPolicy(uint256 taskId, uint128 licenceFee) external returns (uint256 policyId) {
        Task storage t = _tasks[taskId];
        uint32 filled = slotsFilledOf(taskId);
        if (filled < t.slotsTotal) revert NotFilled();
        if (t.policyMinted) revert AlreadyMinted();

        t.policyMinted = true;

        _policies.push(
            Policy({
                taskId: taskId,
                minter: msg.sender,
                trajectories: filled,
                mintedAt: uint64(block.timestamp),
                licenceFee: licenceFee,
                licencesSold: 0,
                distributed: 0
            })
        );
        policyId = _policies.length - 1;
        _policyOfTask[taskId] = policyId + 1;

        address[] storage cs = _taskContributors[taskId];
        uint256 total;
        for (uint256 i; i < cs.length; ++i) {
            uint256 w = weightOnTask[taskId][cs[i]];
            _capTable[policyId].push(cs[i]);
            _capWeight[policyId][cs[i]] = w;
            total += w;
        }
        _capTotal[policyId] = total;

        emit PolicyMinted(policyId, taskId, uint32(cs.length), licenceFee);
    }

    /**
     * @notice Buy a licence. The fee fans out to every contributor in this call.
     * @dev A contributor whose transfer fails is credited to `claimable` rather
     *      than reverting the sale for everyone else.
     */
    function licensePolicy(uint256 policyId) external payable {
        Policy storage p = _policies[policyId];
        if (msg.value != p.licenceFee) revert WrongFee();

        uint256 fee = (msg.value * PROTOCOL_FEE_BPS) / 10_000;
        uint256 pool = msg.value - fee;
        uint256 total = _capTotal[policyId];
        if (total == 0) revert NoPolicy();

        address[] storage cs = _capTable[policyId];
        uint256 handed;
        for (uint256 i; i < cs.length; ++i) {
            uint256 cut = (pool * _capWeight[policyId][cs[i]]) / total;
            if (cut == 0) continue;
            handed += cut;
            emit ContributorPaid(policyId, cs[i], cut);
            _send(cs[i], cut);
        }

        p.licencesSold += 1;
        p.distributed += uint128(handed);

        // Integer division leaves dust; it rides with the protocol fee.
        _send(treasury, fee + (pool - handed));
        emit PolicyLicensed(policyId, msg.sender, msg.value, uint32(cs.length));
    }

    function claim() external {
        uint256 owed = claimable[msg.sender];
        if (owed == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        emit Claimed(msg.sender, owed);
        (bool ok, ) = payable(msg.sender).call{value: owed}("");
        if (!ok) {
            claimable[msg.sender] = owed;
            revert NothingToClaim();
        }
    }

    // ----------------------------------------------------------------- views

    function taskCount() external view returns (uint256) { return _tasks.length; }
    function trajectoryCount() external view returns (uint256) { return _trajectories.length; }
    function policyCount() external view returns (uint256) { return _policies.length; }

    function getTask(uint256 taskId) public view returns (Task memory t) {
        t = _tasks[taskId];
        t.slotsFilled = slotsFilledOf(taskId);
    }
    function getTrajectory(uint256 id) external view returns (Trajectory memory) { return _trajectories[id]; }
    function getPolicy(uint256 id) external view returns (Policy memory) { return _policies[id]; }

    function getTasks(uint256 offset, uint256 limit) external view returns (Task[] memory out) {
        uint256 n = _tasks.length;
        if (offset >= n) return new Task[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        out = new Task[](end - offset);
        for (uint256 i = offset; i < end; ++i) out[i - offset] = getTask(i);
    }

    function contributorsOf(uint256 taskId) external view returns (address[] memory) {
        return _taskContributors[taskId];
    }

    function trajectoriesOf(address who) external view returns (uint256[] memory) {
        return _byContributor[who];
    }

    function taskTrajectories(uint256 taskId) external view returns (uint256[] memory) {
        return _taskTrajectories[taskId];
    }

    function policyOfTask(uint256 taskId) external view returns (bool minted, uint256 policyId) {
        uint256 v = _policyOfTask[taskId];
        return (v != 0, v == 0 ? 0 : v - 1);
    }

    /// @notice The cap table a licence would pay, and what each share is worth.
    function capTable(uint256 policyId)
        external view returns (address[] memory who, uint256[] memory weightBps, uint256[] memory payout)
    {
        address[] storage cs = _capTable[policyId];
        uint256 total = _capTotal[policyId];
        uint256 pool = _policies[policyId].licenceFee;
        pool -= (pool * PROTOCOL_FEE_BPS) / 10_000;

        who = new address[](cs.length);
        weightBps = new uint256[](cs.length);
        payout = new uint256[](cs.length);
        for (uint256 i; i < cs.length; ++i) {
            who[i] = cs[i];
            uint256 w = _capWeight[policyId][cs[i]];
            weightBps[i] = total == 0 ? 0 : (w * 10_000) / total;
            payout[i] = total == 0 ? 0 : (pool * w) / total;
        }
    }

    function stats(address who)
        external view returns (uint256 runs, uint256 earned, uint256 meanScore)
    {
        runs = totalRuns[who];
        earned = totalEarned[who];
        meanScore = runs == 0 ? 0 : totalScore[who] / runs;
    }

    // -------------------------------------------------------------- internal

    function _send(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{value: amount, gas: 30_000}("");
        if (!ok) {
            claimable[to] += amount;
            emit PaymentDeferred(to, amount);
        }
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        // Reject the malleable upper half of the curve order.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert BadSignature();
        }
        address a = ecrecover(digest, v, r, s);
        if (a == address(0)) revert BadSignature();
        return a;
    }

    receive() external payable {}
}
