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
  /** Set when the contract is a deliberate use of something Avalanche-specific. */
  avalanche?: string;
};

export const DEPLOYED: Deployed[] = [
  {
    key: "axon",
    name: "AxonProtocolV2",
    address: "0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0",
    does:
      "Tasks, escrow, trajectories, policies and cap tables. Records a run and pays for it in one call. " +
      "submitTrajectoryFor is permissionless: anyone may pay the gas for someone else's run, because the " +
      "verifier signature binds the task, the contributor, the hash and the score, so relaying moves who " +
      "pays and forges nothing. No relayer service is running — the path exists on chain and nothing calls it.",
    source: "contracts/src/AxonProtocolV2.sol",
    surface: "/hub, /station, /task, /run, /leaderboard, /portfolio",
  },
  {
    key: "certificate",
    name: "TrajectoryCertificate",
    address: "0x7a060129A3730852A606Bbe985207952AC25c4f6",
    does: "Soulbound token naming a run's recorder. Conveys no rights over the data.",
    source: "contracts/src/TrajectoryCertificate.sol",
    surface: "/contracts, /run",
  },
  {
    key: "contribution",
    name: "ContributionRecord",
    address: "0xa3b2dd739be34D13ca51a92ADDD0Ce2022E23247",
    does: "A running total of work recorded, in a shape wallets already read. Cannot be transferred, sold or redeemed.",
    source: "contracts/src/ContributionRecord.sol",
    surface: "/contracts",
  },
  {
    key: "referrals",
    name: "Referrals",
    address: "0x50414b04e39434Fc66527Fc7c816d835C766AC32",
    does: "Pays for bringing someone who then does the work, not for signing up.",
    source: "contracts/src/Referrals.sol",
    surface: "/contracts",
  },
  {
    key: "prize",
    name: "PrizePool",
    address: "0x42912F9a437C8EcF2a90Cb18F49D8a54DDe3F84f",
    does: "A funded pot for one task. Contributors enter themselves and it splits by work the protocol recorded.",
    source: "contracts/src/PrizePool.sol",
    surface: "/contracts",
  },
  {
    key: "foundry",
    name: "Foundry",
    address: "0xFf4007B14d3bb18a409EF9eF1ac6DD21e601783E",
    does: "A treasury the protocol's contributors vote to spend on new tasks, weighted by work recorded.",
    source: "contracts/src/Foundry.sol",
    surface: "/contracts",
  },
  {
    key: "confidential",
    name: "ConfidentialPayouts",
    address: "0x8CD8A9211CE32184a89F9ab9DC26224D08B775c2",
    does: "ElGamal on secp256k1. Earnings add up on chain without the chain holding the number.",
    source: "contracts/src/ConfidentialPayouts.sol",
    surface: "/contracts",
    avalanche: "Homomorphic addition on chain, the primitive behind Avalanche's encrypted ERC work.",
  },
  {
    key: "licence",
    name: "LicenceReceipt",
    address: "0xbA65eC5479C9E131d158Af1947452C989eF7D143",
    does: "Attests a policy as an Avalanche Warp message, signed by this subnet's validators.",
    source: "contracts/src/LicenceReceipt.sol",
    surface: "/contracts, /licence",
    avalanche: "Warp — validator-signed interchain attestation. There is no equivalent on a generic EVM chain.",
  },
  {
    key: "corpusAccess",
    name: "CorpusAccess",
    address: "0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165",
    does: "Time-boxed read access to the corpus. Sells time, not rights.",
    source: "contracts/src/CorpusAccess.sol",
    surface: "/api/dataset (402 gate)",
  },
  {
    key: "corpusManifest",
    name: "CorpusManifest",
    address: "0x318e5faf04c9db5d844aaa93850e71406012dd62",
    does: "The published shape of the corpus a licence buys.",
    source: "contracts/src/CorpusManifest.sol",
    surface: "/corpus",
  },
  {
    key: "passkey",
    name: "PasskeyRegistry",
    address: "0x82aE3011CE1dE3fce4fCf0F1A683b5d3826BCE9F",
    does: "Binds a secp256r1 public key to an address and verifies signatures through the P-256 precompile at 0x0100.",
    source: "contracts/src/PasskeyRegistry.sol",
    surface: "/passkey",
    avalanche: "RIP-7212 P-256 precompile, so a passkey's own curve is verified by the chain itself.",
  },
];

/** Superseded, and kept only so its runs stay explicable. */
export const SUPERSEDED: Deployed[] = [
  {
    key: "axon-v1",
    name: "AxonProtocol v1",
    address: "0x025dB4A545FDe9d5Ba61a03f2f7776187645F3b3",
    does:
      "The first deployment. Its runs are in the archive. It has a pull-payment claim(), " +
      "but claimable is zero for every address this deployment has ever paid or been funded by — " +
      "the balance it holds is unfilled task escrow, and refunds only arrived in V2, so it is stuck.",
    source: "contracts/src/AxonProtocol.sol",
    surface: "/archive",
  },
];
