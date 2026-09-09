// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CorpusAccess
 * @notice Time-boxed access to the corpus, instead of one licence at a time.
 *
 * Subscription pricing was rejected because the protocol prices a licence per
 * policy, and that is still the right shape for buying a policy: a licence is
 * a permanent right in one trained artefact and its fee splits to the people
 * who trained it. It is the wrong shape for the other thing a buyer wants,
 * which is to read the corpus while deciding — and charging a permanent
 * licence fee for a look is how you end up with nobody looking.
 *
 * So this sells time, not rights. A subscription conveys no ownership, no
 * licence, and no claim on any policy; it is permission to pull episodes for a
 * while. What is paid goes to the treasury, not to contributors, because
 * reading is not what contributors are owed for — their payment is the run.
 *
 * Deliberately not an ERC-20 or a receipt token. The only question anyone asks
 * of this contract is "is this address allowed to read right now", and the
 * answer is a timestamp comparison that any server can make without trusting
 * anything this project runs.
 */
contract CorpusAccess {
    address public immutable treasury;

    /// Price per day, in wei. Set once at deployment; changing what a thing
    /// costs after people have bought it is its own kind of dishonesty.
    uint256 public immutable pricePerDay;

    /// Bought in whole days, and bounded: a subscription long enough to
    /// outlive the deployment is a promise this cannot keep.
    uint32 public constant MAX_DAYS = 365;
    uint32 public constant MIN_DAYS = 1;

    /// When each address's access runs out, in unix seconds.
    mapping(address => uint64) public until;

    error BadDuration();
    error Underpaid();
    error TransferFailed();

    event Subscribed(address indexed who, uint32 days_, uint256 paid, uint64 until);

    constructor(address treasury_, uint256 pricePerDay_) {
        treasury = treasury_;
        pricePerDay = pricePerDay_;
    }

    /**
     * @notice Buy or extend access.
     *
     * Extending adds to whatever is left rather than replacing it, so renewing
     * early cannot cost someone the days they already paid for.
     */
    function subscribe(uint32 days_) external payable returns (uint64 expires) {
        if (days_ < MIN_DAYS || days_ > MAX_DAYS) revert BadDuration();
        uint256 due = uint256(days_) * pricePerDay;
        if (msg.value < due) revert Underpaid();

        uint64 from = until[msg.sender] > block.timestamp
            ? until[msg.sender]
            : uint64(block.timestamp);
        expires = from + uint64(days_) * 1 days;
        until[msg.sender] = expires;

        emit Subscribed(msg.sender, days_, msg.value, expires);

        (bool ok, ) = payable(treasury).call{value: msg.value}("");
        if (!ok) revert TransferFailed();
    }

    /// The only question this contract exists to answer.
    function active(address who) external view returns (bool) {
        return until[who] > block.timestamp;
    }

    /// Seconds left, for a caller that wants to say how long rather than whether.
    function remaining(address who) external view returns (uint64) {
        uint64 u = until[who];
        return u > block.timestamp ? u - uint64(block.timestamp) : 0;
    }
}
