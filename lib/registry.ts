/**
 * Every contract this protocol has deployed, and where in the app it is used.
 *
 * Contracts were once deployed, source-verified, and then referenced by no
 * part of the interface at all. A contract nobody can reach scores nothing and
 * reads as abandoned work, so this list exists to make the whole set reachable
 * and to say plainly which surface uses each one.
 *
 * `surface` is the honest answer, not the aspirational one. Where it says
 * "/contracts only", that contract has no other home in the interface yet.
 */

import { ACTIVE_DEPLOYMENT as DEPLOYMENT } from "./chain";

export type Deployed = {
  key: string;
  name: string;
  address: `0x${string}`;
  /** What it does, in one line, in the product's own terms. */
  does: string;
  source: string;
  /** Where a visitor meets it, or "/contracts only" if nowhere else yet. */
  surface: string;
  /** Set when the contract leans on something Monad gives it that a generic chain would not. */
  monad?: string;
  /** The chain the contract is on, when it is not the one this app settles on. */
  chainId?: number;
};

const C = DEPLOYMENT.contracts;
const at = (a: string) => a as `0x${string}`;

/**
 * Every Thenar contract on Monad testnet, read from lib/deployment.ts.
 *
 * The ones that hold or move value do it in MON, the chain's native value, so
 * a bounty, a payout, a pot and a treasury are one currency. Corpus sales to
 * agents are the exception: they are paid per pull in USDC over x402, and
 * SalesLog records each one.
 *
 * LicenceReceipt, PolicyAnnouncer and PolicyRegistry are not here. They attest
 * a policy through Avalanche's Warp and Teleporter, which Monad does not have,
 * and a registry row for a contract whose one function cannot succeed would be
 * the aspirational answer this list exists to avoid.
 */
export const DEPLOYED: Deployed[] = [
  {
    key: "axon",
    name: "AxonProtocolV2",
    address: at(C.axon),
    does:
      "Tasks, escrow, trajectories, policies and cap tables. Records a run and pays for it in one call, in MON. " +
      "submitTrajectoryFor is permissionless: anyone may pay the gas for someone else's run, because the " +
      "verifier signature binds the task, the contributor, the hash and the score, so relaying moves who " +
      "pays and forges nothing.",
    source: "contracts/src/AxonProtocolV2.sol",
    surface: "/hub, /station, /task, /run, /leaderboard, /portfolio",
    monad:
      "Written for parallel execution: each operator's submit writes only its own shard of the slot counter, " +
      "so two runs on one task do not touch the same storage and settle side by side in one block.",
  },
  {
    key: "certificate",
    name: "TrajectoryCertificate",
    address: at(C.trajectoryCertificate),
    does: "Soulbound token naming a run's recorder. Conveys no rights over the data.",
    source: "contracts/src/TrajectoryCertificate.sol",
    surface: "/contracts, /run",
  },
  {
    key: "contribution",
    name: "ContributionRecord",
    address: at(C.contributionRecord),
    does: "A running total of work recorded, in a shape wallets already read. Cannot be transferred, sold or redeemed.",
    source: "contracts/src/ContributionRecord.sol",
    surface: "/contracts, /operator, /portfolio",
  },
  {
    key: "shares",
    name: "CorpusShares",
    address: at(C.corpusShares),
    does:
      "The corpus as shares. Only an operator admitted with a passkey can hold one; each paid run issues its share by score, " +
      "and dividends from corpus sales pay whoever held at a record date fixed in advance.",
    source: "contracts/src/CorpusShares.sol",
    surface: "/corpus-token, /station",
  },
  {
    key: "sales",
    name: "SalesLog",
    address: at(C.salesLog),
    does: "Every corpus sale to an agent, with the sha256 of the bytes served, so a buyer can check its copy on chain.",
    source: "contracts/src/SalesLog.sol",
    surface: "/agents, /api/agent/sales",
    monad:
      "Kept in storage as well as emitted: Monad's public endpoints answer a log query only a hundred blocks wide, " +
      "so a log that lived only in events could not be read back.",
  },
  {
    key: "referrals",
    name: "Referrals",
    address: at(C.referrals),
    does: "Pays MON for bringing someone who then does the work, not for signing up.",
    source: "contracts/src/Referrals.sol",
    surface: "/portfolio, /contracts",
  },
  {
    key: "prize",
    name: "PrizePool",
    address: at(C.prizePool),
    does: "A funded pot for task 1. Contributors enter themselves and it splits by work the protocol recorded.",
    source: "contracts/src/PrizePool.sol",
    surface: "/contracts",
  },
  {
    key: "foundry",
    name: "Foundry",
    address: at(C.foundry),
    does: "A MON treasury the protocol's contributors vote to spend on new tasks, weighted by work recorded.",
    source: "contracts/src/Foundry.sol",
    surface: "/foundry, /contracts",
  },
  {
    key: "confidential",
    name: "ConfidentialPayouts",
    address: at(C.confidentialPayouts),
    does: "ElGamal on secp256k1. Earnings add up on chain without the chain holding the number.",
    source: "contracts/src/ConfidentialPayouts.sol",
    surface: "/contracts",
  },
  {
    key: "corpusAccess",
    name: "CorpusAccess",
    address: at(C.corpusAccess),
    does: "Time-boxed read access to the corpus, paid in MON by the day. Sells time, not rights.",
    source: "contracts/src/CorpusAccess.sol",
    surface: "/corpus, /api/dataset",
  },
  {
    key: "corpusManifest",
    name: "CorpusManifest",
    address: at(C.corpusManifest),
    does: "The published shape of the corpus a licence buys.",
    source: "contracts/src/CorpusManifest.sol",
    surface: "/corpus",
  },
  {
    key: "passkey",
    name: "PasskeyRegistry",
    address: at(C.passkeyRegistry),
    does: "Binds a secp256r1 public key to an address and verifies signatures through the P-256 precompile at 0x0100.",
    source: "contracts/src/PasskeyRegistry.sol",
    surface: "/passkey",
    monad: "Monad's P-256 precompile (EIP-7951) at 0x0100 checks a browser passkey's signature on chain.",
  },
];

/**
 * The entries that have an address yet. Before the deploy every address is
 * empty; a page that lists contracts lists these, and a component that reads
 * one contract finds it in DEPLOYED and waits for its address.
 */
export const LIVE_CONTRACTS: Deployed[] = DEPLOYED.filter((d) => /^0x[0-9a-fA-F]{40}$/.test(d.address));

/** Deployments this protocol ran on before, kept so their runs stay explicable. */
export const SUPERSEDED: Deployed[] = [
  {
    key: "shares-v1",
    name: "CorpusShares, first deployment",
    address: "0xd19688FafB863238D9BAf880f71A2A9b968DfCcd",
    does:
      "Replaced the same day. A dividend declared while no share existed could never be paid or returned, " +
      "and 0.01 MON declared that way during testing is still in it. The current CorpusShares can reclaim one.",
    source: "contracts/src/CorpusShares.sol",
    surface: "/contracts only",
  },
  {
    key: "axon-blitz",
    name: "AxonProtocol v1 on Monad Testnet",
    address: "0x89384f46e430F37DB61Afb98810eba995C0d6Ed4",
    does: "The Monad Blitz Hyderabad deployment. Its runs are real, paid in MON, and verifiable on Monadscan.",
    source: "contracts/src/AxonProtocol.sol",
    surface: "/archive",
  },
  {
    key: "axon-fuji",
    chainId: 43113,
    name: "AxonProtocolV2 on Avalanche Fuji",
    address: "0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0",
    does: "Where the product was built out between Blitz and the move back. Its runs are real, paid in AVAX, and verifiable on Snowtrace.",
    source: "contracts/src/AxonProtocolV2.sol",
    surface: "/archive",
  },
];
