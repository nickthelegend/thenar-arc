import "server-only";
import { getAddress, isAddress as isAddr, zeroAddress, type Address } from "viem";
import { ARC_EXTERNAL, AXON_ADDRESS, VERDICTS_ADDRESS, isAddress } from "@/lib/chain";
import { AXON_ABI } from "@/lib/abi";
import { THENAR_VERDICTS_ABI } from "@/lib/registry-abi";
import { IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI, TAG_CORPUS_QUALITY, TAG_VERDICT, summaryNumber } from "@/lib/erc8004";
import { arc } from "@/lib/server/arc";

/**
 * ERC-8004 on Arc, read from the server: who an agent is, and what has been
 * said about Thenar's verifier.
 */

const IDENTITY = ARC_EXTERNAL.identityRegistry;
const REPUTATION = ARC_EXTERNAL.reputationRegistry;

/** An agent id from a header or query: a non-negative integer, or null. */
export function parseAgentId(raw: string | null | undefined): bigint | null {
  if (!raw || !/^\d{1,30}$/.test(raw.trim())) return null;
  return BigInt(raw.trim());
}

/**
 * Whether `who` speaks for agent `agentId`: it is the agent's verified wallet
 * (`getAgentWallet`) or, failing that, its owner (`ownerOf`). False for an
 * agent that does not exist or a registry that cannot be read.
 */
export async function controlsAgent(agentId: bigint, who: string): Promise<boolean> {
  if (!isAddress(IDENTITY) || !isAddr(who)) return false;
  const me = getAddress(who);
  const [wallet, owner] = await Promise.all([
    arc.readContract({ address: IDENTITY, abi: IDENTITY_REGISTRY_ABI, functionName: "getAgentWallet", args: [agentId] }).catch(() => zeroAddress),
    arc.readContract({ address: IDENTITY, abi: IDENTITY_REGISTRY_ABI, functionName: "ownerOf", args: [agentId] }).catch(() => zeroAddress),
  ]);
  return [wallet, owner].some((a) => a !== zeroAddress && getAddress(a) === me);
}

export type Summary = { count: number; average: number | null };

/** getSummary needs at least one client address; an agent nobody has rated has a count of zero. */
async function summary(agentId: bigint, clients: readonly Address[], tag: string): Promise<Summary> {
  if (!clients.length) return { count: 0, average: null };
  const [count, value, decimals] = await arc.readContract({
    address: REPUTATION, abi: REPUTATION_REGISTRY_ABI, functionName: "getSummary", args: [agentId, [...clients], tag, ""],
  });
  return { count: Number(count), average: count > BigInt(0) ? summaryNumber(value, decimals) : null };
}

export type VerifierStatus = {
  address: string | null;
  agentId: string | null;
  bound: boolean;
  verdicts: number;
  written: number;
  /** Mean verdict across every paid run, 0–100 (ThenarVerdicts keeps 0–10000). */
  meanScore: number;
  reputation: { runVerdict: Summary; corpusQuality: Summary };
};

/** The verifier as an ERC-8004 agent: bound to ThenarVerdicts or not, and its record in the Reputation Registry. */
export async function verifierStatus(): Promise<VerifierStatus> {
  const empty: VerifierStatus = {
    address: null, agentId: null, bound: false, verdicts: 0, written: 0, meanScore: 0,
    reputation: { runVerdict: { count: 0, average: null }, corpusQuality: { count: 0, average: null } },
  };
  if (!isAddress(VERDICTS_ADDRESS)) {
    const id = process.env.VERIFIER_AGENT_ID?.trim();
    return { ...empty, agentId: id && /^\d+$/.test(id) ? id : null };
  }
  const [address, [bound, agentId], verdicts, written, mean] = await Promise.all([
    isAddress(AXON_ADDRESS)
      ? arc.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "verifier" }).catch(() => null)
      : Promise.resolve(null),
    arc.readContract({ address: VERDICTS_ADDRESS, abi: THENAR_VERDICTS_ABI, functionName: "verifierAgent" }),
    arc.readContract({ address: VERDICTS_ADDRESS, abi: THENAR_VERDICTS_ABI, functionName: "verdicts" }),
    arc.readContract({ address: VERDICTS_ADDRESS, abi: THENAR_VERDICTS_ABI, functionName: "written" }),
    arc.readContract({ address: VERDICTS_ADDRESS, abi: THENAR_VERDICTS_ABI, functionName: "meanScore" }),
  ]);
  const envId = process.env.VERIFIER_AGENT_ID?.trim();
  const id = bound ? (agentId as bigint) : envId && /^\d+$/.test(envId) ? BigInt(envId) : null;

  let reputation = empty.reputation;
  if (id !== null && isAddress(REPUTATION)) {
    const clients = (await arc
      .readContract({ address: REPUTATION, abi: REPUTATION_REGISTRY_ABI, functionName: "getClients", args: [id] })
      .catch(() => [] as readonly Address[])) as readonly Address[];
    const verdictsClient = clients.filter((c) => c.toLowerCase() === VERDICTS_ADDRESS.toLowerCase());
    const [runVerdict, corpusQuality] = await Promise.all([
      summary(id, verdictsClient, TAG_VERDICT).catch(() => ({ count: 0, average: null })),
      summary(id, clients, TAG_CORPUS_QUALITY).catch(() => ({ count: 0, average: null })),
    ]);
    reputation = { runVerdict, corpusQuality };
  }

  return {
    address: (address as string | null) ?? process.env.VERIFIER_ADDRESS ?? null,
    agentId: id === null ? null : id.toString(),
    bound: Boolean(bound),
    verdicts: Number(verdicts),
    written: Number(written),
    meanScore: Number(mean) / 100,
    reputation,
  };
}
