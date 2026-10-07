import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { DEPLOYMENT } from "@/lib/deployment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FACILITATOR = "https://x402-facilitator.molandak.org";
const SOURCIFY = "https://sourcify-api-monad.blockvision.org";

type Answer = {
  at: number;
  facilitator: { url: string; kinds: { scheme: string; network: string }[] } | { url: string; error: string };
  sourcify: { url: string; contracts: { name: string; address: string; match: string | null }[] } | { url: string; error: string };
};

let cached: Answer | null = null;

/**
 * Two reads about Monad that a browser cannot make itself, because neither
 * service allows cross-origin requests: what Monad's x402 facilitator says it
 * settles, and whether Thenar's Monad testnet contracts are verified on
 * Sourcify (which MonadVision shows). Read by this server, kept for five
 * minutes, and dated, so /network can say when.
 */
async function handleGET() {
  if (cached && Date.now() - cached.at < 5 * 60_000) return NextResponse.json(cached);
  const get = (u: string) => fetch(u, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });

  const facilitator: Answer["facilitator"] = await get(`${FACILITATOR}/supported`)
    .then(async (r) => {
      if (!r.ok) return { url: FACILITATOR, error: `answered ${r.status}` };
      const b = (await r.json()) as { kinds?: { scheme?: string; network?: string }[] };
      const kinds = (b.kinds ?? [])
        .filter((k) => k.network === "eip155:10143" || k.network === "eip155:143")
        .map((k) => ({ scheme: String(k.scheme), network: String(k.network) }));
      return { url: FACILITATOR, kinds };
    })
    .catch((e) => ({ url: FACILITATOR, error: e instanceof Error ? e.message : String(e) }));

  const entries = Object.entries(DEPLOYMENT.contracts).filter(([, a]) => /^0x[0-9a-fA-F]{40}$/.test(a));
  const sourcify: Answer["sourcify"] = await Promise.all(
    entries.map(async ([name, address]) => {
      const r = await get(`${SOURCIFY}/v2/contract/${DEPLOYMENT.chainId}/${address}`);
      if (!r.ok && r.status !== 404) throw new Error(`answered ${r.status}`);
      const b = r.ok ? ((await r.json()) as { match?: string | null }) : { match: null };
      return { name, address, match: b.match ?? null };
    }),
  )
    .then((contracts) => ({ url: SOURCIFY, contracts }))
    .catch((e) => ({ url: SOURCIFY, error: e instanceof Error ? e.message : String(e) }));

  cached = { at: Date.now(), facilitator, sourcify };
  return NextResponse.json(cached);
}

export const GET = logged("/api/network", handleGET);
