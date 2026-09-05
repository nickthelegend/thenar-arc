// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAxon {
    function submitTrajectory(
        uint256 taskId, bytes32 trajHash, string calldata cid, uint16 score, bytes calldata signature
    ) external returns (uint256);
    function claimable(address) external view returns (uint256);
    function claim() external;
}

/**
 * A contributor that refuses incoming transfers.
 *
 * The protocol must not let one operator's broken wallet revert a submission,
 * so a failed push is credited to `claimable` instead. This exists to exercise
 * that path against the real chain rather than only in a unit test.
 */
contract RefusingContributor {
    IAxon public immutable axon;
    bool public accepting;

    constructor(address _axon) {
        axon = IAxon(_axon);
    }

    function submit(
        uint256 taskId, bytes32 trajHash, string calldata cid, uint16 score, bytes calldata sig
    ) external returns (uint256) {
        return axon.submitTrajectory(taskId, trajHash, cid, score, sig);
    }

    /// Stop refusing, then pull the balance the protocol held for us.
    function acceptAndClaim() external {
        accepting = true;
        axon.claim();
    }

    function owed() external view returns (uint256) {
        return axon.claimable(address(this));
    }

    receive() external payable {
        require(accepting, "refusing");
    }
}
