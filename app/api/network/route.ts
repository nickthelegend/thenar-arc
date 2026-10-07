import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { logged } from "@/lib/server/log";
import { arc } from "@/lib/server/arc";
import { ACTIVE_DEPLOYMENT, ARC_NETWORK, LOCALNET, appChain, isAddress } from "@/lib/chain";
import { AGENT_CORPUS } from "@/lib/agent-corpus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Arc's Blockscout API (no key). */
const ARC_INDEX_API = `${appChain.blockExplorers.default.url}/api`;

/** Blocks the block time is measured over. Arc's timestamps are whole seconds, so it needs a span. */
const SPAN = BigInt(120);
/** A typical paid run (submitTrajectory incl. the ERC-8004 verdict write), for the cost line. */
const RUN_GAS = BigInt(450_000);

type Verification = { name: string; address: string; verified: boolean | null };

type Answer = {
  at: number;
  network: string;
  chainId: number;
  rpcChainId: number;
  latestBlock: string;
  blockTime: { seconds: number | null; over: number };
  finality: string;
  gas: { token: "USDC"; baseFeeGwei: string; runCostUsdc: string };
  x402: { network: string; asset: string; price: string; facilitator: "in-process" };
  explorer: { url: string; api: string | null; contracts: Verification[] | { error: string } | null };
};

let cached: Answer | null = null;
let verified: { at: number; value: Answer["explorer"]["contracts"] } | null = null;

/** Whether Arc's Blockscout has each Thenar contract's source verified. Read by the server: Blockscout sends no CORS headers. */
async function verification(): Promise<Answer["explorer"]["contracts"]> {
  if (LOCALNET) return null;
  if (verified && Date.now() - verified.at < 5 * 60_000) return verified.value;
  const entries = Object.entries(ACTIVE_DEPLOYMENT.contracts).filter(([, a]) => isAddress(a));
  const value = await Promise.all(
    entries.map(async ([name, address]): Promise<Verification> => {
      const u = `${ARC_INDEX_API}?module=contract&action=getsourcecode&address=${address}`;
      const r = await fetch(u, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`Arc's explorer answered ${r.status}`);
      const b = (await r.json().catch(() => null)) as { result?: { SourceCode?: string }[] } | null;
      if (!b) return { name, address, verified: null };
      return { name, address, verified: Boolean(b.result?.[0]?.SourceCode) };
    }),
  ).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  verified = { at: Date.now(), value };
  return value;
}

/**
 * Arc, measured rather than asserted.
 *
 * The block time is computed from the chain's own timestamps over the last
 * 120 blocks; finality is deterministic (a block is final when it is produced,
 * so there is no confirmation count to wait for); gas is USDC, priced from the
 * latest base fee. Cached for fifteen seconds and dated so /network can say when.
 */
async function handleGET() {
  if (cached && Date.now() - cached.at < 15_000) return NextResponse.json(cached);
  try {
    const [rpcChainId, latest] = await Promise.all([arc.getChainId(), arc.getBlock({ blockTag: "latest" })]);
    const back = latest.number > SPAN ? latest.number - SPAN : BigInt(0);
    const earlier = await arc.getBlock({ blockNumber: back });
    const blocks = Number(latest.number - earlier.number);
    const seconds = blocks > 0 ? Number(latest.timestamp - earlier.timestamp) / blocks : null;
    const baseFee = latest.baseFeePerGas ?? (await arc.getGasPrice());

    cached = {
      at: Date.now(),
      network: ARC_NETWORK,
      chainId: appChain.id,
      rpcChainId,
      latestBlock: latest.number.toString(),
      blockTime: { seconds: seconds === null ? null : Math.round(seconds * 1000) / 1000, over: blocks },
      finality: "deterministic, final on inclusion",
      gas: {
        token: "USDC",
        baseFeeGwei: formatUnits(baseFee, 9),
        // Native USDC has 18 decimals: gas × base fee is USDC once divided by 10^18.
        runCostUsdc: formatUnits(RUN_GAS * baseFee, 18),
      },
      x402: { network: AGENT_CORPUS.network, asset: AGENT_CORPUS.asset, price: AGENT_CORPUS.amount, facilitator: "in-process" },
      explorer: { url: appChain.blockExplorers.default.url, api: LOCALNET ? null : ARC_INDEX_API, contracts: await verification() },
    };
    return NextResponse.json(cached);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : "Arc's RPC did not answer" }, { status: 502 });
  }
}

export const GET = logged("/api/network", handleGET);
