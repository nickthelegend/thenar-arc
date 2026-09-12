/**
 * Every contract this protocol has deployed, and where in the app it is used.
 *
 * Six of these were deployed, source-verified, and then referenced by no part
 * of the interface at all — including the two most chain-specific things the
 * project has built: a Warp message attesting a policy, signed by Fuji's own
 * validators, and payouts that add up on chain under ElGamal without the chain
 * holding a number. A contract nobody can reach scores nothing and reads as
 * abandoned work, so this list exists to make the whole set reachable and to
 * say plainly which surface uses each one.
 *
 * `surface` is the honest answer, not the aspirational one. Where it says
 * "/contracts only", that contract has no other home in the interface yet.
 */

export type Deployed = {
  key: string;
  name: string;
  address: `0x${string}`;
  /** What it does, in one line, in the product's own terms. */
  does: string;
  source: string;
  /** Where a visitor meets it, or "/contracts only" if nowhere else yet. */
  surface: string;
  /** Set when the contract leans on something Arc gives it that a generic chain would not. */
  arc?: string;
};

/**
 * Every Thenar contract on Arc testnet.
 *
 * All of them are the Avalanche build's source, unchanged. The ones that hold
 * or move value do it in the chain's native value, and on Arc the native value
 * is USDC — so every bounty, payout, fee, pot and treasury below is dollars
 * without a line of Solidity having learned a token interface.
 *
 * LicenceReceipt is not here. It attests a policy through Avalanche's Warp
 * precompile, which Arc does not have, and a registry row for a contract whose
 * one function cannot succeed would be the aspirational answer this list exists
 * to avoid.
 */
export const DEPLOYED: Deployed[] = [
  {
    key: "axon",
    name: "AxonProtocolV2",
    address: "0x6D6D6D0ee86C654b69646223049D6812c0218B2f",
    does:
      "Tasks, escrow, trajectories, policies and cap tables. Records a run and pays for it in one call, in USDC. " +
      "submitTrajectoryFor is permissionless: anyone may pay the gas for someone else's run, because the " +
      "verifier signature binds the task, the contributor, the hash and the score, so relaying moves who " +
      "pays and forges nothing.",
    source: "contracts/src/AxonProtocolV2.sol",
    surface: "/hub, /station, /task, /run, /leaderboard, /portfolio",
    arc: "USDC is the gas. The bounty a funder escrows, the payout an operator earns and the fee to submit are one balance.",
  },
  {
    key: "certificate",
    name: "TrajectoryCertificate",
    address: "0x9dAc88a501F908FFaF41F4e0c6071c1F8B6B9B7B",
    does: "Soulbound token naming a run's recorder. Conveys no rights over the data.",
    source: "contracts/src/TrajectoryCertificate.sol",
    surface: "/contracts, /run",
  },
  {
    key: "contribution",
    name: "ContributionRecord",
    address: "0x940a9A5CB219D5061748AD10b1Dd38f82C825523",
    does: "A running total of work recorded, in a shape wallets already read. Cannot be transferred, sold or redeemed.",
    source: "contracts/src/ContributionRecord.sol",
    surface: "/contracts, /operator, /portfolio",
  },
  {
    key: "referrals",
    name: "Referrals",
    address: "0x4688D98Ca5813CA9c4702AcBbfED28B88dF9971d",
    does: "Pays two cents of USDC for bringing someone who then does the work, not for signing up.",
    source: "contracts/src/Referrals.sol",
    surface: "/portfolio, /contracts",
  },
  {
    key: "prize",
    name: "PrizePool",
    address: "0x39C7983E14ad17FA24399d8394E36EFcBd6d8b13",
    does: "A funded pot for task 1. Contributors enter themselves and it splits by work the protocol recorded.",
    source: "contracts/src/PrizePool.sol",
    surface: "/contracts",
  },
  {
    key: "foundry",
    name: "Foundry",
    address: "0x3c6eAaeEb14743944b6AC37aBBfAd6aD735a6846",
    does: "A USDC treasury the protocol's contributors vote to spend on new tasks, weighted by work recorded.",
    source: "contracts/src/Foundry.sol",
    surface: "/foundry, /contracts",
  },
  {
    key: "confidential",
    name: "ConfidentialPayouts",
    address: "0x023769421D2501E7F9cF06c1F677d85C1C393003",
    does: "ElGamal on secp256k1. Earnings add up on chain without the chain holding the number.",
    source: "contracts/src/ConfidentialPayouts.sol",
    surface: "/contracts",
  },
  {
    key: "corpusAccess",
    name: "CorpusAccess",
    address: "0x14588B2b26c3af1D0dDabc386fCe659d662B7Bc8",
    does: "Time-boxed read access to the corpus, a cent of USDC a day. Sells time, not rights.",
    source: "contracts/src/CorpusAccess.sol",
    surface: "/corpus, /api/dataset",
  },
  {
    key: "corpusManifest",
    name: "CorpusManifest",
    address: "0x956f1Bf0dd1CE3Af862388E643e708c4C37148f8",
    does: "The published shape of the corpus a licence buys.",
    source: "contracts/src/CorpusManifest.sol",
    surface: "/corpus",
  },
  {
    key: "passkey",
    name: "PasskeyRegistry",
    address: "0xecbbC9d43eF7C4E4Df00BC02757b8FC3E3b7615e",
    does: "Binds a secp256r1 public key to an address and verifies signatures through the P-256 precompile at 0x0100.",
    source: "contracts/src/PasskeyRegistry.sol",
    surface: "/passkey",
    arc: "The P-256 precompile answers on Arc: a real RIP-7212 vector verifies, a tampered one does not.",
  },
];

/** Deployments this protocol ran on before Arc, kept so their runs stay explicable. */
export const SUPERSEDED: Deployed[] = [
  {
    key: "axon-fuji",
    name: "AxonProtocolV2 on Avalanche Fuji",
    address: "0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0",
    does: "The deployment Thenar ran on before moving to Arc. Its runs are real, paid in AVAX, and verifiable on Snowtrace.",
    source: "contracts/src/AxonProtocolV2.sol",
    surface: "/archive",
  },
];
