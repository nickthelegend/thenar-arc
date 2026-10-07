import "server-only";
import {
  BaseError,
  ContractFunctionRevertedError,
  type Address,
  type Hash,
} from "viem";
import { CORPUS_SHARES, addressUrl, isAddress } from "@/lib/chain";
import { CORPUS_SHARES_ABI } from "@/lib/registry-abi";
import { SHARES_PER_RUN } from "@/lib/corpus-shares";
import { IssuerUnavailable, issuerWallet, monad } from "@/lib/server/monad";
import { query, run } from "@/lib/server/sql";

/**
 * The corpus as shares, in CorpusShares on Monad.
 *
 * What Thenar sells is a task's recordings, so a share of the recordings is what
 * gets issued: a token whose holders are the people who drove the arm. Three
 * rules make a share mean that, and the contract enforces all three rather than
 * this server:
 *
 *  - It is a whitelist. Only an address on its control list can hold, send or
 *    receive a share, and an address gets there only after its owner signs in
 *    with a passkey that PasskeyRegistry verifies on Monad.
 *  - Shares are issued per accepted run, in proportion to the signed score,
 *    and each issue names the run's hash.
 *  - A dividend declared from corpus sales, escrowed in MON, pays whoever held
 *    at the record date, pro rata, and each holder claims their own.
 *
 * On Monad an admission and an issue each settle in under a second, so the
 * station can report the run's shares in the same panel as its payout rather
 * than promising them later.
 */

export class TokenError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
  }
}

function security(): Address {
  if (!isAddress(CORPUS_SHARES)) {
    throw new TokenError("CorpusShares is not deployed yet. Run contracts/script/DeployMonad.s.sol.", 503);
  }
  return CORPUS_SHARES;
}

function issuer() {
  try {
    return issuerWallet();
  } catch (e) {
    if (e instanceof IssuerUnavailable) throw new TokenError(e.message, 503);
    throw e;
  }
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

/** Wait for Monad to settle a write, then keep a line that points at it on Monadscan. */
async function settle(tx: Hash, kind: TokenEventKind, account: string | null, amount: string | null, detail: string) {
  const receipt = await monad.waitForTransactionReceipt({ hash: tx, timeout: 30_000 });
  if (receipt.status !== "success") {
    throw new TokenError(`The ${kind} transaction reverted on Monad (${tx}).`, 502);
  }
  await run(
    `INSERT INTO token_event (tx, kind, account, amount, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (tx) DO NOTHING`,
    [tx, kind, account?.toLowerCase() ?? null, amount, detail, Date.now()],
  );
}

/**
 * Put an operator on the security's whitelist. Idempotent.
 * `because` is what admitted them, written beside the transaction in the log.
 */
export async function admitOperator(address: Address, because: string): Promise<{ tx: Hash | null; already: boolean }> {
  const token = security();
  const listed = await monad.readContract({
    address: token, abi: CORPUS_SHARES_ABI, functionName: "isInControlList", args: [address],
  });
  if (listed) return { tx: null, already: true };

  const { account, wallet } = issuer();
  const { request } = await monad.simulateContract({
    account, address: token, abi: CORPUS_SHARES_ABI, functionName: "addToControlList", args: [address],
  });
  const tx = await wallet.writeContract(request);
  await settle(tx, "admit", address, null, because);
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
  const { request } = await monad.simulateContract({
    account, address: token, abi: CORPUS_SHARES_ABI, functionName: "issue",
    args: [address, units, trajHash as `0x${string}`],
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
    await monad.simulateContract({
      account, address: token, abi: CORPUS_SHARES_ABI, functionName: "issue",
      args: [address, BigInt(1), `0x${"00".repeat(32)}`],
    });
    return { allowed: true, rule: null };
  } catch (e) {
    const rule = refusal(e);
    if (!rule) throw e;
    return { allowed: false, rule };
  }
}

/**
 * Declare a dividend from corpus sales, escrowing `amountWei` of MON in the
 * contract.
 *
 * The record date has to be in the future — the contract snapshots holders
 * then — and payment opens at the execution date, when each holder claims.
 */
export async function declareDividend(args: {
  amountWei: bigint; recordDate: number; executionDate: number; note: string;
}): Promise<{ tx: Hash; dividendId: bigint }> {
  const token = security();
  const { account, wallet } = issuer();
  const { request, result } = await monad.simulateContract({
    account, address: token, abi: CORPUS_SHARES_ABI, functionName: "setDividend",
    args: [BigInt(args.recordDate), BigInt(args.executionDate)],
    value: args.amountWei,
  });
  const tx = await wallet.writeContract(request);
  await settle(tx, "dividend", null, `${args.amountWei}`, `dividend ${result} · ${args.note}`);
  return { tx, dividendId: result };
}

export type CorpusSecurity = {
  address: Address;
  url: string;
  issuer: string;
  name: string;
  symbol: string;
  totalSupply: string;
  whitelist: { address: string; balance: string }[];
  whitelistCount: number;
  dividends: number;
  events: TokenEvent[];
};

/** Everything the corpus page shows, read from the security and not from a cache. */
export async function corpusSecurity(): Promise<CorpusSecurity | null> {
  if (!isAddress(CORPUS_SHARES)) return null;
  const token = CORPUS_SHARES;
  const [name, symbol, issuerAddress, supply, count, dividends, members] = await Promise.all([
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "name" }),
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "symbol" }),
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "issuer" }),
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "totalSupply" }),
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "getControlListCount" }),
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "getDividendsCount" }),
    monad.readContract({
      address: token, abi: CORPUS_SHARES_ABI, functionName: "getControlListMembers", args: [BigInt(0), BigInt(50)],
    }),
  ]);
  const balances = await Promise.all(
    members.map((m) => monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "balanceOf", args: [m] })),
  );
  const events = await query<TokenEvent>(
    `SELECT tx, kind, account, amount, detail, created_at FROM token_event ORDER BY created_at DESC LIMIT 50`,
  );
  return {
    address: token,
    url: addressUrl(token),
    issuer: issuerAddress,
    name,
    symbol,
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
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "isInControlList", args: [address] }),
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "balanceOf", args: [address] }),
    monad.readContract({ address: token, abi: CORPUS_SHARES_ABI, functionName: "getDividendsCount" }),
  ]);
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const owed = await Promise.allSettled(
    ids.map((id) => monad.readContract({
      address: token, abi: CORPUS_SHARES_ABI, functionName: "getDividendFor", args: [id, address],
    })),
  );
  return {
    listed,
    shares: balance.toString(),
    dividends: owed.flatMap((r, i) => r.status === "fulfilled"
      ? [{
          id: Number(ids[i]),
          tokenBalance: r.value[0].toString(),
          amountWei: r.value[1].toString(),
          recordDate: Number(r.value[2]),
          executionDate: Number(r.value[3]),
          recordDateReached: r.value[4],
          claimed: r.value[5],
        }]
      : []),
  };
}
