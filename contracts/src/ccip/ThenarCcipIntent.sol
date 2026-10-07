// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * The instruction ThenarCcipSender sends to ThenarCcipReceiver over Chainlink CCIP.
 *
 * `message.data = abi.encode(uint8 action, bytes body)`:
 *   LICENSE: body = abi.encode(bytes32 orderId, address licensee, uint256 policyId, uint256 amount)
 *
 * `licensee` is always the source-chain `msg.sender` of the sender contract
 * (an EOA has the same address on Arc), and `amount` is what CCTP V2 mints to
 * the receiver on Arc for this order (at least the policy's licence fee).
 */
library ThenarCcipIntent {
    uint8 internal constant LICENSE = 1;

    /// Arc's CCTP V2 domain.
    uint32 internal constant ARC_CCTP_DOMAIN = 26;

    function license(bytes32 orderId, address licensee, uint256 policyId, uint256 amount)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(LICENSE, abi.encode(orderId, licensee, policyId, amount));
    }
}
