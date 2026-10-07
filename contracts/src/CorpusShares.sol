// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title CorpusShares
 * @notice A task corpus as shares, held only by the people who drove the arm.
 *
 * What Thenar sells is recordings, so a share of the recordings is what gets
 * issued: one token whose holders are the operators, in proportion to how
 * well they drove. Three rules make a share mean that, and this contract
 * enforces all three rather than the server that calls it:
 *
 *  - It is a whitelist. Only an address on the control list can hold a share,
 *    send one or receive one, and an address gets there only after the issuer
 *    has seen a World ID proof that a live human stands behind it. A bot farm
 *    can record runs; it cannot own the corpus.
 *  - Shares are issued per accepted run, and each issue names the run's hash,
 *    so the cap table reads as the contribution record.
 *  - A dividend declared from corpus sales pays whoever held at the record
 *    date, pro rata, in USDC escrowed here when it was declared.
 *
 * The record date is always in the future when a dividend is declared, and
 * every balance change is checkpointed with the time it happened, so a holder
 * cannot buy in after the snapshot and a seller cannot dodge it by moving
 * shares the block before.
 *
 * Shares are whole units: `decimals()` is 0, because a fraction of one run's
 * contribution is not a thing anybody recorded.
 */
contract CorpusShares {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- errors

    error NotIssuer();
    error AccountIsNotInControlList(address account);
    error ZeroAmount();
    error InsufficientBalance(uint256 have, uint256 want);
    error InsufficientAllowance(uint256 have, uint256 want);
    error RecordDateNotInFuture(uint64 recordDate);
    error ExecutionBeforeRecord(uint64 recordDate, uint64 executionDate);
    error NoSuchDividend(uint256 id);
    error DividendNotPayable(uint256 id, uint64 executionDate);
    error AlreadyClaimed(uint256 id, address account);
    error NothingOwed(uint256 id, address account);
    error PaymentFailed(address to, uint256 amount);
    error NothingToReclaim(uint256 id);

    // ---------------------------------------------------------------- events

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Admitted(address indexed account);
    event Issued(address indexed holder, uint256 value, bytes32 indexed trajHash);
    event DividendDeclared(uint256 indexed id, uint64 recordDate, uint64 executionDate, uint256 amount);
    event DividendClaimed(uint256 indexed id, address indexed holder, uint256 amount);
    event DividendReclaimed(uint256 indexed id, uint256 amount);

    // ---------------------------------------------------------------- storage

    string public name;
    string public symbol;
    address public immutable issuer;

    struct Checkpoint {
        uint64 at;
        uint192 value;
    }

    struct Dividend {
        uint64 recordDate;
        uint64 executionDate;
        uint256 amount;
        uint256 claimed;
    }

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    mapping(address => bool) private _listed;
    address[] private _members;

    mapping(address => Checkpoint[]) private _balanceHistory;
    Checkpoint[] private _supplyHistory;

    Dividend[] private _dividends;
    mapping(uint256 => mapping(address => bool)) public claimedBy;

    /// Circle's USDC on Arc: what dividends are declared and paid in (6 decimals).
    IERC20 public immutable usdc;

    constructor(string memory name_, string memory symbol_, address issuer_, address usdc_) {
        name = name_;
        symbol = symbol_;
        issuer = issuer_;
        usdc = IERC20(usdc_);
    }

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    function decimals() external pure returns (uint8) {
        return 0;
    }

    // ---------------------------------------------------------- control list

    /// @notice Put a verified human on the list. Idempotent.
    function addToControlList(address account) external onlyIssuer {
        if (_listed[account]) return;
        _listed[account] = true;
        _members.push(account);
        emit Admitted(account);
    }

    function isInControlList(address account) external view returns (bool) {
        return _listed[account];
    }

    function getControlListCount() external view returns (uint256) {
        return _members.length;
    }

    function getControlListMembers(uint256 start, uint256 count) external view returns (address[] memory out) {
        uint256 n = _members.length;
        if (start >= n) return new address[](0);
        uint256 end = start + count > n ? n : start + count;
        out = new address[](end - start);
        for (uint256 i = start; i < end; i++) out[i - start] = _members[i];
    }

    // ---------------------------------------------------------------- issue

    /// @notice Issue a run's shares to the human who drove it.
    function issue(address holder, uint256 value, bytes32 trajHash) external onlyIssuer {
        if (value == 0) revert ZeroAmount();
        if (!_listed[holder]) revert AccountIsNotInControlList(holder);
        balanceOf[holder] += value;
        totalSupply += value;
        _checkpoint(_balanceHistory[holder], balanceOf[holder]);
        _checkpoint(_supplyHistory, totalSupply);
        emit Transfer(address(0), holder, value);
        emit Issued(holder, value, trajHash);
    }

    // -------------------------------------------------------------- ERC-20

    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance(allowed, value);
            allowance[from][msg.sender] = allowed - value;
        }
        _move(from, to, value);
        return true;
    }

    function _move(address from, address to, uint256 value) internal {
        if (!_listed[from]) revert AccountIsNotInControlList(from);
        if (!_listed[to]) revert AccountIsNotInControlList(to);
        uint256 have = balanceOf[from];
        if (have < value) revert InsufficientBalance(have, value);
        balanceOf[from] = have - value;
        balanceOf[to] += value;
        _checkpoint(_balanceHistory[from], balanceOf[from]);
        _checkpoint(_balanceHistory[to], balanceOf[to]);
        emit Transfer(from, to, value);
    }

    // ------------------------------------------------------------ snapshots

    function _checkpoint(Checkpoint[] storage h, uint256 value) internal {
        uint64 now_ = uint64(block.timestamp);
        uint256 n = h.length;
        if (n > 0 && h[n - 1].at == now_) {
            h[n - 1].value = uint192(value);
        } else {
            h.push(Checkpoint({at: now_, value: uint192(value)}));
        }
    }

    /// The value as it stood at the end of second `at`.
    function _valueAt(Checkpoint[] storage h, uint64 at) internal view returns (uint256) {
        uint256 lo = 0;
        uint256 hi = h.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (h[mid].at > at) hi = mid;
            else lo = mid + 1;
        }
        return lo == 0 ? 0 : h[lo - 1].value;
    }

    function balanceOfAt(address account, uint64 at) public view returns (uint256) {
        return _valueAt(_balanceHistory[account], at);
    }

    function totalSupplyAt(uint64 at) public view returns (uint256) {
        return _valueAt(_supplyHistory, at);
    }

    // ------------------------------------------------------------ dividends

    /**
     * @notice Declare a dividend of `amount` USDC from corpus sales (approve first).
     * @dev The record date must be in the future so the snapshot cannot be
     *      chosen after looking at who holds; payment opens at `executionDate`.
     */
    function setDividend(uint64 recordDate, uint64 executionDate, uint256 amount) external onlyIssuer returns (uint256 id) {
        if (amount == 0) revert ZeroAmount();
        if (recordDate <= block.timestamp) revert RecordDateNotInFuture(recordDate);
        if (executionDate < recordDate) revert ExecutionBeforeRecord(recordDate, executionDate);
        _dividends.push(Dividend({recordDate: recordDate, executionDate: executionDate, amount: amount, claimed: 0}));
        id = _dividends.length;
        emit DividendDeclared(id, recordDate, executionDate, amount);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    function getDividendsCount() external view returns (uint256) {
        return _dividends.length;
    }

    /// @notice Dividends are numbered from 1.
    function getDividend(uint256 id)
        external
        view
        returns (uint64 recordDate, uint64 executionDate, uint256 amount, uint256 claimed, uint256 supplyAtRecord)
    {
        Dividend storage d = _dividend(id);
        bool reached = block.timestamp > d.recordDate;
        return (d.recordDate, d.executionDate, d.amount, d.claimed, reached ? totalSupplyAt(d.recordDate) : 0);
    }

    /**
     * @notice One holder's side of a dividend.
     * @return tokenBalance shares held at the record date, or now if it has not come
     * @return amount       USDC owed, 0 until the record date has passed
     */
    function getDividendFor(uint256 id, address account)
        public
        view
        returns (
            uint256 tokenBalance,
            uint256 amount,
            uint64 recordDate,
            uint64 executionDate,
            bool recordDateReached,
            bool claimed
        )
    {
        Dividend storage d = _dividend(id);
        recordDateReached = block.timestamp > d.recordDate;
        recordDate = d.recordDate;
        executionDate = d.executionDate;
        claimed = claimedBy[id][account];
        if (!recordDateReached) {
            tokenBalance = balanceOf[account];
            return (tokenBalance, 0, recordDate, executionDate, false, claimed);
        }
        tokenBalance = balanceOfAt(account, d.recordDate);
        uint256 supply = totalSupplyAt(d.recordDate);
        amount = supply == 0 ? 0 : (d.amount * tokenBalance) / supply;
    }

    /// @notice Take what a dividend owes the caller, once payment has opened.
    function claimDividend(uint256 id) external returns (uint256 amount) {
        Dividend storage d = _dividend(id);
        if (block.timestamp < d.executionDate) revert DividendNotPayable(id, d.executionDate);
        if (claimedBy[id][msg.sender]) revert AlreadyClaimed(id, msg.sender);
        (, amount,,,,) = getDividendFor(id, msg.sender);
        if (amount == 0) revert NothingOwed(id, msg.sender);
        claimedBy[id][msg.sender] = true;
        d.claimed += amount;
        emit DividendClaimed(id, msg.sender, amount);
        usdc.safeTransfer(msg.sender, amount);
    }

    /**
     * @notice Take back a dividend nobody can ever claim.
     * @dev Only when no share existed at the record date: then every holder's
     *      entitlement is zero, and without this the USDC escrowed for it would
     *      sit in the contract for good. A dividend with holders is theirs,
     *      and this cannot touch it.
     */
    function reclaimDividend(uint256 id) external onlyIssuer returns (uint256 amount) {
        Dividend storage d = _dividend(id);
        if (block.timestamp <= d.recordDate || totalSupplyAt(d.recordDate) != 0) revert NothingToReclaim(id);
        amount = d.amount - d.claimed;
        if (amount == 0) revert NothingToReclaim(id);
        d.claimed = d.amount;
        emit DividendReclaimed(id, amount);
        usdc.safeTransfer(issuer, amount);
    }

    function _dividend(uint256 id) internal view returns (Dividend storage) {
        if (id == 0 || id > _dividends.length) revert NoSuchDividend(id);
        return _dividends[id - 1];
    }
}
