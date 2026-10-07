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

import { ACTIVE_DEPLOYMENT as DEPLOYMENT, ARC_EXTERNAL, PRIOR_CONTRACTS } from "./chain";

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
  /** The chain the contract is on, when it is not the one this app settles on. */
  chainId?: number;
};

const C = DEPLOYMENT.contracts;
const at = (a: string | undefined) => (a ?? "") as `0x${string}`;

/**
 * Every Thenar contract on this Arc network, read from lib/deployment.ts (or
 * the fork's deployment in .env.fork).
 *
 * Everything that holds or moves money does it in Circle's USDC ERC-20
 * (6 decimals): a bounty's escrow, a payout, a licence fee, a dividend, an
 * agent's x402 payment. On Arc that is also the gas token, so an operator, a
 * sponsor and an agent each hold one currency.
 */
export const DEPLOYED: Deployed[] = [
  {
    key: "protocol",
    name: "ThenarProtocol",
    address: at(C.protocol),
    does:
      "Tasks, USDC escrow, trajectories, policies and licences. Records a run and pays for it in USDC in one call. " +
      "submitTrajectoryFor is permissionless: anyone may pay the gas for someone else's run, because the " +
      "verifier signature binds the task, the contributor, the hash and the score, so relaying moves who " +
      "pays and forges nothing. createTaskWithAuthorization funds a task from a sponsor's EIP-3009 signature.",
    source: "contracts/src/ThenarProtocol.sol",
    surface: "/hub, /station, /task, /run, /leaderboard, /portfolio, /post",
    arc:
      "Escrows Circle's native USDC at 0x3600…0000 and pulls a sponsor's funding with USDC's own " +
      "receiveWithAuthorization, so a task can be funded by a signature and relayed with gas paid in the same USDC.",
  },
  {
    key: "verdicts",
    name: "ThenarVerdicts",
    address: at(C.verdicts),
    does:
      "The verifier's public record: every paid run is written to Arc's ERC-8004 Reputation Registry against " +
      "the verifier's agent id (tag runVerdict, value = score, feedbackHash = the run id).",
    source: "contracts/src/ThenarVerdicts.sol",
    surface: "/agents, /contracts, /run",
    arc: "Writes to the ERC-8004 Identity and Reputation registries Circle deployed on Arc.",
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
      "and USDC dividends from corpus sales pay whoever held at a record date fixed in advance.",
    source: "contracts/src/CorpusShares.sol",
    surface: "/corpus-token, /station",
  },
  {
    key: "sales",
    name: "SalesLog",
    address: at(C.salesLog),
    does:
      "Every corpus sale: x402, licence or Gateway, with the sha256 of the bytes served and the buyer's ERC-8004 agent id, " +
      "so a buyer can check its copy on chain.",
    source: "contracts/src/SalesLog.sol",
    surface: "/agents, /api/agent/sales",
  },
  {
    key: "corpusManifest",
    name: "CorpusManifest",
    address: at(C.corpusManifest),
    does: "One Merkle root per task over every accepted episode, committed by the verifier, every version kept.",
    source: "contracts/src/CorpusManifest.sol",
    surface: "/corpus, /api/task/{id}/manifest",
  },
  {
    key: "corpusAudit",
    name: "CorpusAudit",
    address: at(C.corpusAudit),
    does:
      "What the audit keeper found when it rebuilt each task's root from the episodes this server serves and compared it " +
      "with CorpusManifest: matches, grown, short or altered.",
    source: "contracts/src/CorpusAudit.sol",
    surface: "/corpus, /api/task/{id}/manifest",
  },
  {
    key: "ccipReceiver",
    name: "ThenarCcipReceiver",
    address: at(C.ccipReceiver),
    does:
      "Corpus licences bought from Base or Ethereum: CCTP V2 burns the buyer's USDC to this contract, Chainlink CCIP carries " +
      "the order, and it licenses the policy on the buyer's behalf.",
    source: "contracts/src/ccip/ThenarCcipReceiver.sol",
    surface: "/buy, /contracts",
    arc: "Arc's CCIP lane and CCTP domain 26: the dollars and the message arrive separately and are matched here.",
  },
  {
    key: "passkey",
    name: "PasskeyRegistry",
    address: at(C.passkeyRegistry),
    does: "Binds a secp256r1 public key to an address and verifies signatures through the P-256 precompile at 0x0100.",
    source: "contracts/src/PasskeyRegistry.sol",
    surface: "/passkey",
    arc: "Arc's P-256 precompile (EIP-7951) at 0x0100 checks a browser passkey's signature on chain.",
  },
];

/**
 * The entries that have an address yet. Before the deploy every address is
 * empty; a page that lists contracts lists these, and a component that reads
 * one contract finds it in DEPLOYED and waits for its address.
 */
export const LIVE_CONTRACTS: Deployed[] = DEPLOYED.filter((d) => /^0x[0-9a-fA-F]{40}$/.test(d.address));

/** The Circle and Chainlink contracts on Arc that Thenar calls. Not Thenar's; listed so every address it touches is named. */
export const EXTERNAL_CONTRACTS: Deployed[] = [
  {
    key: "usdc", name: "USDC (Circle)", address: ARC_EXTERNAL.usdc,
    does: "Arc's native gas token, seen as an ERC-20 at 6 decimals. Every Thenar amount is in it; EIP-3009 lets a signature move it.",
    source: "Circle", surface: "everywhere",
  },
  {
    key: "memo", name: "Memo (Arc)", address: ARC_EXTERNAL.memo,
    does: "Calls a contract as the transaction's sender and logs a memo id with it, so a payout says which run it paid for.",
    source: "Arc", surface: "/station, /api/relay/create-task",
  },
  {
    key: "identityRegistry", name: "ERC-8004 IdentityRegistry", address: ARC_EXTERNAL.identityRegistry,
    does: "Agent identities. Thenar's verifier and buying agents are registered here.",
    source: "ERC-8004", surface: "/agents, /api/agents/verifier.json",
  },
  {
    key: "reputationRegistry", name: "ERC-8004 ReputationRegistry", address: ARC_EXTERNAL.reputationRegistry,
    does: "Feedback on agents: ThenarVerdicts writes run verdicts, buying agents rate the corpus they bought.",
    source: "ERC-8004", surface: "/agents",
  },
  {
    key: "tokenMessengerV2", name: "CCTP TokenMessengerV2", address: ARC_EXTERNAL.tokenMessengerV2,
    does: "Burns USDC on Arc to mint it on another chain: how an operator takes earnings to Base or Ethereum.",
    source: "Circle", surface: "/portfolio, scripts/cctp-withdraw.mjs",
  },
  {
    key: "messageTransmitterV2", name: "CCTP MessageTransmitterV2", address: ARC_EXTERNAL.messageTransmitterV2,
    does: "Mints USDC on Arc for a burn attested elsewhere: how a CCIP licence order's dollars arrive.",
    source: "Circle", surface: "/buy",
  },
  {
    key: "gatewayWallet", name: "Gateway GatewayWallet", address: ARC_EXTERNAL.gatewayWallet,
    does: "Holds a sponsor's unified USDC balance across chains.",
    source: "Circle", surface: "/post",
  },
  {
    key: "gatewayMinter", name: "Gateway GatewayMinter", address: ARC_EXTERNAL.gatewayMinter,
    does: "Mints a Gateway balance on Arc from Circle's attestation of a signed burn intent.",
    source: "Circle", surface: "/post, /api/gateway/mint",
  },
  {
    key: "ccipRouter", name: "CCIP Router (Chainlink)", address: ARC_EXTERNAL.ccipRouter,
    does: "Delivers cross-chain licence orders to ThenarCcipReceiver.",
    source: "Chainlink", surface: "/buy",
  },
].filter((d) => /^0x[0-9a-fA-F]{40}$/.test(d.address ?? ""));

/** Deployments this protocol ran on before, kept so their runs stay explicable. */
export const SUPERSEDED: Deployed[] = PRIOR_CONTRACTS.map((p) => ({
  key: `prior-${p.address.slice(2, 8).toLowerCase()}`,
  chainId: p.chainId,
  name: p.label,
  address: p.address as `0x${string}`,
  does: p.why,
  source: "contracts/src/AxonProtocolV2.sol (ETHOnline build)",
  surface: "/archive",
}));
