// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MockERC3009} from "./MockERC3009.sol";

/**
 * USDC as Circle's FiatToken behaves toward a blocklisted address: any
 * transfer to or from one reverts. ThenarProtocol must turn a refused push
 * payment into `claimable` instead of reverting the run or the licence.
 * EIP-712 domain "USDC" / "2", like the token at 0x3600…0000 on Arc.
 */
contract MockBlocklistUSDC is MockERC3009 {
    mapping(address => bool) public isBlacklisted;

    event Blacklisted(address indexed account);
    event UnBlacklisted(address indexed account);

    constructor() MockERC3009("USDC", "2") {}

    function blacklist(address account) external {
        isBlacklisted[account] = true;
        emit Blacklisted(account);
    }

    function unBlacklist(address account) external {
        isBlacklisted[account] = false;
        emit UnBlacklisted(account);
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!isBlacklisted[from] && !isBlacklisted[to], "Blacklistable: account is blacklisted");
        super._update(from, to, value);
    }
}
