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
  "status": "deployed",
  "deployBlock": 67015623,
  "deployedAt": "2026-10-13T16:16:55.000Z",
  "deployer": "0x0648aDF1967692A0c991d7715b0b588452321FBd",
  "verifier": "0xdfbAF44dd5531371582AFEF222494f01ab227494",
  "issuer": "0xd9CDb1bbc2Fb252906ef009013d7783445a67E9E",
  "auditor": "0xd9CDb1bbc2Fb252906ef009013d7783445a67E9E",
  "treasury": "0x0648aDF1967692A0c991d7715b0b588452321FBd",
  "maxTaskEscrow": "1000000000",
  "contracts": {
    "passkeyRegistry": "0x3a9D0CA0029905dc32f8036BA28DFF33080AC254",
    "verdicts": "0xe3A583c613B075E61e18da4bFB82b94888721a8e",
    "protocol": "0xa8Ec6e8f33F5b5B980336a3cdd3BB799EEA38619",
    "trajectoryCertificate": "0x49082C4AB554003f9b517146a8265E208Ef5067B",
    "contributionRecord": "0x9e38cA5E04c8135e6676D2C6633f9cB5747bE578",
    "corpusManifest": "0x9cAF33dEcfab291D63D451e934eae410a09B0012",
    "corpusShares": "0x4E8f310ffc70C9DcaA64f5CaDb5F20a50cE8482d",
    "salesLog": "0x8095Ea4D12620B4EC116F951C954702832fA6845",
    "corpusAudit": "0x69b02DA6F64a2d5962Ef0b4710bAFd85D76e5bC0",
    "ccipReceiver": "0x9bC7A8F90e8B26ca1135358938A5542cD9334b92"
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
