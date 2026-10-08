// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ThenarProtocol} from "../src/ThenarProtocol.sol";
import {ThenarVerdicts} from "../src/ThenarVerdicts.sol";
import {PasskeyRegistry} from "../src/PasskeyRegistry.sol";
import {TrajectoryCertificate} from "../src/TrajectoryCertificate.sol";
import {ContributionRecord} from "../src/ContributionRecord.sol";
import {CorpusManifest} from "../src/CorpusManifest.sol";
import {CorpusShares} from "../src/CorpusShares.sol";
import {SalesLog} from "../src/SalesLog.sol";
import {CorpusAudit} from "../src/CorpusAudit.sol";
import {ThenarCcipReceiver} from "../src/ccip/ThenarCcipReceiver.sol";
import {ArcConfig} from "./ArcConfig.sol";

/**
 * Deploy Thenar on Arc in one broadcast and write deployments/arc-<network>.json.
 *
 *   NETWORK=testnet|mainnet|local     local = whatever --rpc-url is (an Arc fork), testnet's external addresses
 *   DEPLOYER_PRIVATE_KEY              pays, owns the CCIP receiver's allowlist, funds the seed tasks (never logged)
 *   THENAR_VERIFIER_ADDRESS           signs scores (EIP-712 "Thenar"/"1"); the protocol pays only its signatures
 *   THENAR_ISSUER_ADDRESS             admits operators to CorpusShares and writes SalesLog
 *   THENAR_AUDITOR_ADDRESS            the audit keeper (CorpusAudit); default: the issuer
 *   THENAR_TREASURY                   licence fees and x402 sales; default: the deployer
 *   THENAR_MAX_TASK_ESCROW            per-task cap in USDC base units (6 dec); default 1,000 USDC (100 on mainnet)
 *   THENAR_SEED_REWARD                seed tasks' reward per perfect run, base units; default 0.05 USDC; 0 = no seeding
 *   THENAR_CONFIRM_MAINNET=1          required for NETWORK=mainnet
 *   THENAR_DEPLOYMENT_OUT             output path (default ../deployments/arc-<network>.json)
 *
 * Run it through scripts/deploy.sh, which builds first and holds the shared deployer lock only for the broadcast.
 */
contract Deploy is Script {
    struct Roles {
        address deployer;
        address verifier;
        address issuer;
        address auditor;
        address treasury;
        uint128 maxTaskEscrow;
        uint128 seedReward;
    }

    struct Deployed {
        address passkeyRegistry;
        address verdicts;
        address protocol;
        address trajectoryCertificate;
        address contributionRecord;
        address corpusManifest;
        address corpusShares;
        address salesLog;
        address corpusAudit;
        address ccipReceiver;
        uint256 seededTasks;
    }

    function run() external returns (Deployed memory d) {
        string memory network = vm.envOr("NETWORK", string("testnet"));
        ArcConfig.Arc memory arc = _arc(network);
        bool mainnet = _eq(network, "mainnet");

        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        Roles memory r;
        r.deployer = vm.addr(key);
        r.verifier = vm.envAddress("THENAR_VERIFIER_ADDRESS");
        r.issuer = vm.envAddress("THENAR_ISSUER_ADDRESS");
        r.auditor = vm.envOr("THENAR_AUDITOR_ADDRESS", r.issuer);
        r.treasury = vm.envOr("THENAR_TREASURY", r.deployer);
        r.maxTaskEscrow = uint128(vm.envOr("THENAR_MAX_TASK_ESCROW", mainnet ? uint256(100e6) : uint256(1_000e6)));
        r.seedReward = uint128(vm.envOr("THENAR_SEED_REWARD", uint256(50_000)));
        require(r.verifier != address(0) && r.issuer != address(0), "Deploy: verifier and issuer are required");

        if (mainnet) {
            require(vm.envOr("THENAR_CONFIRM_MAINNET", uint256(0)) == 1, "Deploy: set THENAR_CONFIRM_MAINNET=1 for Arc MAINNET");
            require(r.verifier != r.deployer, "Deploy: on mainnet the verifier must not be the deployer key");
            console2.log("==============================================================");
            console2.log("  ARC MAINNET (chain 5042). REAL USDC. Deployer:", r.deployer);
            console2.log("==============================================================");
        }
        if (!_eq(network, "local")) require(block.chainid == arc.chainId, "Deploy: --rpc-url is not on NETWORK's chain");

        vm.startBroadcast(key);
        _deploy(arc, r, d);
        if (r.seedReward > 0) d.seededTasks = _seed(arc, r, ThenarProtocol(d.protocol));
        vm.stopBroadcast();

        console2.log("network              ", network);
        console2.log("chain id             ", block.chainid);
        console2.log("ThenarProtocol       ", d.protocol);
        console2.log("ThenarVerdicts       ", d.verdicts);
        console2.log("ThenarCcipReceiver   ", d.ccipReceiver);
        console2.log("seeded tasks         ", d.seededTasks);
        _write(network, arc, r, d);
    }

    function _deploy(ArcConfig.Arc memory arc, Roles memory r, Deployed memory d) internal {
        PasskeyRegistry passkeys = new PasskeyRegistry();
        ThenarVerdicts verdicts = new ThenarVerdicts(arc.identityRegistry, arc.reputationRegistry);
        ThenarProtocol protocol = new ThenarProtocol(
            r.verifier, r.treasury, address(passkeys), arc.usdc, address(verdicts), r.maxTaskEscrow
        );
        verdicts.setProtocol(address(protocol));

        d.passkeyRegistry = address(passkeys);
        d.verdicts = address(verdicts);
        d.protocol = address(protocol);
        d.trajectoryCertificate = address(new TrajectoryCertificate(address(protocol)));
        d.contributionRecord = address(new ContributionRecord(address(protocol)));
        d.corpusManifest = address(new CorpusManifest(r.verifier));
        d.corpusShares = address(new CorpusShares("Thenar Robot Corpus", "THNRC", r.issuer, arc.usdc));
        d.salesLog = address(new SalesLog(r.issuer));
        d.corpusAudit = address(new CorpusAudit(r.auditor));
        d.ccipReceiver = address(new ThenarCcipReceiver(arc.ccipRouter, address(protocol), arc.usdc, r.deployer));
    }

    /// The opening bounties, funded in USDC from the deployer. Six slots each; the last expires in a week.
    function _seed(ArcConfig.Arc memory arc, Roles memory r, ThenarProtocol protocol) internal returns (uint256 n) {
        uint256 each = uint256(r.seedReward) * 6;
        IERC20(arc.usdc).approve(address(protocol), each * 5);
        protocol.createTask("Put the toothpaste into the upper drawer", 6, r.seedReward, 3, 3, each);
        protocol.createTask("Put the spoon and the mug into the crate", 6, r.seedReward, 4, 3, each);
        protocol.createTask("Practise a smooth transfer across the bench", 6, r.seedReward, 0, 2, each);
        protocol.createTask("Steady the crate with both arms and place the battery inside", 6, r.seedReward, 4, 4, each);
        protocol.createTaskUntil(
            "Put the pen on the closed laptop", 6, r.seedReward, 2, 2, uint64(block.timestamp + 7 days), each
        );
        return 5;
    }

    function _arc(string memory network) internal view returns (ArcConfig.Arc memory arc) {
        if (_eq(network, "mainnet")) return ArcConfig.mainnet();
        if (_eq(network, "testnet")) return ArcConfig.testnet();
        require(_eq(network, "local"), "Deploy: NETWORK must be testnet, mainnet or local");
        arc = ArcConfig.testnet();
        arc.name = "local";
        arc.chainId = block.chainid;
    }

    function _write(string memory network, ArcConfig.Arc memory arc, Roles memory r, Deployed memory d) internal {
        string memory c = "contracts";
        vm.serializeAddress(c, "passkeyRegistry", d.passkeyRegistry);
        vm.serializeAddress(c, "verdicts", d.verdicts);
        vm.serializeAddress(c, "protocol", d.protocol);
        vm.serializeAddress(c, "trajectoryCertificate", d.trajectoryCertificate);
        vm.serializeAddress(c, "contributionRecord", d.contributionRecord);
        vm.serializeAddress(c, "corpusManifest", d.corpusManifest);
        vm.serializeAddress(c, "corpusShares", d.corpusShares);
        vm.serializeAddress(c, "salesLog", d.salesLog);
        vm.serializeAddress(c, "corpusAudit", d.corpusAudit);
        string memory contractsJson = vm.serializeAddress(c, "ccipReceiver", d.ccipReceiver);

        string memory e = "external";
        vm.serializeAddress(e, "usdc", arc.usdc);
        vm.serializeAddress(e, "erc8004IdentityRegistry", arc.identityRegistry);
        vm.serializeAddress(e, "erc8004ReputationRegistry", arc.reputationRegistry);
        vm.serializeAddress(e, "erc8004ValidationRegistry", arc.validationRegistry);
        vm.serializeAddress(e, "ccipRouter", arc.ccipRouter);
        vm.serializeString(e, "ccipChainSelector", vm.toString(arc.ccipChainSelector));
        vm.serializeAddress(e, "memo", arc.memo);
        vm.serializeAddress(e, "cctpTokenMessengerV2", arc.tokenMessengerV2);
        vm.serializeAddress(e, "cctpMessageTransmitterV2", arc.messageTransmitterV2);
        vm.serializeUint(e, "cctpDomain", arc.cctpDomain);
        vm.serializeAddress(e, "gatewayWallet", arc.gatewayWallet);
        string memory externalJson = vm.serializeAddress(e, "gatewayMinter", arc.gatewayMinter);

        string memory root = "root";
        vm.serializeString(root, "network", network);
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeString(root, "status", "deployed");
        vm.serializeAddress(root, "deployer", r.deployer);
        vm.serializeAddress(root, "verifier", r.verifier);
        vm.serializeAddress(root, "issuer", r.issuer);
        vm.serializeAddress(root, "auditor", r.auditor);
        vm.serializeAddress(root, "treasury", r.treasury);
        vm.serializeUint(root, "maxTaskEscrow", r.maxTaskEscrow);
        vm.serializeUint(root, "seededTasks", d.seededTasks);
        vm.serializeUint(root, "deployBlock", block.number);
        vm.serializeUint(root, "timestamp", block.timestamp);
        vm.serializeString(root, "contracts", contractsJson);
        string memory json = vm.serializeString(root, "external", externalJson);

        string memory out = vm.envOr(
            "THENAR_DEPLOYMENT_OUT", string.concat(vm.projectRoot(), "/../deployments/arc-", network, ".json")
        );
        vm.writeJson(json, out);
        console2.log("record               ", out);
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
