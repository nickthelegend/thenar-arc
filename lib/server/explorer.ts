import "server-only";
import { decodeEventLog, decodeFunctionData, erc20Abi, parseAbi, type Abi, type Hex } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { PASSKEY_ABI } from "@/lib/passkey-abi";
import {
  CONFIDENTIAL_PAYOUTS_ABI, CONTRIBUTION_RECORD_ABI, CORPUS_ACCESS_ABI, CORPUS_SHARES_ABI, FOUNDRY_ABI,
  PRIZE_POOL_ABI, REFERRALS_ABI, SALES_LOG_ABI, TRAJECTORY_CERTIFICATE_ABI,
} from "@/lib/registry-abi";
import { ACTIVE_DEPLOYMENT, USDC } from "@/lib/chain";

/**
 * Naming what the local chain holds, for /explorer.
 *
 * Every contract the deploy made has its ABI in this repository, so a
 * transaction to one of them decodes to its function and arguments and its
 * logs to their events, which is what a block explorer's verified-source view
 * gives on Monad.
 */
const EIP3009 = parseAbi([
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)",
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
  "function mint(address to,uint256 value)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
]);

const C = ACTIVE_DEPLOYMENT.contracts;
export const KNOWN: { name: string; address: string; abi: Abi }[] = [
  { name: "AxonProtocolV2", address: C.axon, abi: AXON_ABI as Abi },
  { name: "PasskeyRegistry", address: C.passkeyRegistry, abi: PASSKEY_ABI as Abi },
  { name: "TrajectoryCertificate", address: C.trajectoryCertificate, abi: TRAJECTORY_CERTIFICATE_ABI as Abi },
  { name: "ContributionRecord", address: C.contributionRecord, abi: CONTRIBUTION_RECORD_ABI as Abi },
  { name: "CorpusAccess", address: C.corpusAccess, abi: CORPUS_ACCESS_ABI as Abi },
  { name: "CorpusShares", address: C.corpusShares, abi: CORPUS_SHARES_ABI as Abi },
  { name: "SalesLog", address: C.salesLog, abi: SALES_LOG_ABI as Abi },
  { name: "Referrals", address: C.referrals, abi: REFERRALS_ABI as Abi },
  { name: "Foundry", address: C.foundry, abi: FOUNDRY_ABI as Abi },
  { name: "PrizePool", address: C.prizePool, abi: PRIZE_POOL_ABI as Abi },
  { name: "ConfidentialPayouts", address: C.confidentialPayouts, abi: CONFIDENTIAL_PAYOUTS_ABI as Abi },
  { name: "USDC", address: USDC, abi: [...erc20Abi, ...EIP3009] as Abi },
].filter((k) => k.address);

export const known = (a?: string | null) => (a ? KNOWN.find((k) => k.address.toLowerCase() === a.toLowerCase()) : undefined);

const show = (v: unknown): string =>
  typeof v === "bigint" ? v.toString()
    : Array.isArray(v) ? `[${v.map(show).join(", ")}]`
      : v && typeof v === "object" ? `{${Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join(", ")}}`
        : String(v);

export function decodeCall(to: string | null, input: Hex) {
  const k = known(to);
  if (!k || input === "0x") return null;
  try {
    const d = decodeFunctionData({ abi: k.abi, data: input });
    return { contract: k.name, fn: d.functionName, args: (d.args ?? []).map(show) };
  } catch {
    return { contract: k.name, fn: input.slice(0, 10), args: [] };
  }
}

export function decodeLog(address: string, data: Hex, topics: Hex[]) {
  const k = known(address);
  if (!k) return { contract: null, event: topics[0]?.slice(0, 10) ?? "anonymous", args: {} as Record<string, string> };
  try {
    const d = decodeEventLog({ abi: k.abi, data, topics: topics as [Hex, ...Hex[]] });
    const args = Object.fromEntries(Object.entries((d.args ?? {}) as Record<string, unknown>).map(([n, v]) => [n, show(v)]));
    return { contract: k.name, event: d.eventName ?? "event", args };
  } catch {
    return { contract: k.name, event: topics[0]?.slice(0, 10) ?? "anonymous", args: {} as Record<string, string> };
  }
}
