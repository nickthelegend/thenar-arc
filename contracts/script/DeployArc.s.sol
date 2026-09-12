// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {TrajectoryCertificate} from "../src/TrajectoryCertificate.sol";
import {ContributionRecord} from "../src/ContributionRecord.sol";
import {CorpusAccess} from "../src/CorpusAccess.sol";

/**
 * Thenar on Arc.
 *
 * The protocol is unchanged from the Avalanche deployment, and that is the
 * point of the port rather than an omission. AxonProtocolV2 escrows and pays in
 * the chain's native value — msg.value in, a call with value out — and on Arc
 * the native value *is* USDC. So a task's bounty, an operator's payout, a
 * licence fee and the gas to submit all come out of one balance in one
 * currency, and nothing about the contract had to learn a token interface to
 * get there.
 *
 * One unit to get right: native USDC on Arc has 18 decimals, not the 6 its
 * ERC-20 face reports. `0.05 ether` here is five cents.
 */
contract DeployArc is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        PasskeyRegistry passkeys = new PasskeyRegistry();
        AxonProtocolV2 axon = new AxonProtocolV2(verifier, deployer, address(passkeys));
        TrajectoryCertificate certificate = new TrajectoryCertificate(address(axon));
        ContributionRecord record = new ContributionRecord(address(axon));
        // A cent a day for bulk corpus access, paid in the gas token.
        CorpusAccess access = new CorpusAccess(deployer, 0.01 ether);

        console.log("PasskeyRegistry", address(passkeys));
        console.log("AxonProtocolV2", address(axon));
        console.log("TrajectoryCertificate", address(certificate));
        console.log("ContributionRecord", address(record));
        console.log("CorpusAccess", address(access));

        uint128 r = 0.05 ether; // five cents of USDC per accepted run
        _task(axon, "Put the toothpaste into the upper drawer", 6, r, 3, 3, 0);
        _task(axon, "Put the spoon and the mug into the crate", 6, r, 4, 3, 0);
        _task(axon, "Practise a smooth transfer across the bench", 6, r, 0, 2, 0);
        _task(axon, "Steady the crate with both arms and place the battery inside", 6, r, 4, 4, 0);
        // A deadline a week out, so closeTask has something real to close.
        _task(axon, "Put the pen on the closed laptop", 6, r, 2, 2, uint64(block.timestamp + 7 days));

        vm.stopBroadcast();
    }

    function _task(
        AxonProtocolV2 axon, string memory name, uint32 slots,
        uint128 reward, uint8 scenario, uint8 difficulty, uint64 expiresAt
    ) internal {
        uint256 id = axon.createTaskUntil{value: uint256(reward) * slots}(
            name, slots, reward, scenario, difficulty, expiresAt
        );
        console.log("task", id, name);
    }
}
