// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AxonProtocol} from "../src/AxonProtocol.sol";

/// Deploys AxonProtocol and seeds the live task catalogue with funded bounties.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        // The passkey registry is already deployed and verified; the protocol
        // composes with it rather than duplicating the precompile call.
        address registry = vm.envAddress("PASSKEY_REGISTRY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        AxonProtocol axon = new AxonProtocol(verifier, deployer, registry);
        console.log("AxonProtocol", address(axon));
        console.log("verifier    ", verifier);
        console.log("passkeys    ", registry);

        // Seed bounties. Slot counts are small so a task can actually fill and
        // mint its policy during a demo; the reward is what a run really pays.
        // A spread of sizes on purpose: the small ones can actually fill during a
        // demo, and the large ones cross SLOTS_PER_SHARD so the sharded counter
        // is exercised rather than merely present.
        _task(axon, "Put the toothpaste into the upper drawer", 32, 0.004 ether, 3, 3);
        _task(axon, "Put the apricot into the air fryer", 24, 0.003 ether, 1, 2);
        _task(axon, "Put the pen on the closed laptop", 12, 0.003 ether, 2, 2);
        _task(axon, "Put the shrimp to the left of the honey jar", 8, 0.006 ether, 1, 4);
        _task(axon, "Rotate the dice to show four", 8, 0.008 ether, 6, 5);
        _task(axon, "Insert the eraser into the pen cup", 16, 0.003 ether, 2, 3);
        _task(axon, "Stack the honey jar behind the toast", 8, 0.005 ether, 1, 4);
        _task(axon, "Reach the far shelf and place the mug", 6, 0.009 ether, 5, 5);

        vm.stopBroadcast();
    }

    function _task(
        AxonProtocol axon, string memory name, uint32 slots,
        uint128 reward, uint8 scenario, uint8 difficulty
    ) internal {
        uint256 id = axon.createTask{value: uint256(reward) * slots}(
            name, slots, reward, scenario, difficulty
        );
        console.log("task", id, name);
    }
}
