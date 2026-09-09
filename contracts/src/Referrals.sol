// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAxonScore {
    function totalScore(address who) external view returns (uint256);
    function totalRuns(address who) external view returns (uint256);
}

/**
 * @title Referrals
 * @notice A bounty for bringing someone who then does the work.
 *
 * Referral programmes were rejected here as growth theatre with no users, and
 * that objection is worth restating rather than hiding: this protocol has no
 * organic demand yet, and a referral scheme does not create any. What it can
 * be is honest — a real pot, paid on a condition nobody can fake for free —
 * and that is what this is.
 *
 * The condition is deliberately not "signed up". Nothing is paid for an
 * address existing; the newcomer has to have run the station and had a
 * trajectory accepted at a real score before anything moves. The referrer must
 * be a contributor too, so this cannot be farmed by an address that has never
 * done the work it is recommending.
 *
 * None of that makes it sybil-proof, and it is not claimed to be: anyone
 * willing to do genuine accepted runs from fresh addresses can collect. What
 * it does is make the cost of farming it the same as the cost of contributing,
 * which is the most a contract that cannot see identities can promise. The cap
 * per referrer bounds the damage rather than preventing it.
 */
contract Referrals {
    IAxonScore public immutable axon;

    /// Paid to the referrer, once, when their newcomer has earned their place.
    uint256 public immutable bounty;

    /// What the newcomer must have earned on the protocol before this pays.
    /// One accepted run at the floor is 4,000, so this is roughly two decent
    /// runs — enough that claiming costs more effort than the bounty is worth
    /// to anyone who is not actually contributing.
    uint256 public constant MIN_NEWCOMER_WEIGHT = 12_000;

    /// A ceiling on what one referrer can be paid for. Not a defence against
    /// sybils — it is a bound on how much any single one can take.
    uint32 public constant MAX_PER_REFERRER = 10;

    mapping(address => address) public referrerOf;
    mapping(address => uint32) public referredBy;
    uint256 public paidOut;

    error AlreadyClaimed();
    error NotEnoughWork();
    error ReferrerHasNoWork();
    error CannotReferYourself();
    error ReferrerAtCap();
    error PotEmpty();

    event Funded(address indexed from, uint256 amount);
    event Referred(address indexed newcomer, address indexed referrer, uint256 bounty);

    constructor(address protocol, uint256 bounty_) payable {
        axon = IAxonScore(protocol);
        bounty = bounty_;
        if (msg.value > 0) emit Funded(msg.sender, msg.value);
    }

    receive() external payable { emit Funded(msg.sender, msg.value); }

    /**
     * @notice Name who brought you, once you have done the work.
     *
     * Called by the newcomer, not by the referrer. A referrer who could claim
     * on someone else's behalf could name themselves the introducer of every
     * address that ever ran the station.
     */
    function claim(address referrer) external returns (uint256 paid) {
        if (referrerOf[msg.sender] != address(0)) revert AlreadyClaimed();
        if (referrer == msg.sender) revert CannotReferYourself();
        if (axon.totalScore(msg.sender) < MIN_NEWCOMER_WEIGHT) revert NotEnoughWork();
        // The referrer has to have contributed too, so this cannot be farmed
        // by an address that has never done the thing it is recommending.
        if (axon.totalRuns(referrer) == 0) revert ReferrerHasNoWork();
        if (referredBy[referrer] >= MAX_PER_REFERRER) revert ReferrerAtCap();
        if (address(this).balance < bounty) revert PotEmpty();

        referrerOf[msg.sender] = referrer;
        referredBy[referrer] += 1;
        paidOut += bounty;
        paid = bounty;

        emit Referred(msg.sender, referrer, bounty);
        (bool ok, ) = payable(referrer).call{value: bounty, gas: 30_000}("");
        if (!ok) {
            // Undo rather than strand the record: a claim that did not pay
            // should be claimable again once the referrer can receive.
            referrerOf[msg.sender] = address(0);
            referredBy[referrer] -= 1;
            paidOut -= bounty;
            paid = 0;
        }
    }

    /// How many more claims the pot can honour.
    function remaining() external view returns (uint256) {
        return bounty == 0 ? 0 : address(this).balance / bounty;
    }
}
