/**
 * Thenar's deployments on Arc, as contracts/script/Deploy.s.sol recorded them
 * in deployments/arc-<network>.json. Written by scripts/apply-deploy.mjs; do
 * not edit by hand. An empty address means not deployed yet, which every
 * surface already knows how to say.
 *
 * No imports: scripts load this file with Node, outside the Next build.
 */
export type Deployment = {
  network: string;
  chainId: number;
  status: string;
  deployBlock: number;
  deployedAt: string;
  deployer: string;
  verifier: string;
  issuer: string;
  auditor: string;
  treasury: string;
  maxTaskEscrow: string;
  contracts: Record<"passkeyRegistry" | "verdicts" | "protocol" | "trajectoryCertificate" | "contributionRecord" | "corpusManifest" | "corpusShares" | "salesLog" | "corpusAudit" | "ccipReceiver", string>;
  external: Record<"usdc" | "erc8004IdentityRegistry" | "erc8004ReputationRegistry" | "erc8004ValidationRegistry" | "ccipRouter" | "ccipChainSelector" | "memo" | "cctpTokenMessengerV2" | "cctpMessageTransmitterV2" | "cctpDomain" | "gatewayWallet" | "gatewayMinter", string>;
};

export const TESTNET_DEPLOYMENT: Deployment = {
  "network": "testnet",
  "chainId": 5042002,
  "status": "not deployed",
  "deployBlock": 0,
  "deployedAt": "",
  "deployer": "",
  "verifier": "",
  "issuer": "",
  "auditor": "",
  "treasury": "",
  "maxTaskEscrow": "",
  "contracts": {
    "passkeyRegistry": "",
    "verdicts": "",
    "protocol": "",
    "trajectoryCertificate": "",
    "contributionRecord": "",
    "corpusManifest": "",
    "corpusShares": "",
    "salesLog": "",
    "corpusAudit": "",
    "ccipReceiver": ""
  },
  "external": {
    "usdc": "0x3600000000000000000000000000000000000000",
    "erc8004IdentityRegistry": "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    "erc8004ReputationRegistry": "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    "erc8004ValidationRegistry": "0x8004Cb1BF31DAf7788923b405b754f57acEB4272",
    "ccipRouter": "0xdE4E7FED43FAC37EB21aA0643d9852f75332eab8",
    "ccipChainSelector": "3034092155422581607",
    "memo": "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
    "cctpTokenMessengerV2": "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    "cctpMessageTransmitterV2": "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
    "cctpDomain": "26",
    "gatewayWallet": "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
    "gatewayMinter": "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B"
  }
};

export const MAINNET_DEPLOYMENT: Deployment = {
  "network": "mainnet",
  "chainId": 5042,
  "status": "not deployed",
  "deployBlock": 0,
  "deployedAt": "",
  "deployer": "",
  "verifier": "",
  "issuer": "",
  "auditor": "",
  "treasury": "",
  "maxTaskEscrow": "",
  "contracts": {
    "passkeyRegistry": "",
    "verdicts": "",
    "protocol": "",
    "trajectoryCertificate": "",
    "contributionRecord": "",
    "corpusManifest": "",
    "corpusShares": "",
    "salesLog": "",
    "corpusAudit": "",
    "ccipReceiver": ""
  },
  "external": {
    "usdc": "0x3600000000000000000000000000000000000000",
    "erc8004IdentityRegistry": "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    "erc8004ReputationRegistry": "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    "erc8004ValidationRegistry": "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58",
    "ccipRouter": "0xB79791184973589c38e114D43Eb8E4588C283A18",
    "ccipChainSelector": "6370580034781731079",
    "memo": "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
    "cctpTokenMessengerV2": "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
    "cctpMessageTransmitterV2": "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
    "cctpDomain": "26",
    "gatewayWallet": "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE",
    "gatewayMinter": "0x2222222d7164433c4C09B0b0D809a9b52C04C205"
  }
};
