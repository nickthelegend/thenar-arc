import "server-only";
import { decodeEventLog, decodeFunctionData, erc20Abi, parseAbi, type Abi, type Hex } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { PASSKEY_ABI } from "@/lib/passkey-abi";
import {
  CONTRIBUTION_RECORD_ABI, CORPUS_AUDIT_ABI, CORPUS_SHARES_ABI, SALES_LOG_ABI, THENAR_CCIP_RECEIVER_ABI,
  THENAR_VERDICTS_ABI, TRAJECTORY_CERTIFICATE_ABI,
} from "@/lib/registry-abi";
import { ACTIVE_DEPLOYMENT, ARC_EXTERNAL, USDC } from "@/lib/chain";
import { MEMO_ABI } from "@/lib/memo";
import { IDENTITY_REGISTRY_ABI, REPUTATION_REGISTRY_ABI } from "@/lib/erc8004";
import { GATEWAY_MINTER_ABI, GATEWAY_WALLET_ABI } from "@/lib/gateway";
import { TOKEN_MESSENGER_V2_ABI } from "@/lib/cctp";

/**
 * Naming what the Arc fork holds, for /explorer.
 *
 * Every contract Thenar deployed has its ABI in this repository, and so do
 * the Circle and ERC-8004 contracts it calls, so a transaction to one of them
 * decodes to its function and arguments and its logs to their events — what
 * Arc's Blockscout explorer shows for verified sources on testnet.
 */
const EIP3009 = parseAbi([
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)",
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
  "function receiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
]);

/** CorpusManifest has no generated ABI module; its three calls and one event are all /explorer needs. */
export const CORPUS_MANIFEST_ABI = parseAbi([
  "function commit(uint256 taskId, bytes32 root, uint32 episodes)",
  "function latest(uint256 taskId) view returns ((bytes32 root, uint32 episodes, uint64 at))",
  "function versions(uint256 taskId) view returns (uint256)",
  "function verifier() view returns (address)",
  "event Committed(uint256 indexed taskId, bytes32 indexed root, uint32 episodes, uint256 version)",
]);

const C = ACTIVE_DEPLOYMENT.contracts;
const X = ARC_EXTERNAL;
export const KNOWN: { name: string; address: string; abi: Abi }[] = [
  { name: "ThenarProtocol", address: C.protocol, abi: AXON_ABI as Abi },
  { name: "ThenarVerdicts", address: C.verdicts, abi: THENAR_VERDICTS_ABI as Abi },
  { name: "PasskeyRegistry", address: C.passkeyRegistry, abi: PASSKEY_ABI as Abi },
  { name: "TrajectoryCertificate", address: C.trajectoryCertificate, abi: TRAJECTORY_CERTIFICATE_ABI as Abi },
  { name: "ContributionRecord", address: C.contributionRecord, abi: CONTRIBUTION_RECORD_ABI as Abi },
  { name: "CorpusManifest", address: C.corpusManifest, abi: CORPUS_MANIFEST_ABI as Abi },
  { name: "CorpusShares", address: C.corpusShares, abi: CORPUS_SHARES_ABI as Abi },
  { name: "SalesLog", address: C.salesLog, abi: SALES_LOG_ABI as Abi },
  { name: "CorpusAudit", address: C.corpusAudit, abi: CORPUS_AUDIT_ABI as Abi },
  { name: "ThenarCcipReceiver", address: C.ccipReceiver, abi: THENAR_CCIP_RECEIVER_ABI as Abi },
  { name: "USDC", address: USDC, abi: [...erc20Abi, ...EIP3009] as Abi },
  { name: "Memo", address: X.memo, abi: MEMO_ABI as Abi },
  { name: "ERC-8004 IdentityRegistry", address: X.identityRegistry, abi: IDENTITY_REGISTRY_ABI as Abi },
  { name: "ERC-8004 ReputationRegistry", address: X.reputationRegistry, abi: REPUTATION_REGISTRY_ABI as Abi },
  { name: "CCTP TokenMessengerV2", address: X.tokenMessengerV2, abi: TOKEN_MESSENGER_V2_ABI as Abi },
  { name: "Gateway GatewayWallet", address: X.gatewayWallet, abi: GATEWAY_WALLET_ABI as Abi },
  { name: "Gateway GatewayMinter", address: X.gatewayMinter, abi: GATEWAY_MINTER_ABI as Abi },
  { name: "CCIP Router", address: X.ccipRouter, abi: [] as Abi },
].filter((k) => /^0x[0-9a-fA-F]{40}$/.test(k.address ?? ""));

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
