// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AxonProtocolV2} from "../src/AxonProtocolV2.sol";

/**
 * Deploy v2 and seed it.
 *
 * The catalogue is deliberately smaller than v1's: the point of this
 * deployment is the three behaviours v1 could not perform, and the runs
 * already settled on v1 stay readable in the archive rather than being
 * recreated here. One task carries a deadline so expiry is exercisable rather
 * than merely present.
 */
contract DeployV2 is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address registry = vm.envAddress("PASSKEY_REGISTRY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        AxonProtocolV2 axon = new AxonProtocolV2(verifier, deployer, registry);
        console.log("AxonProtocolV2", address(axon));

        uint128 r = 0.0008 ether;
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
