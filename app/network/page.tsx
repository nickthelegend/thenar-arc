"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bytesToHex, concatHex, type Hex } from "viem";
import { ArcFinality } from "@/components/arc-finality";
import { Details } from "@/components/details";
import { DimRule } from "@/components/primitives";
import { HEARTBEAT_NAME, HEARTBEAT_RPC, rpcBatch } from "@/lib/arc-blocks";
import { ACTIVE_DEPLOYMENT, ARC_EXTERNAL, CHAIN_SHORT, LOCALNET, RPC_ENDPOINTS, USDC, addressUrl, appChain } from "@/lib/chain";
import { memoProbeCall, probeRevertProvesCallFrom } from "@/lib/memo";
import { cn } from "@/lib/cn";

/**
 * Arc, read live by this page.
 *
 * What a judge can check without trusting Thenar: Arc's finality tags, a P-256
 * signature made in this page and verified by Arc's precompile at 0x0100, the
 * Memo extension's CallFrom answering a probe, USDC as gas (the native balance
 * and the ERC-20 are one balance), the Circle and Chainlink contracts Thenar
 * calls, and Thenar's own. Every number is a request this page made, with the
 * time it was made. Nothing is sent and nothing is signed with a wallet.
 *
 * On a fork build, the network-level reads (finality, P-256, Memo) go to the
 * real Arc testnet; the contract reads go to the fork the app runs on.
 */

type Live<T> = { data: T | null; at: number | null; error: string | null; retryIn: number | null };

/** Poll `read` every `every` ms; back off (to 30 s) while a public RPC rate-limits. */
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
        delay = Math.min(30_000, Math.max(delay, every) * 2);
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

const NETWORK = HEARTBEAT_NAME ?? appChain.name;
const RPC_HOST = new URL(HEARTBEAT_RPC).host;
const APP_RPC = RPC_ENDPOINTS[0];
const APP_HOST = APP_RPC.startsWith("http") ? new URL(APP_RPC).host : APP_RPC;
const P256_VERIFY = "0x0000000000000000000000000000000000000100";

/** EIP-7951 / RIP-7212 input: hash ‖ r ‖ s ‖ qx ‖ qy, 160 bytes. */
function p256Input(hash: Uint8Array, signature: Uint8Array, publicKeyRaw: Uint8Array): Hex {
  return concatHex([bytesToHex(hash), bytesToHex(signature), bytesToHex(publicKeyRaw.slice(1))]);
}
/** The precompile answers 32 bytes ending in 1 for a valid signature, and nothing for an invalid one. */
const p256Valid = (result: unknown) => typeof result === "string" && /^0x0{63}1$/.test(result);

const EXTERNAL: { name: string; address: string; use: string }[] = [
  { name: "USDC (Circle)", address: ARC_EXTERNAL.usdc, use: "Escrow, payouts, licences, dividends, x402 payments, and gas: one token for everything (6-decimal ERC-20 view of the native balance)." },
  { name: "Memo extension", address: ARC_EXTERNAL.memo, use: "A browser submission is sent through it, tagged with the run id, when CallFrom answers (lib/submit.ts). Run on a fork; not part of earlier scripted proofs." },
  { name: "ERC-8004 Identity Registry", address: ARC_EXTERNAL.identityRegistry, use: "Where the verifier or a buyer is registered, it is recognised by its id. Current registration is available on the Arc stack page." },
  { name: "ERC-8004 Reputation Registry", address: ARC_EXTERNAL.reputationRegistry, use: "ThenarVerdicts writes each paid verdict here once the verifier is registered (run on a fork)." },
  { name: "CCTP TokenMessengerV2", address: ARC_EXTERNAL.tokenMessengerV2, use: "Operators can burn earnings here to mint USDC on another chain (/portfolio). Burn run on a fork; mint not run." },
  { name: "CCTP MessageTransmitterV2", address: ARC_EXTERNAL.messageTransmitterV2, use: "Receives the CCTP half of a cross-chain licence purchase (not run live)." },
  { name: "Gateway Wallet", address: ARC_EXTERNAL.gatewayWallet, use: "A sponsor's unified USDC balance, deposited on any chain (Gateway funding is off by default and not run)." },
  { name: "Gateway Minter", address: ARC_EXTERNAL.gatewayMinter, use: "Would mint that balance on Arc to fund a task (not run)." },
  { name: "Chainlink CCIP Router", address: ARC_EXTERNAL.ccipRouter, use: "Carries a licence order from Base or Ethereum to ThenarCcipReceiver (run in Chainlink Local and on a fork; no live send)." },
].filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.address));

const THENAR = Object.entries(ACTIVE_DEPLOYMENT.contracts).filter(([, a]) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a)) as [string, string][];

export default function NetworkPage() {
  // latest, safe and finalized in one batch, so all three come from the same node.
  const tags = useLive(useCallback(async (signal: AbortSignal) => {
    const r = await rpcBatch(HEARTBEAT_RPC, ["latest", "safe", "finalized"].map((t) => ({ method: "eth_getBlockByNumber", params: [t, false] })), signal);
    return r.map((x) => hexNum((x as { number?: string } | null)?.number));
  }, []), 2_000);

  // Memo's CallFrom: Arc runs it; a fork's node does not. The probe is the same one lib/submit.ts makes.
  const memo = useLive(useCallback(async (signal: AbortSignal) => {
    const c = memoProbeCall(USDC, ARC_EXTERNAL.memo);
    const r = await fetch(HEARTBEAT_RPC, {
      method: "POST", headers: { "content-type": "application/json" }, signal,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: c.from, to: c.to, data: c.data }, "latest"] }),
    });
    const b = (await r.json()) as { result?: string; error?: { message: string; data?: string } };
    return { live: probeRevertProvesCallFrom(b.error?.data), answer: b.error ? `reverted ${String(b.error.data ?? b.error.message).slice(0, 18)}…` : `returned ${String(b.result).slice(0, 18)}` };
  }, []), 60_000);

  // USDC is the gas: the native balance (18 decimals) and the ERC-20 (6) are one number.
  const gas = useLive(useCallback(async (signal: AbortSignal) => {
    const who = (THENAR.find(([k]) => k === "protocol")?.[1] ?? ARC_EXTERNAL.gatewayWallet) as string;
    const balanceOf = `0x70a08231${who.slice(2).toLowerCase().padStart(64, "0")}`;
    const [native, erc20, price] = await rpcBatch(APP_RPC, [
      { method: "eth_getBalance", params: [who, "latest"] },
      { method: "eth_call", params: [{ to: USDC, data: balanceOf }, "latest"] },
      { method: "eth_gasPrice", params: [] },
    ], signal);
    return { who, native: BigInt((native as string) ?? "0x0"), erc20: BigInt((erc20 as string) || "0x0"), price: BigInt((price as string) ?? "0x0") };
  }, []), 15_000);

  const code = useLive(useCallback(async (signal: AbortSignal) => {
    const bytes = (x: unknown) => (typeof x === "string" ? (x.length - 2) / 2 : -1);
    const [ext, own] = await Promise.all([
      rpcBatch(APP_RPC, EXTERNAL.map((c) => ({ method: "eth_getCode", params: [c.address, "latest"] })), signal),
      rpcBatch(APP_RPC, THENAR.map(([, a]) => ({ method: "eth_getCode", params: [a, "latest"] })), signal),
    ]);
    return {
      external: EXTERNAL.map((c, i) => ({ ...c, bytes: bytes(ext[i]) })),
      thenar: THENAR.map(([name, address], i) => ({ name, address, bytes: bytes(own[i]) })),
    };
  }, []), 60_000);

  // A P-256 key made in this page, its signature checked by Arc's precompile, and a tampered copy refused.
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
      const [good, wrong] = await rpcBatch(HEARTBEAT_RPC, [
        { method: "eth_call", params: [{ to: P256_VERIFY, data: p256Input(hash, sig, raw) }, "latest"] },
        { method: "eth_call", params: [{ to: P256_VERIFY, data: p256Input(bad, sig, raw) }, "latest"] },
      ]);
      const hex = Array.from(raw.slice(1, 9), (b) => b.toString(16).padStart(2, "0")).join("");
      setP256({ ok: p256Valid(good), tampered: p256Valid(wrong), at: Date.now(), error: null, key: `04${hex}…` });
    } catch (e) {
      setP256((p) => ({ ...p, error: e instanceof Error ? e.message : String(e) }));
    }
  }, []);
  useEffect(() => { const t = setTimeout(() => void runP256(), 0); return () => clearTimeout(t); }, [runP256]);

  const [latest, safe, finalized] = tags.data ?? [NaN, NaN, NaN];
  const g = gas.data;

  return (
    <div className="mx-auto max-w-[960px] px-5 py-10">
      <h1 className="heading-glow text-4xl font-medium tracking-tight sm:text-5xl">Arc, read live</h1>
      <p className="mt-4 max-w-[64ch] text-base text-scribe-2 [text-wrap:pretty]">
        {NETWORK}, read by this page as you watch.{LOCALNET ? ` This build's own transactions run on a local fork; finality, P-256 and Memo are read from the real ${NETWORK}.` : ""}
      </p>

      <ArcFinality className="mt-8" />

      <DimRule className="mt-10" note="Finality" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="latest, safe, finalized" testid="network-tags">
          <dl className="grid grid-cols-3 gap-2 font-mono">
            {([["latest", latest], ["safe", safe], ["finalized", finalized]] as const).map(([k, n]) => (
              <div key={k}>
                <dt className="font-sans text-xs text-scribe-3">{k}</dt>
                <dd className="text-base tabular-nums text-scribe">{Number.isNaN(n) ? "…" : n.toLocaleString("en-US")}</dd>
                <dd className="text-xs tabular-nums text-scribe-3">{Number.isNaN(n) || Number.isNaN(latest) ? "" : n >= latest ? "the head" : `head − ${latest - n}`}</dd>
              </div>
            ))}
          </dl>
          <Details className="mt-3">
            <p>
            Arc&rsquo;s consensus is deterministic: a block is final when it is produced, so all three tags name the head (a
            tag read a moment after the head can even be one ahead). On Ethereum <span className="font-mono">finalized</span> trails
            by two epochs, about 13 minutes. Thenar shows a run as paid when its receipt arrives, because on Arc that is final.
          </p>
          </Details>
          <Stamp s={tags} source={RPC_HOST} />
        </Card>

        <Card title="USDC is the gas" testid="network-gas">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><dt className="text-xs text-scribe-3">Native balance (18 dec)</dt><dd className="font-mono tabular-nums text-scribe">{g ? fmt(g.native, 18) : "…"}</dd></div>
            <div><dt className="text-xs text-scribe-3">USDC.balanceOf (6 dec)</dt><dd className="font-mono tabular-nums text-scribe">{g ? fmt(g.erc20, 6) : "…"}</dd></div>
            <div><dt className="text-xs text-scribe-3">Same dollars</dt><dd className={cn("font-mono tabular-nums", g ? (g.native / 10n ** 12n === g.erc20 ? "text-go" : "text-reject") : "text-scribe-3")}>{g ? (g.native / 10n ** 12n === g.erc20 ? "yes" : "no") : "…"}</dd></div>
            <div><dt className="text-xs text-scribe-3">Gas price</dt><dd className="font-mono tabular-nums text-scribe">{g ? `${(Number(g.price) / 1e9).toFixed(2)} gwei of USDC` : "…"}</dd></div>
          </dl>
          <Details className="mt-3">
            <p>
            Read for the {g?.who ? <a href={addressUrl(g.who)} className="font-mono text-signal hover:text-signal-hi">{short(g.who)}</a> : "protocol"}{" "}
            on {CHAIN_SHORT}. Arc&rsquo;s native balance is USDC and the ERC-20 at <span className="font-mono">0x3600…0000</span> is a
            view of it, so an operator&rsquo;s earnings pay their gas. Arc charges the gas a transaction uses; every Thenar write sends
            the node&rsquo;s estimate plus a fifth as its limit (lib/arc-gas.ts).
          </p>
          </Details>
          <Stamp s={gas} source={APP_HOST} />
        </Card>
      </div>

      <DimRule className="mt-10" note="Precompiles and extensions" />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="P-256 (precompile 0x0100)" testid="network-p256">
          <Details className="mt-3">
            <p>
            A key made in this page just now, a signature from it, and Arc&rsquo;s precompile asked to check it. Passkeys sign
            with this curve, which is how PasskeyRegistry checks an operator&rsquo;s passkey on chain.
          </p>
          </Details>
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

        <Card title="Memo (CallFrom)" testid="network-memo">
          <Details className="mt-3">
            <p>
            Arc&rsquo;s Memo extension calls a contract as the transaction&rsquo;s own sender and logs a tag with it. Thenar submits
            every run through it, tagged with the run id, so a payout says what it paid for. The probe wraps a USDC transfer
            that must fail as a dead address; only a node running CallFrom returns that failure wrapped in Memo&rsquo;s
            <span className="font-mono"> CallFailed</span>.
          </p>
          </Details>
          <p className="mt-3 font-mono text-xs">
            CallFrom: <span className={memo.data ? (memo.data.live ? "text-go" : "text-reject") : "text-scribe-3"}>{memo.data ? (memo.data.live ? "live" : "not live") : "…"}</span>
            {memo.data ? <span className="text-scribe-3"> · {memo.data.answer}</span> : null}
          </p>
          <Stamp s={memo} source={RPC_HOST} />
        </Card>
      </div>

      <DimRule className="mt-10" note="Circle and Chainlink on Arc" />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10" data-testid="network-canonical">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="text-xs text-scribe-3"><th className="px-4 py-2 font-normal">Contract</th><th className="px-4 py-2 font-normal">Code</th><th className="px-4 py-2 font-normal">What Thenar does with it</th></tr></thead>
          <tbody>
            {(code.data?.external ?? EXTERNAL.map((c) => ({ ...c, bytes: null as number | null }))).map((c) => (
              <tr key={c.address} className="border-t border-white/10 align-top">
                <td className="px-4 py-2">
                  <span className="text-scribe">{c.name}</span><br />
                  <a href={addressUrl(c.address)} target={LOCALNET ? undefined : "_blank"} rel="noreferrer" className="font-mono text-xs text-signal hover:text-signal-hi">{short(c.address)} &rarr;</a>
                </td>
                <td className={cn("px-4 py-2 font-mono text-xs", c.bytes && c.bytes > 0 ? "text-go" : "text-scribe-3")}>{c.bytes === null ? "…" : c.bytes > 0 ? `${c.bytes.toLocaleString("en-US")} bytes` : "none"}</td>
                <td className="px-4 py-2 text-scribe-2">{c.use}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Stamp s={code} source={APP_HOST} />

      <DimRule className="mt-10" note={`Thenar on ${CHAIN_SHORT}`} />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10" data-testid="network-thenar">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead><tr className="text-xs text-scribe-3"><th className="px-4 py-2 font-normal">Contract</th><th className="px-4 py-2 font-normal">Code</th></tr></thead>
          <tbody>
            {(code.data?.thenar ?? []).map((c) => (
              <tr key={c.address} className="border-t border-white/10">
                <td className="px-4 py-2"><span className="text-scribe">{c.name}</span> <a href={addressUrl(c.address)} target={LOCALNET ? undefined : "_blank"} rel="noreferrer" className="font-mono text-xs text-signal hover:text-signal-hi">{short(c.address)} &rarr;</a></td>
                <td className={cn("px-4 py-2 font-mono text-xs", c.bytes > 0 ? "text-go" : "text-reject")}>{c.bytes > 0 ? `${c.bytes.toLocaleString("en-US")} bytes` : "none"}</td>
              </tr>
            ))}
            {!THENAR.length ? <tr><td className="px-4 py-3 text-scribe-3" colSpan={2}>Not deployed on this network yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-scribe-3">
        Arc&rsquo;s explorer is Blockscout; each address above links to it{LOCALNET ? " (on a fork, to this app's own explorer, which reads the node)" : ""}.
      </p>
    </div>
  );
}

/** A base-unit amount as dollars, to six places. */
function fmt(units: bigint, decimals: number) {
  const s = units.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).slice(0, 6);
  return `${Number(whole).toLocaleString("en-US")}.${frac}`;
}
