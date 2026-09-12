// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Referrals} from "../src/Referrals.sol";
import {PrizePool} from "../src/PrizePool.sol";
import {Foundry} from "../src/Foundry.sol";
import {ConfidentialPayouts} from "../src/ConfidentialPayouts.sol";
import {CorpusManifest} from "../src/CorpusManifest.sol";

/**
 * The rest of Thenar's contracts, on Arc.
 *
 * Every one of these is funded or paid in the chain's native value, so on Arc
 * every one of them is denominated in USDC without a line changing: the
 * referral bounty, the prize pot and the treasury the contributors vote to
 * spend are all dollars.
 *
 * LicenceReceipt is deliberately not here. It attests a policy by calling
 * Avalanche's Warp precompile, which does not exist on Arc, and deploying it
 * would put a contract on the registry whose only function cannot succeed.
 *
 * Native USDC has 18 decimals on Arc; `0.02 ether` is two cents.
 */
contract DeployArcExtras is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address verifier = vm.envAddress("VERIFIER_ADDRESS");
        address axon = vm.envAddress("AXON_ADDRESS");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        // Two cents per honoured introduction, funded for five.
        Referrals referrals = new Referrals{value: 0.1 ether}(axon, 0.02 ether);
        // A treasury contributors vote to spend on new tasks.
        Foundry foundry = new Foundry{value: 0.2 ether}(axon);
        // A pot for task 1, open for three days.
        PrizePool prize = new PrizePool{value: 0.1 ether}(axon, 1, uint64(block.timestamp + 3 days));
        ConfidentialPayouts confidential = new ConfidentialPayouts(deployer);
        CorpusManifest manifest = new CorpusManifest(verifier);

        vm.stopBroadcast();

        console.log("Referrals", address(referrals));
        console.log("Foundry", address(foundry));
        console.log("PrizePool", address(prize));
        console.log("ConfidentialPayouts", address(confidential));
        console.log("CorpusManifest", address(manifest));
    }
}
