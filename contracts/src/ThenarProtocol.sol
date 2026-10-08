// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IERC3009} from "./interfaces/IERC3009.sol";

/**
 * @title ThenarProtocol
 * @notice Robot training data, paid per run in USDC on Arc: funded task
 *         bounties, per-trajectory settlement, and licences that pay every
 *         contributor of a finished corpus.
 *
 * `submitTrajectory` records the provenance of a run AND pays the operator in
 * the same call. The escrow is Circle's USDC on Arc (the ERC-20 interface at
 * 0x3600…0000, 6 decimals), so a bounty is dollars from the moment it is
 * posted, the gas that posts it is the same dollars, and Arc's sub-second
 * finality makes the payout final in the block that records the run.
 *
 * Scores are not self-reported. A run is only payable with an EIP-712
 * signature from the verifier key, which the backend produces after replaying
 * the trajectory. The operator cannot mint their own score.
 *
 * Funding a task takes either an ERC-20 approval or one EIP-3009
 * `receiveWithAuthorization` signature (`createTaskWithAuthorization`), so a
 * sponsor whose USDC just arrived through Circle Gateway or CCTP can post a
 * bounty without a separate approval and without holding gas: anyone may
 * relay the signature, and the authorization's nonce is bound to the exact
 * task it funds, so a relayer can't spend it on a different one.
 *
 * Every accepted run is reported to `verdicts` (ThenarVerdicts), which writes
 * it to the verifier's ERC-8004 record on Arc's Reputation Registry. That
 * call is isolated: it can never block or revert a payout.
 *
 * Ownerless. The only limit is `maxTaskEscrow`, fixed at deployment, which
 * caps how much USDC any one task can hold.
 */
interface IPasskeyRegistry {
    function verify(address who, bytes32 digest, bytes32 r, bytes32 s) external view returns (bool);
    function hasPasskey(address who) external view returns (bool);
}

interface IThenarVerdicts {
    function recordVerdict(
        uint256 trajectoryId, uint256 taskId, address contributor, bytes32 trajHash, uint16 score, uint256 paid
    ) external;
}

contract ThenarProtocol is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    struct Task {
        string name;
        address funder;
        uint128 rewardPerTrajectory; // USDC base units (6 decimals) at a perfect score
        uint128 escrow;              // remaining USDC committed to this task
        uint32 slotsTotal;
        uint32 slotsFilled;          // derived from the shards; see `slotsFilledOf`
        uint8 scenario;              // index into an off-chain vocabulary
        uint8 difficulty;            // 1..5
        bool policyMinted;
        /// Unix seconds after which the funder may reclaim unspent escrow. Zero: never expires.
        uint64 expiresAt;
        bool closed;
        /// The block the task was posted in, so a reader finds its transaction with a one-block log query.
        uint64 createdBlock;
    }

    struct Trajectory {
        uint256 taskId;
        address contributor;
        bytes32 trajHash;   // keccak256 of the recorded trajectory JSON: the run id
        string cid;         // content address of that JSON
        uint16 score;       // 0..10000
        uint128 paid;       // USDC base units
        uint64 at;
        uint64 atBlock;
    }

    struct Policy {
        uint256 taskId;
        address minter;
        uint32 trajectories;
        uint64 mintedAt;
        uint128 licenceFee;  // USDC base units
        uint32 licencesSold;
        uint128 distributed; // USDC base units paid out to contributors
    }

    /// What a sponsor signs off-chain to post a task with EIP-3009 (see `taskNonce`).
    struct TaskParams {
        string name;
        uint32 slots;
        uint128 rewardPerTrajectory;
        uint8 scenario;
        uint8 difficulty;
        uint64 expiresAt;
        uint256 amount;
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
    /// @notice Minimum slots per shard. Above RUNS_PER_ACCOUNT so an operator's own allowance is never blocked.
    uint32 public constant SLOTS_PER_SHARD = 8;
    /// @notice Protocol take on a licence sale, in basis points.
    uint16 public constant PROTOCOL_FEE_BPS = 250;
    /// @notice Gas the ERC-8004 verdict write may use. It can never take a payout with it.
    uint256 public constant VERDICT_GAS = 400_000;

    // -------------------------------------------------------------- storage

    address public immutable verifier;
    IPasskeyRegistry public immutable passkeys;
    /// Circle's USDC on Arc (ERC-20 view, 6 decimals).
    IERC20 public immutable usdc;
    /// ThenarVerdicts: the ERC-8004 writer. Zero disables verdict reporting.
    IThenarVerdicts public immutable verdicts;
    /// Most USDC one task may hold in escrow.
    uint128 public immutable maxTaskEscrow;
    address public immutable treasury;

    Task[] private _tasks;
    Trajectory[] private _trajectories;
    Policy[] private _policies;

    /// Slot accounting, sharded so two operators on one task touch no common storage.
    mapping(uint256 => mapping(uint256 => uint32)) private _shardFilled;

    mapping(uint256 => mapping(address => uint8)) public runsOnTask;
    mapping(uint256 => mapping(address => uint256)) public weightOnTask;
    mapping(uint256 => address[]) private _taskContributors;
    mapping(uint256 => uint256[]) private _taskTrajectories;
    mapping(address => uint256[]) private _byContributor;
    mapping(uint256 => uint256) private _policyOfTask;
    mapping(uint256 => address[]) private _capTable;
    mapping(uint256 => mapping(address => uint256)) private _capWeight;
    mapping(uint256 => uint256) private _capTotal;

    /// Replay protection: a trajectory hash can only ever be paid once.
    mapping(bytes32 => bool) public trajectoryUsed;
    /// trajectory hash => id + 1, so a run id resolves to its record.
    mapping(bytes32 => uint256) private _trajectoryOfHash;
    /// Owed to an address whose push payment failed (a USDC-blocklisted address, say).
    mapping(address => uint256) public claimable;
    /// Sum of `claimable`: dollars held for others, never escrow.
    uint256 public claimableTotal;
    /// policy => licensee => licensed. A corpus licence on chain.
    mapping(uint256 => mapping(address => bool)) public licensed;

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
    event Licensed(uint256 indexed policyId, address indexed licensee, address indexed payer, uint256 amount);
    event ContributorPaid(uint256 indexed policyId, address indexed contributor, uint256 amount);
    event PaymentDeferred(address indexed to, uint256 amount);
    event Claimed(address indexed to, uint256 amount);
    event TaskExpired(uint256 indexed taskId, address indexed funder, uint256 refunded);
    event PasskeyRun(uint256 indexed trajectoryId, address indexed contributor);
    event VerdictNotRecorded(uint256 indexed trajectoryId, bytes reason);

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
    error NothingToClaim();
    error ZeroSlots();
    error ZeroReward();
    error ZeroAddress();
    error ZeroAmount();
    error Underfunded();
    error EscrowCapExceeded(uint256 wanted, uint256 cap);
    error TooManyContributors();
    error NoPasskey();
    error BadPasskeySignature();
    error NotFunder();
    error NotExpired();
    error AlreadyClosed();
    error NoSuchTask(uint256 taskId);
    error WrongNonce(bytes32 expected, bytes32 got);
    error InsufficientGasForVerdict();

    // ----------------------------------------------------------------- init

    constructor(
        address _verifier,
        address _treasury,
        address _passkeys,
        address _usdc,
        address _verdicts,
        uint128 _maxTaskEscrow
    ) {
        if (_verifier == address(0)) revert NotVerifier();
        if (_treasury == address(0) || _usdc == address(0)) revert ZeroAddress();
        if (_maxTaskEscrow == 0) revert ZeroAmount();
        verifier = _verifier;
        treasury = _treasury;
        passkeys = IPasskeyRegistry(_passkeys);
        usdc = IERC20(_usdc);
        verdicts = IThenarVerdicts(_verdicts);
        maxTaskEscrow = _maxTaskEscrow;
    }

    // ------------------------------------------------------------- sharding

    function _shardsFor(uint32 slotsTotal) private pure returns (uint256 n) {
        n = slotsTotal / SLOTS_PER_SHARD;
        if (n == 0) return 1;
        if (n > MAX_SHARDS) return MAX_SHARDS;
    }

    function _shardOf(uint256 taskId, address who, uint32 slotsTotal) private pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(taskId, who))) % _shardsFor(slotsTotal);
    }

    function _quota(uint32 slotsTotal, uint256 shard) private pure returns (uint32) {
        uint256 n = _shardsFor(slotsTotal);
        uint32 base = slotsTotal / uint32(n);
        uint32 rem = slotsTotal % uint32(n);
        return shard < rem ? base + 1 : base;
    }

    /// @notice Slots filled across every shard.
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
        return keccak256(abi.encode(_TYPE_HASH, keccak256("Thenar"), keccak256("1"), block.chainid, address(this)));
    }

    /// @notice The exact digest the verifier signs.
    function runDigest(
        uint256 taskId, address contributor, bytes32 trajHash, string calldata cid, uint16 score
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(_RUN_TYPEHASH, taskId, contributor, trajHash, keccak256(bytes(cid)), score)
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /**
     * @notice The EIP-3009 nonce that authorises funding exactly this task.
     * @dev The sponsor signs `receiveWithAuthorization(funder → this, amount, …, nonce)`
     *      with this nonce, so the signature is only good for these parameters.
     */
    function taskNonce(address funder, TaskParams calldata p) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                "thenar:task", block.chainid, address(this), funder,
                keccak256(bytes(p.name)), p.slots, p.rewardPerTrajectory, p.scenario, p.difficulty, p.expiresAt, p.amount
            )
        );
    }

    // ----------------------------------------------------------------- tasks

    /// @notice Post a task; pulls `amount` USDC from the caller (approve first).
    function createTask(
        string calldata name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty,
        uint256 amount
    ) external nonReentrant returns (uint256 taskId) {
        taskId = _newTask(msg.sender, name, slots, rewardPerTrajectory, scenario, difficulty, 0, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Post a task that stops accepting runs at `expiresAt` (zero: never), refundable after it.
    function createTaskUntil(
        string calldata name, uint32 slots, uint128 rewardPerTrajectory, uint8 scenario, uint8 difficulty,
        uint64 expiresAt, uint256 amount
    ) external nonReentrant returns (uint256 taskId) {
        taskId = _newTask(msg.sender, name, slots, rewardPerTrajectory, scenario, difficulty, expiresAt, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Post a task funded by an EIP-3009 authorization from `funder`.
     *
     * Anyone may submit it (a relayer, Thenar's server after a Gateway mint),
     * and the funder needs no approval and no gas. The authorization's nonce
     * must be `taskNonce(funder, p)`.
     */
    function createTaskWithAuthorization(
        address funder,
        TaskParams calldata p,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant returns (uint256 taskId) {
        bytes32 expected = taskNonce(funder, p);
        if (nonce != expected) revert WrongNonce(expected, nonce);
        taskId = _newTaskFrom(funder, p);
        IERC3009(address(usdc)).receiveWithAuthorization(
            funder, address(this), p.amount, validAfter, validBefore, nonce, signature
        );
    }

    function _newTaskFrom(address funder, TaskParams calldata p) private returns (uint256) {
        return _newTask(funder, p.name, p.slots, p.rewardPerTrajectory, p.scenario, p.difficulty, p.expiresAt, p.amount);
    }

    function _newTask(
        address funder, string calldata name, uint32 slots, uint128 reward, uint8 scenario, uint8 difficulty,
        uint64 expiresAt, uint256 amount
    ) private returns (uint256 taskId) {
        if (slots == 0) revert ZeroSlots();
        if (reward == 0) revert ZeroReward();
        // Escrow has to cover at least one full-score run, or the bounty is a lie.
        if (amount < reward) revert Underfunded();
        if (amount > maxTaskEscrow) revert EscrowCapExceeded(amount, maxTaskEscrow);

        _tasks.push(
            Task({
                name: name,
                funder: funder,
                rewardPerTrajectory: reward,
                escrow: uint128(amount),
                slotsTotal: slots,
                slotsFilled: 0,
                scenario: scenario,
                difficulty: difficulty,
                policyMinted: false,
                expiresAt: expiresAt,
                closed: false,
                createdBlock: uint64(block.number)
            })
        );
        taskId = _tasks.length - 1;
        emit TaskCreated(taskId, funder, name, slots, reward, scenario, difficulty);
        emit TaskFunded(taskId, funder, amount);
    }

    /// @notice Top a task's escrow back up. Anyone may fund a bounty (approve first).
    function fundTask(uint256 taskId, uint256 amount) external nonReentrant {
        if (taskId >= _tasks.length) revert NoSuchTask(taskId);
        if (amount == 0) revert ZeroAmount();
        Task storage t = _tasks[taskId];
        if (t.closed || t.policyMinted) revert TaskClosed();
        uint256 next = uint256(t.escrow) + amount;
        if (next > maxTaskEscrow) revert EscrowCapExceeded(next, maxTaskEscrow);
        t.escrow = uint128(next);
        emit TaskFunded(taskId, msg.sender, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @notice Return unspent escrow to the funder after a task's deadline, or
     *         once every slot is filled. Only the funder, only once.
     */
    function closeTask(uint256 taskId) external nonReentrant returns (uint256 refunded) {
        if (taskId >= _tasks.length) revert NoSuchTask(taskId);
        Task storage t = _tasks[taskId];
        if (msg.sender != t.funder) revert NotFunder();
        if (t.closed) revert AlreadyClosed();
        // Expired, or nothing left to pay for: every slot is filled, so whatever runs
        // below a perfect score left behind would otherwise be locked forever.
        bool expired = t.expiresAt != 0 && block.timestamp >= t.expiresAt;
        if (!expired && slotsFilledOf(taskId) < t.slotsTotal) revert NotExpired();

        refunded = t.escrow;
        t.escrow = 0;
        t.closed = true;
        emit TaskExpired(taskId, t.funder, refunded);

        if (refunded > 0) _send(t.funder, refunded);
    }

    // ----------------------------------------------------------- submission

    /// @notice Record an accepted run and pay for it in the same call.
    function submitTrajectory(
        uint256 taskId, bytes32 trajHash, string calldata cid, uint16 score, bytes calldata signature
    ) external nonReentrant returns (uint256 trajectoryId) {
        if (_recover(runDigest(taskId, msg.sender, trajHash, cid, score), signature) != verifier) {
            revert BadSignature();
        }
        return _record(taskId, msg.sender, trajHash, cid, score);
    }

    /**
     * @notice Submit a run on someone else's behalf, and pay the gas for it.
     * The verifier's signature names the contributor, so a relayer can only
     * pay for a run already scored for that exact address, and the USDC goes to them.
     */
    function submitTrajectoryFor(
        address contributor, uint256 taskId, bytes32 trajHash, string calldata cid, uint16 score,
        bytes calldata signature
    ) external nonReentrant returns (uint256 trajectoryId) {
        if (_recover(runDigest(taskId, contributor, trajHash, cid, score), signature) != verifier) {
            revert BadSignature();
        }
        return _record(taskId, contributor, trajHash, cid, score);
    }

    /**
     * @notice Submit a run authorised by a passkey. The verifier still signs the
     * score; the operator's consent is a secp256r1 signature over
     * sha256(trajHash) (WebCrypto hashes before signing), checked by the P-256
     * precompile at 0x0100, which Arc runs.
     */
    function submitTrajectoryWithPasskey(
        uint256 taskId, bytes32 trajHash, string calldata cid, uint16 score, bytes calldata verifierSig,
        bytes32 pr, bytes32 ps
    ) external nonReentrant returns (uint256 trajectoryId) {
        if (_recover(runDigest(taskId, msg.sender, trajHash, cid, score), verifierSig) != verifier) {
            revert BadSignature();
        }
        if (address(passkeys) == address(0) || !passkeys.hasPasskey(msg.sender)) revert NoPasskey();
        if (!passkeys.verify(msg.sender, sha256(abi.encodePacked(trajHash)), pr, ps)) {
            revert BadPasskeySignature();
        }
        trajectoryId = _record(taskId, msg.sender, trajHash, cid, score);
        emit PasskeyRun(trajectoryId, msg.sender);
    }

    function _record(
        uint256 taskId, address contributor, bytes32 trajHash, string calldata cid, uint16 score
    ) private returns (uint256 trajectoryId) {
        if (taskId >= _tasks.length) revert NoSuchTask(taskId);
        Task storage t = _tasks[taskId];

        if (score > MAX_SCORE) revert ScoreTooHigh();
        if (score < ACCEPT_FLOOR) revert ScoreTooLow();
        if (t.policyMinted || t.closed) revert TaskClosed();
        if (t.expiresAt != 0 && block.timestamp >= t.expiresAt) revert TaskClosed();
        if (runsOnTask[taskId][contributor] >= RUNS_PER_ACCOUNT) revert CapReached();
        if (trajectoryUsed[trajHash]) revert AlreadySubmitted();

        uint256 shard = _shardOf(taskId, contributor, t.slotsTotal);
        uint32 filled = _shardFilled[taskId][shard];
        if (filled >= _quota(t.slotsTotal, shard)) {
            (shard, filled) = _anyShardWithRoom(taskId, t.slotsTotal);
        }

        uint256 payout = (uint256(t.rewardPerTrajectory) * score) / MAX_SCORE;
        if (t.escrow < payout) revert EscrowEmpty();

        trajectoryUsed[trajHash] = true;
        t.escrow -= uint128(payout);
        _shardFilled[taskId][shard] = filled + 1;
        runsOnTask[taskId][contributor] += 1;

        if (weightOnTask[taskId][contributor] == 0) {
            if (_taskContributors[taskId].length >= MAX_CONTRIBUTORS) revert TooManyContributors();
            _taskContributors[taskId].push(contributor);
        }
        weightOnTask[taskId][contributor] += score;

        _trajectories.push(
            Trajectory({
                taskId: taskId,
                contributor: contributor,
                trajHash: trajHash,
                cid: cid,
                score: score,
                paid: uint128(payout),
                at: uint64(block.timestamp),
                atBlock: uint64(block.number)
            })
        );
        trajectoryId = _trajectories.length - 1;
        _trajectoryOfHash[trajHash] = trajectoryId + 1;
        _taskTrajectories[taskId].push(trajectoryId);
        _byContributor[contributor].push(trajectoryId);

        totalEarned[contributor] += payout;
        totalRuns[contributor] += 1;
        totalScore[contributor] += score;

        emit TrajectoryAccepted(trajectoryId, taskId, contributor, trajHash, cid, score, payout);
        if (slotsFilledOf(taskId) == t.slotsTotal) emit TaskFilled(taskId);

        _send(contributor, payout);

        // ERC-8004: the verdict on the verifier's record. Bounded and isolated.
        if (address(verdicts) != address(0)) {
            // A caller must not be able to skip the record by starving it of gas: with less
            // than VERDICT_GAS available to forward (EIP-150 keeps 1/64 back), refuse the run.
            if (gasleft() < (VERDICT_GAS * 64) / 63 + 10_000) revert InsufficientGasForVerdict();
            try verdicts.recordVerdict{gas: VERDICT_GAS}(trajectoryId, taskId, contributor, trajHash, score, payout) {}
            catch (bytes memory reason) {
                emit VerdictNotRecorded(trajectoryId, reason);
            }
        }
    }

    // -------------------------------------------------------------- policies

    /// @notice Mint the policy for a filled task, snapshotting its cap table.
    function mintPolicy(uint256 taskId, uint128 licenceFee) external returns (uint256 policyId) {
        if (taskId >= _tasks.length) revert NoSuchTask(taskId);
        Task storage t = _tasks[taskId];
        // The fee decides what every contributor earns from a licence: only the funder sets it.
        if (msg.sender != t.funder) revert NotFunder();
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
        uint256 total = 0;
        for (uint256 i; i < cs.length; ++i) {
            uint256 w = weightOnTask[taskId][cs[i]];
            _capTable[policyId].push(cs[i]);
            _capWeight[policyId][cs[i]] = w;
            total += w;
        }
        _capTotal[policyId] = total;

        emit PolicyMinted(policyId, taskId, uint32(cs.length), licenceFee);
    }

    /// @notice Buy a licence for yourself. Pulls the fee in USDC (approve first).
    function licensePolicy(uint256 policyId) external nonReentrant {
        _license(policyId, msg.sender);
    }

    /**
     * @notice Buy a licence for `licensee`, paid by the caller. This is how a
     * buyer on another chain licenses a corpus: ThenarCcipReceiver pays with
     * the USDC CCTP minted to it and names the buyer the CCIP message carried.
     */
    function licensePolicyFor(uint256 policyId, address licensee) external nonReentrant {
        if (licensee == address(0)) revert ZeroAddress();
        _license(policyId, licensee);
    }

    function _license(uint256 policyId, address licensee) private {
        if (policyId >= _policies.length) revert NoPolicy();
        Policy storage p = _policies[policyId];
        uint256 amount = p.licenceFee;
        uint256 total = _capTotal[policyId];
        if (total == 0) revert NoPolicy();

        // Effects first: every cut is computed and recorded before any USDC moves.
        uint256 fee = (amount * PROTOCOL_FEE_BPS) / 10_000;
        uint256 pool = amount - fee;
        address[] storage cs = _capTable[policyId];
        uint256[] memory cuts = new uint256[](cs.length);
        uint256 handed = 0;
        for (uint256 i; i < cs.length; ++i) {
            cuts[i] = (pool * _capWeight[policyId][cs[i]]) / total;
            handed += cuts[i];
        }
        p.licencesSold += 1;
        p.distributed += uint128(handed);
        licensed[policyId][licensee] = true;

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        for (uint256 i; i < cs.length; ++i) {
            if (cuts[i] == 0) continue;
            emit ContributorPaid(policyId, cs[i], cuts[i]);
            _send(cs[i], cuts[i]);
        }
        // Integer division leaves dust; it rides with the protocol fee.
        _send(treasury, fee + (pool - handed));
        emit PolicyLicensed(policyId, licensee, amount, uint32(cs.length));
        emit Licensed(policyId, licensee, msg.sender, amount);
    }

    /// @notice Collect a payment that could not be pushed earlier.
    function claim() external nonReentrant {
        uint256 owed = claimable[msg.sender];
        if (owed == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        claimableTotal -= owed;
        emit Claimed(msg.sender, owed);
        usdc.safeTransfer(msg.sender, owed);
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

    /// @notice A run by its id (the trajectory hash). `found` is false for an unknown hash.
    function trajectoryOfHash(bytes32 trajHash) external view returns (bool found, uint256 trajectoryId) {
        uint256 v = _trajectoryOfHash[trajHash];
        return (v != 0, v == 0 ? 0 : v - 1);
    }

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

    function stats(address who) external view returns (uint256 runs, uint256 earned, uint256 meanScore) {
        runs = totalRuns[who];
        earned = totalEarned[who];
        meanScore = runs == 0 ? 0 : totalScore[who] / runs;
    }

    // -------------------------------------------------------------- internal

    /**
     * Push USDC. A transfer that fails (Circle's USDC refuses a blocklisted
     * address, for one) is credited to `claimable` instead of reverting the
     * run or the licence for everyone else.
     */
    function _send(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory ret) =
            address(usdc).call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) {
            claimable[to] += amount;
            claimableTotal += amount;
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
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert BadSignature();
        }
        address a = ecrecover(digest, v, r, s);
        if (a == address(0)) revert BadSignature();
        return a;
    }
}
