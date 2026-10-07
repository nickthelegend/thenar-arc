"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { MonadPipeline } from "@/components/monad-pipeline";
import { DimRule } from "@/components/primitives";
import { CANONICAL, MONAD_RPC, P256_VERIFY, STAKING, callData, commissionPct, decode, monadBatch, p256Input, p256Valid } from "@/lib/monad-network";
import { DIPPED_INTO_RESERVE, RESERVE_PRECOMPILE } from "@/lib/reserve";
import { DEPLOYMENT } from "@/lib/deployment";
import { LOCALNET, monadVisionAddress } from "@/lib/chain";
import { cn } from "@/lib/cn";

/**
 * Monad testnet, read live by this page.
 *
 * What a judge can check without trusting Thenar: the chain's own consensus
 * tags, its staking and reserve-balance precompiles, a P-256 signature made in
 * this page and verified by Monad's precompile, the shared contracts every
 * Monad app can use, Monad's x402 facilitator, and Thenar's own contracts on
 * Monad. Every number is a request this page (or, where a service refuses
 * browsers, this server) made, with the time it was made. Nothing is sent and
 * nothing is signed with a wallet.
 */

type Live<T> = { data: T | null; at: number | null; error: string | null; retryIn: number | null };

/** Poll `read` every `every` ms; back off (to 30 s) while Monad's public RPC rate-limits. */
function useLive<T>(read: (signal: AbortSignal) => Promise<T>, every: number): Live<T> {
  const [s, setS] = useState<Live<T>>({ data: null, at: null, error: null, retryIn: null });
  const readRef = useRef(read);
  useEffect(() => { readRef.current = read; }, [read]);
  useEffect(() => {
    let live = true;
    let t: ReturnType<typeof setTimeout>;
    let delay = every;
    const ctl = new AbortController();
    const tick = async () => {
      try {
        const data = await readRef.current(ctl.signal);
        delay = every;
        if (live) setS({ data, at: Date.now(), error: null, retryIn: null });
      } catch (e) {
        const limited = (e as { rateLimited?: boolean }).rateLimited;
        delay = limited ? Math.min(30_000, delay * 2) : Math.min(30_000, every * 2);
        if (live) setS((p) => ({ ...p, error: e instanceof Error ? e.message : String(e), retryIn: Math.round(delay / 1000) }));
      }
      if (live && document.visibilityState !== "hidden") t = setTimeout(tick, delay);
    };
    void tick();
    const again = () => { if (document.visibilityState === "visible") { clearTimeout(t); void tick(); } };
    document.addEventListener("visibilitychange", again);
    return () => { live = false; ctl.abort(); clearTimeout(t); document.removeEventListener("visibilitychange", again); };
  }, [every]);
  return s;
}

const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString("en-GB") : "…");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const hexNum = (h: unknown) => (typeof h === "string" ? Number.parseInt(h, 16) : NaN);

function Stamp({ s, source }: { s: Live<unknown>; source: string }) {
  return (
    <p className={cn("mt-2 font-mono text-xs", s.error ? "text-reject" : "text-scribe-3")}>
      {s.error ? `${s.error}${s.retryIn ? `; retrying in ${s.retryIn} s` : ""}` : `read at ${time(s.at)} from ${source}`}
    </p>
  );
}

function Card({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-ink-1 p-5" data-testid={testid}>
      <h2 className="text-lg font-medium text-scribe">{title}</h2>
      <div className="mt-3 text-sm leading-relaxed text-scribe-2">{children}</div>
    </section>
  );
}

const RPC_HOST = new URL(MONAD_RPC).host;

export default function NetworkPage() {
  // latest, safe and finalized in one batch: separate calls can land on different nodes behind the load balancer.
  const tags = useLive(useCallback(async (signal: AbortSignal) => {
    const r = await monadBatch(["latest", "safe", "finalized"].map((t) => ({ method: "eth_getBlockByNumber", params: [t, false] })), signal);
    return r.map((x) => hexNum((x.result as { number?: string } | null)?.number));
  }, []), 3_000);

  const staking = useLive(useCallback(async (signal: AbortSignal) => {
    const [e, p, reserve] = await monadBatch([
      { method: "eth_call", params: [{ to: STAKING, data: callData.getEpoch() }, "latest"] },
      { method: "eth_call", params: [{ to: STAKING, data: callData.getProposerValId() }, "latest"] },
      { method: "eth_call", params: [{ to: RESERVE_PRECOMPILE, data: DIPPED_INTO_RESERVE }, "latest"] },
    ], signal);
    const [epoch, inDelay] = decode.getEpoch(e.result as Hex);
    const proposer = decode.getProposerValId(p.result as Hex);
    const [v] = await monadBatch([{ method: "eth_call", params: [{ to: STAKING, data: callData.getValidator(proposer) }, "latest"] }], signal);
    const val = decode.getValidator(v.result as Hex);
    return {
      epoch, inDelay, proposer,
      auth: val[0], consensusStake: val[6], commission: commissionPct(val[4]),
      dipped: (reserve.result as string | undefined) ?? (reserve.error ? `error: ${reserve.error.message}` : "?"),
    };
  }, []), 10_000);

  const code = useLive(useCallback(async (signal: AbortSignal) => {
    const thenar = Object.entries(DEPLOYMENT.contracts).filter(([, a]) => /^0x[0-9a-fA-F]{40}$/.test(a)) as [string, string][];
    const all = [...CANONICAL.map((c) => c.address), ...thenar.map(([, a]) => a)];
    const r = await monadBatch(all.map((a) => ({ method: "eth_getCode", params: [a, "latest"] })), signal);
    const bytes = (x: { result?: unknown }) => (typeof x.result === "string" ? (x.result.length - 2) / 2 : -1);
    const [pool] = await monadBatch([{ method: "txpool_statusByAddress", params: [DEPLOYMENT.deployer] }], signal);
    return {
      canonical: CANONICAL.map((c, i) => ({ ...c, bytes: bytes(r[i]) })),
      thenar: thenar.map(([name, address], i) => ({ name, address, bytes: bytes(r[CANONICAL.length + i]) })),
      pool: pool.error ? `error: ${pool.error.message}` : JSON.stringify(pool.result),
    };
  }, []), 60_000);

  const offchain = useLive(useCallback(async (signal: AbortSignal) => {
    const r = await fetch("/api/network", { signal });
    if (!r.ok) throw new Error(`this server answered ${r.status}`);
    return (await r.json()) as {
      at: number;
      facilitator: { url: string; kinds?: { scheme: string; network: string }[]; error?: string };
      sourcify: { url: string; contracts?: { name: string; address: string; match: string | null }[]; error?: string };
    };
  }, []), 300_000);

  // A P-256 key made in this page, its signature checked by Monad's precompile, and a tampered copy refused.
  const [p256, setP256] = useState<{ ok: boolean | null; tampered: boolean | null; at: number | null; error: string | null; key: string | null }>({ ok: null, tampered: null, at: null, error: null, key: null });
  const runP256 = useCallback(async () => {
    setP256((p) => ({ ...p, ok: null, tampered: null, error: null }));
    try {
      const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const msg = crypto.getRandomValues(new Uint8Array(32));
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", msg));
      const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, msg));
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
      const bad = hash.slice(); bad[0] ^= 1;
      const [good, wrong] = await monadBatch([
        { method: "eth_call", params: [{ to: P256_VERIFY, data: p256Input(hash, sig, raw) }, "latest"] },
        { method: "eth_call", params: [{ to: P256_VERIFY, data: p256Input(bad, sig, raw) }, "latest"] },
      ]);
      const hex = Array.from(raw.slice(1, 9), (b) => b.toString(16).padStart(2, "0")).join("");
      setP256({ ok: p256Valid(good.result as Hex), tampered: p256Valid(wrong.result as Hex), at: Date.now(), error: null, key: `04${hex}…` });
    } catch (e) {
      setP256((p) => ({ ...p, error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);
  useEffect(() => { const t = setTimeout(() => void runP256(), 0); return () => clearTimeout(t); }, [runP256]);

  const [latest, safe, finalized] = tags.data ?? [NaN, NaN, NaN];
  const st = staking.data;
  const verified = offchain.data?.sourcify.contracts ?? [];

  return (
    <div className="mx-auto max-w-[960px] px-5 py-10">
      <h1 className="heading-glow text-4xl font-medium tracking-tight sm:text-5xl">Monad, read live</h1>
      <p className="mt-4 max-w-[64ch] text-base text-scribe-2 [text-wrap:pretty]">
        The parts of Monad Thenar is built on, read from Monad testnet by this page as you watch: its consensus, its
        precompiles, the shared contracts and Thenar&rsquo;s own. Nothing here is a figure we typed in.
        {LOCALNET ? " This build's own transactions run on a local chain; everything on this page is the real network." : ""}
      </p>

      <MonadPipeline className="mt-8" />

      <DimRule className="mt-10" note="Consensus" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="latest, safe, finalized" testid="network-tags">
          <dl className="grid grid-cols-3 gap-2 font-mono">
            {([["latest", latest, "Proposed"], ["safe", safe, "Voted"], ["finalized", finalized, "Finalized"]] as const).map(([k, n, s]) => (
              <div key={k}>
                <dt className="font-sans text-xs text-scribe-3">{k} · {s}</dt>
                <dd className="text-base tabular-nums text-scribe">{Number.isNaN(n) ? "…" : n.toLocaleString("en-US")}</dd>
                <dd className="text-xs tabular-nums text-scribe-3">{Number.isNaN(n) || Number.isNaN(latest) ? "" : n === latest ? "N" : `N−${latest - n}`}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3">
            On Monad a block is final two slots after it is proposed, so <span className="font-mono">finalized</span> trails
            the head by two blocks: about 600 ms. Thenar credits value only at that tag (lib/receipt-timers.ts). On Ethereum the
            same tag trails by two epochs, about 13 minutes.
          </p>
          <Stamp s={tags} source={RPC_HOST} />
        </Card>

        <Card title="Staking (precompile 0x1000)" testid="network-staking">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><dt className="text-xs text-scribe-3">Epoch</dt><dd className="font-mono text-base tabular-nums text-scribe">{st ? String(st.epoch) : "…"}{st?.inDelay ? <span className="ml-2 text-xs text-scribe-3">in its delay period</span> : null}</dd></div>
            <div><dt className="text-xs text-scribe-3">Proposing now</dt><dd className="font-mono text-base tabular-nums text-scribe">{st ? `validator ${st.proposer}` : "…"}</dd></div>
            <div><dt className="text-xs text-scribe-3">Its consensus stake</dt><dd className="font-mono tabular-nums text-scribe">{st ? `${(Number(st.consensusStake / 10n ** 15n) / 1000).toLocaleString("en-US")} MON` : "…"}</dd></div>
            <div><dt className="text-xs text-scribe-3">Its commission</dt><dd className="font-mono tabular-nums text-scribe">{st ? `${st.commission}%` : "…"}</dd></div>
          </dl>
          <p className="mt-3">
            Read with <span className="font-mono">getEpoch</span>, <span className="font-mono">getProposerValId</span> and{" "}
            <span className="font-mono">getValidator</span>. Thenar does not stake its escrow: a funder&rsquo;s MON has to be
            payable to an operator in the block a run is recorded, and staked MON takes an epoch to come back.
          </p>
          <Stamp s={staking} source={RPC_HOST} />
        </Card>
      </div>

      <DimRule className="mt-10" note="Precompiles" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="P-256 (precompile 0x0100)" testid="network-p256">
          <p>
            A key made in this page just now, a signature from it, and Monad&rsquo;s precompile asked to check it. Passkeys sign
            with this curve, which is how PasskeyRegistry checks an operator&rsquo;s passkey on chain.
          </p>
          <ul className="mt-3 flex flex-col gap-1 font-mono text-xs">
            <li>key <span className="text-scribe">{p256.key ?? "…"}</span></li>
            <li data-key="valid">signature: <span className={p256.ok ? "text-go" : p256.ok === false ? "text-reject" : "text-scribe-3"}>{p256.ok === null ? "checking…" : p256.ok ? "valid (the precompile returned 1)" : "refused"}</span></li>
            <li data-key="tampered">one bit changed: <span className={p256.tampered === false ? "text-go" : p256.tampered ? "text-reject" : "text-scribe-3"}>{p256.tampered === null ? "checking…" : p256.tampered ? "accepted (wrong)" : "refused (empty answer), as it should be"}</span></li>
          </ul>
          <button type="button" onClick={() => void runP256()} className="mt-3 rounded-lg border border-white/15 px-3 py-2 text-sm text-white transition-colors duration-500 hover:bg-white/5 active:scale-[0.98]">
            Make another key and check it
          </button>
          <p className={cn("mt-2 font-mono text-xs", p256.error ? "text-reject" : "text-scribe-3")}>{p256.error ?? `checked at ${time(p256.at)} on ${RPC_HOST}`}</p>
        </Card>

        <Card title="Reserve balance (precompile 0x1001)" testid="network-reserve">
          <p>
            Every account keeps 10 MON that a transaction&rsquo;s value cannot dig into, because consensus runs ahead of
            execution. A delegated (EIP-7702) account never gets the one-off exception. Thenar checks this before any write
            that moves MON, and refuses one Monad would revert (lib/reserve.ts). Sponsored writes move none of the
            operator&rsquo;s MON, so they never meet it.
          </p>
          <p className="mt-3 font-mono text-xs">
            dippedIntoReserve() as an eth_call: <span className="text-scribe">{st ? (st.dipped === "0x" + "0".repeat(64) ? "false" : st.dipped) : "…"}</span>
          </p>
          <Stamp s={staking} source={RPC_HOST} />
        </Card>
      </div>

      <DimRule className="mt-10" note="Gas" />
      <Card title="Charged on the limit" testid="network-gas">
        <p>
          Monad charges a transaction its whole gas limit, not the gas it uses, and a wallet whose estimate fails may fall back
          to a large default. So every Thenar write first has the node estimate it under Monad&rsquo;s own rules; one whose
          simulation reverts is not sent, and the rest go with the estimate plus a tenth as an explicit limit
          (lib/monad-gas.ts). The station&rsquo;s receipt shows the limit, the gas used and what was charged.
        </p>
      </Card>

      <DimRule className="mt-10" note="Shared contracts" />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10" data-testid="network-canonical">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="text-xs text-scribe-3"><th className="px-4 py-2 font-normal">Contract</th><th className="px-4 py-2 font-normal">Code</th><th className="px-4 py-2 font-normal">What Thenar does with it</th></tr></thead>
          <tbody>
            {(code.data?.canonical ?? CANONICAL.map((c) => ({ ...c, bytes: null as number | null }))).map((c) => (
              <tr key={c.address} className="border-t border-white/10 align-top">
                <td className="px-4 py-2">
                  <span className="text-scribe">{c.name}</span><br />
                  <a href={monadVisionAddress(c.address)} target="_blank" rel="noreferrer" className="font-mono text-xs text-signal hover:text-signal-hi">{short(c.address)} &rarr;</a>
                </td>
                <td className={cn("px-4 py-2 font-mono text-xs", c.bytes && c.bytes > 0 ? "text-go" : "text-scribe-3")}>{c.bytes === null ? "…" : c.bytes > 0 ? `${c.bytes.toLocaleString("en-US")} bytes` : "none"}</td>
                <td className="px-4 py-2 text-scribe-2">{c.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Stamp s={code} source={RPC_HOST} />

      <DimRule className="mt-10" note="Thenar on Monad testnet" />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10" data-testid="network-thenar">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="text-xs text-scribe-3"><th className="px-4 py-2 font-normal">Contract</th><th className="px-4 py-2 font-normal">Code</th><th className="px-4 py-2 font-normal">Sourcify</th></tr></thead>
          <tbody>
            {(code.data?.thenar ?? []).map((c) => {
              const v = verified.find((x) => x.address.toLowerCase() === c.address.toLowerCase());
              return (
                <tr key={c.address} className="border-t border-white/10">
                  <td className="px-4 py-2"><span className="text-scribe">{c.name}</span> <a href={monadVisionAddress(c.address)} target="_blank" rel="noreferrer" className="font-mono text-xs text-signal hover:text-signal-hi">{short(c.address)} &rarr;</a></td>
                  <td className={cn("px-4 py-2 font-mono text-xs", c.bytes > 0 ? "text-go" : "text-reject")}>{c.bytes > 0 ? `${c.bytes.toLocaleString("en-US")} bytes` : "none"}</td>
                  <td className="px-4 py-2 font-mono text-xs text-scribe-3">{!offchain.data ? "…" : v?.match ? <span className="text-go">{v.match}</span> : "not verified"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-scribe-3">
        The deployer&rsquo;s pool, from <span className="font-mono">txpool_statusByAddress</span>: <span className="font-mono">{code.data?.pool ?? "…"}</span>. Sourcify status read by this server from{" "}
        <span className="font-mono">{offchain.data?.sourcify.url.replace("https://", "") ?? "…"}</span>{offchain.data?.sourcify.error ? `: ${offchain.data.sourcify.error}` : ""}.
      </p>

      <DimRule className="mt-10" note="Payments" />
      <Card title="Monad's x402 facilitator" testid="network-facilitator">
        <p>
          Agents pay for a task&rsquo;s corpus over x402 in USDC. On Monad the payment settles through Monad&rsquo;s own
          facilitator{LOCALNET ? "; this local build uses a facilitator on this machine instead, since Monad's cannot see a local chain" : ""}. What it says it settles, asked just now by this server:
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
          {offchain.data?.facilitator.kinds?.map((k) => (
            <li key={`${k.scheme}-${k.network}`} className="rounded-full border border-white/10 px-2 py-1 text-scribe">{k.scheme} · {k.network}</li>
          )) ?? <li className="text-scribe-3">{offchain.data?.facilitator.error ?? "…"}</li>}
        </ul>
        <Stamp s={offchain} source={offchain.data?.facilitator.url.replace("https://", "") ?? "x402-facilitator.molandak.org"} />
      </Card>
    </div>
  );
}
