import "server-only";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
} from "viem";
import { hederaTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { ATS_ASSET_ABI } from "@/lib/ats-abi";
import { ATS, CORPUS_SECURITY, CORPUS_SECURITY_ID, SHARES_PER_RUN } from "@/lib/ats";
import { query, run } from "@/lib/server/sql";

/**
 * The corpus as a security, issued through Hedera's Asset Tokenization Studio.
 *
 * What Thenar sells is a task's recordings, so a share of the recordings is what
 * gets tokenised: an ATS equity whose holders are the people who drove the arm.
 * Three rules make a share mean that, and the security's own contracts enforce
 * all three rather than this server:
 *
 *  - It is a whitelist. Only an address on its control list can hold a share,
 *    and an address gets there only after a World ID proof that a live human
 *    stands behind it. A bot farm can record runs; it cannot own the corpus.
 *  - Shares are issued per accepted run, in proportion to the signed score.
 *  - A dividend declared from corpus sales pays whoever held at the record
 *    date, pro rata.
 */

const transport = http(ATS.rpc, { timeout: 60_000, retryCount: 2 });
export const hedera = createPublicClient({ chain: hederaTestnet, transport });

export class TokenError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

function security(): Address {
  if (!CORPUS_SECURITY) {
    throw new TokenError("The corpus security has not been issued yet. Run scripts/ats-deploy.mjs.", 503);
  }
  return CORPUS_SECURITY;
}

function makeSigner(key: string) {
  const hex = key.replace(/^0x/, "");
  // Hedera exports ECDSA keys DER-wrapped; the secp256k1 scalar is the last 32 bytes.
  const account = privateKeyToAccount(`0x${hex.length > 64 ? hex.slice(-64) : hex}`);
  return { account, wallet: createWalletClient({ account, chain: hederaTestnet, transport }) };
}

let signer: ReturnType<typeof makeSigner> | null = null;

function issuer() {
  const key = process.env.HEDERA_ATS_ISSUER_KEY;
  if (!key) throw new TokenError("HEDERA_ATS_ISSUER_KEY is not set, so this server cannot write to the security.", 503);
  signer ??= makeSigner(key);
  return signer;
}

/** The name of the rule that refused, which is the part anyone can act on. */
export function refusal(e: unknown): string | null {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) return r.data?.errorName ?? r.reason ?? "reverted";
  }
  return null;
}

export type TokenEventKind = "admit" | "issue" | "dividend";

export type TokenEvent = {
  tx: string;
  kind: TokenEventKind;
  account: string | null;
  amount: string | null;
  detail: string | null;
  created_at: number;
};

/** Wait for Hedera to settle a write, then keep a line that points at it on HashScan. */
async function settle(tx: Hash, kind: TokenEventKind, account: string | null, amount: string | null, detail: string) {
  const receipt = await hedera.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
  if (receipt.status !== "success") {
    throw new TokenError(`The ${kind} transaction reverted on Hedera (${tx}).`, 502);
  }
  await run(
    `INSERT INTO token_event (tx, kind, account, amount, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (tx) DO NOTHING`,
    [tx, kind, account?.toLowerCase() ?? null, amount, detail, Date.now()],
  );
}

/** Put a verified human on the security's whitelist. Idempotent. */
export async function admitHuman(address: Address, nullifier: string): Promise<{ tx: Hash | null; already: boolean }> {
  const token = security();
  const listed = await hedera.readContract({
    address: token, abi: ATS_ASSET_ABI, functionName: "isInControlList", args: [address],
  });
  if (listed) return { tx: null, already: true };

  const { account, wallet } = issuer();
  const { request } = await hedera.simulateContract({
    account, address: token, abi: ATS_ASSET_ABI, functionName: "addToControlList", args: [address],
  });
  const tx = await wallet.writeContract(request);
  await settle(tx, "admit", address, null, `World ID nullifier ${nullifier.slice(0, 16)}…`);
  return { tx, already: false };
}

/** Shares one accepted run earns: SHARES_PER_RUN at a perfect score, in proportion below it. */
export function sharesFor(score: number): bigint {
  return BigInt(Math.max(1, Math.round((SHARES_PER_RUN * score) / 10_000)));
}

/** Issue a run's shares to the human who drove it. */
export async function issueShares(address: Address, units: bigint, trajHash: string): Promise<Hash> {
  const token = security();
  const { account, wallet } = issuer();
  const { request } = await hedera.simulateContract({
    account, address: token, abi: ATS_ASSET_ABI, functionName: "issueByPartition",
    args: [{ partition: ATS.partition, tokenHolder: address, value: units, data: "0x" }],
  });
  const tx = await wallet.writeContract(request);
  await settle(tx, "issue", address, units.toString(), trajHash);
  return tx;
}

/**
 * Would the security accept shares for this address?
 *
 * Asked of the contract with a simulated issue, so nothing is sent and the
 * answer is the security's own rule, not a copy of it kept here.
 */
export async function complianceCheck(address: Address): Promise<{ allowed: boolean; rule: string | null }> {
  const token = security();
  const { account } = issuer();
  try {
    await hedera.simulateContract({
      account, address: token, abi: ATS_ASSET_ABI, functionName: "issueByPartition",
      args: [{ partition: ATS.partition, tokenHolder: address, value: BigInt(1), data: "0x" }],
    });
    return { allowed: true, rule: null };
  } catch (e) {
    const rule = refusal(e);
    if (!rule) throw e;
    return { allowed: false, rule };
  }
}

/**
 * Declare a dividend from corpus sales.
 *
 * The record date has to be in the future — the security snapshots holders
 * then — and the payment date after it.
 */
export async function declareDividend(args: {
  amount: bigint; decimals: number; recordDate: number; executionDate: number; note: string;
}): Promise<{ tx: Hash; dividendId: bigint }> {
  const token = security();
  const { account, wallet } = issuer();
  const { request, result } = await hedera.simulateContract({
    account, address: token, abi: ATS_ASSET_ABI, functionName: "setDividend",
    args: [{
      recordDate: BigInt(args.recordDate),
      executionDate: BigInt(args.executionDate),
      amount: args.amount,
      amountDecimals: args.decimals,
    }],
  });
  const tx = await wallet.writeContract(request);
  await settle(tx, "dividend", null, `${args.amount}e-${args.decimals}`, `dividend ${result} · ${args.note}`);
  return { tx, dividendId: result };
}

export type CorpusSecurity = {
  address: Address;
  id: string | null;
  name: string;
  symbol: string;
  isin: string;
  totalSupply: string;
  whitelist: { address: string; balance: string }[];
  whitelistCount: number;
  dividends: number;
  events: TokenEvent[];
};

/** Everything the corpus page shows, read from the security and not from a cache. */
export async function corpusSecurity(): Promise<CorpusSecurity | null> {
  if (!CORPUS_SECURITY) return null;
  const token = CORPUS_SECURITY;
  const [meta, supply, count, dividends, members] = await Promise.all([
    hedera.readContract({ address: token, abi: ATS_ASSET_ABI, functionName: "getERC20Metadata" }),
    hedera.readContract({ address: token, abi: ATS_ASSET_ABI, functionName: "totalSupply" }),
    hedera.readContract({ address: token, abi: ATS_ASSET_ABI, functionName: "getControlListCount" }),
    hedera.readContract({ address: token, abi: ATS_ASSET_ABI, functionName: "getDividendsCount" }),
    hedera.readContract({
      address: token, abi: ATS_ASSET_ABI, functionName: "getControlListMembers", args: [BigInt(0), BigInt(50)],
    }),
  ]);
  const balances = await Promise.all(
    members.map((m) => hedera.readContract({ address: token, abi: ATS_ASSET_ABI, functionName: "balanceOf", args: [m] })),
  );
  const events = await query<TokenEvent>(
    `SELECT tx, kind, account, amount, detail, created_at FROM token_event ORDER BY created_at DESC LIMIT 50`,
  );
  return {
    address: token,
    id: CORPUS_SECURITY_ID ?? null,
    name: meta.info.name,
    symbol: meta.info.symbol,
    isin: meta.info.isin,
    totalSupply: supply.toString(),
    whitelist: members.map((m, i) => ({ address: m, balance: balances[i].toString() })),
    whitelistCount: Number(count),
    dividends: Number(dividends),
    events: events.map((e) => ({ ...e, created_at: Number(e.created_at) })),
  };
}

/** One holder's side of it: on the list, how many shares, and what each dividend owes them. */
export async function holderView(address: Address) {
  const token = security();
  const [listed, balance, count] = await Promise.all([
    hedera.readContract({ address: token, abi: ATS_ASSET_ABI, functionName: "isInControlList", args: [address] }),
    hedera.readContract({ address: token, abi: ATS_ASSET_ABI, functionName: "balanceOf", args: [address] }),
    hedera.readContract({ address: token, abi: ATS_ASSET_ABI, functionName: "getDividendsCount" }),
  ]);
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const owed = await Promise.allSettled(
    ids.map((id) => hedera.readContract({
      address: token, abi: ATS_ASSET_ABI, functionName: "getDividendFor", args: [id, address],
    })),
  );
  return {
    listed,
    shares: balance.toString(),
    dividends: owed.flatMap((r, i) => r.status === "fulfilled"
      ? [{
          id: Number(ids[i]),
          tokenBalance: r.value.tokenBalance.toString(),
          amount: r.value.amount.toString(),
          amountDecimals: r.value.amountDecimals,
          recordDate: Number(r.value.recordDate),
          executionDate: Number(r.value.executionDate),
          recordDateReached: r.value.recordDateReached,
        }]
      : []),
  };
}
