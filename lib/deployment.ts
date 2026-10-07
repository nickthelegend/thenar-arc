/**
 * The Monad testnet deployment, as contracts/script/DeployMonad.s.sol left it.
 *
 * Written by scripts/apply-deploy.mjs from forge's broadcast record, never by
 * hand, so an address here is an address a transaction created. Public on
 * purpose: every value is on chain already, and committing it means a fresh
 * checkout and the deployed site read the same contracts without either
 * needing an env file to agree.
 *
 * An empty address means not deployed yet, which every surface already knows
 * how to say.
 *
 * No imports: scripts load this file with Node, outside the Next build.
 */
export const DEPLOYMENT = {
  chainId: 10143,
  /** The block AxonProtocolV2 was created in. */
  deployBlock: 64987386,
  deployedAt: "2026-09-23T10:08:57.105Z",
  deployer: "0xDf93bdA9B5de2fBf71C2201268DEFf54c1689815",
  verifier: "0xC7D11f79514129f63427535dCB6Fdf39300F893D",
  contracts: {
    passkeyRegistry: "0xE344179839c9cA2101Ad930BD49268103F3945a9",
    axon: "0x17731731c6652770CE630e29b62791DC2CED5f38",
    trajectoryCertificate: "0x0604C7afC6E17Cbe59644040C2373C97a56439EA",
    contributionRecord: "0xd2527d7e737A63118036164A9F1D4dB3CDc3e27E",
    corpusAccess: "0xD0ad261D8d7a3D5a1D0Bf6Ed6EbE4BAD691b4AA1",
    corpusManifest: "0x692190b7955821C050FFFbC7741D31a65Ecd5c48",
    corpusShares: "0xAE1F24fE0F759BEF941eA2Df2dcb23dc3e130fc7",
    salesLog: "0xf34A45021B8006C141E8b9CFe4B8a509a9b1fE27",
    referrals: "0xb51CBeF22F6B68A0FBC93A3dDb3e54Fb93c4269b",
    foundry: "0x9Fba189A0C60500c760d49C98d695861f7395311",
    prizePool: "0xcf5E9A252d90A1D08C1909cD4022C5188CCe4E5E",
    confidentialPayouts: "0x4CC9Dd3b85Fa3E1D69f365f26eD80c9c1068A4A0",
  },
} as const;
