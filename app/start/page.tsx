"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "@/components/session";
import { useTaskCatalogue } from "@/components/tasks-provider";
import { useGasSponsored } from "@/lib/contract-write";
import { STATION_SEEN } from "@/lib/first-run";
import { CURRENCY, FAUCET_URL, LOCALNET, LOW_GAS_BALANCE, PASSKEY_ADDRESS, appChain } from "@/lib/chain";
import { fmtMon, shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * From nothing to a paid run, one step at a time.
 *
 * Earning on Thenar takes five things in order: a wallet, gas (or a sponsor),
 * a passkey on chain, a feel for the station, and a run that clears the
 * floor. Each lived on its own page and nothing said which came next, so a
 * first visit was a scavenger hunt.
 *
 * Every step's state is read, never remembered on the server's say-so:
 * - the wallet and balance from the session;
 * - the passkey from PasskeyRegistry on chain, through /api/operator;
 * - having driven a station from this browser's own flag;
 * - the paid run from the ledger, which re-hashes against the chain.
 * Only the first step not yet done offers its action, so there is one thing
 * to do at a time.
 */

type Operator = { passkey: boolean; operator: boolean } | { error: string };
/** /api/feed?contributor= lists only runs that settled on chain: every one was paid. */
type Run = { traj_hash: string; score: number; task_id: number; tx_hash: string | null };

const noop = () => () => {};
const seenStation = () => {
  try { return localStorage.getItem(STATION_SEEN) === "1"; } catch { return false; }
};

type Step = {
  key: string;
  title: string;
  state: "done" | "todo" | "checking";
  detail: React.ReactNode;
  action?: React.ReactNode;
};

export default function StartPage() {
  const s = useSession();
  const gasSponsored = useGasSponsored();
  const { open, isLoading } = useTaskCatalogue();
  const drove = useSyncExternalStore(noop, seenStation, () => false);
  const address = s.connected ? s.address : null;

  const [op, setOp] = useState<{ for: string; v: Operator } | null>(null);
  const [runs, setRuns] = useState<{ for: string; v: Run[] | null } | null>(null);
  useEffect(() => {
    if (!address) return;
    let live = true;
    const read = () => {
      fetch(`/api/operator?address=${address}`)
        .then(async (r) => ({ ok: r.ok, b: await r.json() }))
        .then(({ ok, b }) => live && setOp({ for: address, v: ok ? b : { error: b.error ?? "Could not read the registry." } }))
        .catch(() => live && setOp({ for: address, v: { error: "Could not read the registry." } }));
      fetch(`/api/feed?contributor=${address}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((b: { runs?: Run[] }) => live && setRuns({ for: address, v: b.runs ?? [] }))
        .catch(() => live && setRuns({ for: address, v: null }));
    };
    read();
    // Coming back from the passkey page or a station lands here with fresh answers.
    const again = () => { if (document.visibilityState === "visible") read(); };
    document.addEventListener("visibilitychange", again);
    const t = setInterval(read, 10_000);
    return () => { live = false; clearInterval(t); document.removeEventListener("visibilitychange", again); };
  }, [address]);

  const operator = op?.for === address ? op.v : null;
  const myRuns = runs?.for === address ? runs.v : undefined;
  const paid = myRuns?.[0] ?? null;
  const task = open[0] ?? null;
  const enoughGas = gasSponsored || s.balance >= LOW_GAS_BALANCE;

  const steps: Step[] = [
    {
      key: "wallet",
      title: "Sign in",
      state: s.connected && !s.wrongNetwork ? "done" : "todo",
      detail: s.connected && address
        ? <>Signed in as <span className="font-mono">{shortHash(address)}</span> on {appChain.name}.</>
        : LOCALNET
          ? "A wallet this browser makes and keeps, on the local chain. The local faucet funds it."
          : "With an email address or a wallet you already have. Privy makes you a wallet on Monad; there is no seed phrase to write down.",
      action: <button type="button" onClick={() => void s.connect()} className={primary}>{LOCALNET ? "Sign in with the local wallet" : "Sign in"}</button>,
    },
    {
      key: "gas",
      title: "Gas for a submit",
      state: !s.connected ? "todo" : enoughGas ? "done" : "todo",
      detail: gasSponsored
        ? "Gas is sponsored: a submit costs you nothing, and your balance never moves for it."
        : <>You hold {fmtMon(s.balance, 4)} {CURRENCY}. Monad charges the whole gas limit, not what a transaction uses, so a submit needs about {LOW_GAS_BALANCE} {CURRENCY} on hand.</>,
      action: <a href={FAUCET_URL} className={primary} {...(LOCALNET ? {} : { target: "_blank", rel: "noreferrer" })}>{LOCALNET ? "Fund it from the local faucet" : "Get testnet MON"}</a>,
    },
    {
      key: "passkey",
      title: "Your passkey, on chain",
      state: !address ? "todo" : !operator ? "checking" : "error" in operator ? "todo" : operator.passkey ? "done" : "todo",
      detail: operator && "error" in operator
        ? <span className="text-reject">{operator.error}</span>
        : <>Face ID, a fingerprint or a PIN. Its public key goes into PasskeyRegistry (<span className="font-mono">{shortHash(PASSKEY_ADDRESS)}</span>), and Monad&rsquo;s P-256 precompile at <span className="font-mono">0x0100</span> checks its signatures, so a paid run comes from a person.</>,
      action: <Link href="/passkey" className={primary}>Set up your passkey</Link>,
    },
    {
      key: "practice",
      title: "Try the station",
      state: drove ? "done" : "todo",
      detail: "Drive the SO-101 in your browser, a Quest 3S or with a leader arm. Practise first: no wallet, and no paid slot used.",
      action: task ? <Link href={`/station/${task.id}`} className={primary}>Practise on task #{task.id}</Link> : null,
    },
    {
      key: "paid",
      title: "Your first paid run",
      state: !address ? "todo" : myRuns === undefined ? "checking" : paid ? "done" : "todo",
      detail: paid
        ? <>Paid and recorded on chain. <Link href={`/run/${paid.traj_hash}`} className="text-signal hover:text-signal-hi">Run {shortHash(paid.traj_hash)} on task #{paid.task_id} &rarr;</Link></>
        : <>Place the payload inside the ring. The verifier scores it from the samples, and one transaction records the run and pays you{task ? <> {fmtMon(task.rewardMon)} {CURRENCY} on task #{task.id}</> : null}.</>,
      action: task ? <Link href={`/station/${task.id}`} className={primary}>Earn on task #{task.id}</Link> : isLoading ? null : <Link href="/hub" className={primary}>Find a task</Link>,
    },
  ];

  const done = steps.filter((x) => x.state === "done").length;
  const next = steps.findIndex((x) => x.state !== "done");

  return (
    <div className="mx-auto max-w-[760px] px-5 py-10">
      <h1 className="heading-glow text-4xl font-medium tracking-tight sm:text-5xl">Start earning</h1>
      <p className="mt-4 max-w-[60ch] text-base text-scribe-2 [text-wrap:pretty]">
        Five steps from here to your first paid run. Each one is read from the chain or your wallet as you go, so the
        page always shows where you really are.
      </p>

      <div className="mt-8 flex items-center gap-3" aria-label={`${done} of ${steps.length} steps done`}>
        <div className="flex h-1.5 flex-1 gap-1">
          {steps.map((x) => (
            <span key={x.key} className={cn("flex-1 rounded-full transition-colors duration-700", x.state === "done" ? "bg-go" : "bg-ink-3")} />
          ))}
        </div>
        <span className="font-mono text-sm tabular-nums text-scribe-2" data-testid="start-progress">{done} / {steps.length}</span>
      </div>

      <ol className="mt-6 flex flex-col gap-3" data-testid="start-steps">
        {steps.map((x, i) => {
          const current = i === next;
          return (
            <li
              key={x.key}
              data-step={x.key}
              data-state={x.state}
              className={cn(
                "rounded-2xl border p-5 transition-colors duration-500",
                current ? "border-white/25 bg-ink-1" : "border-white/10 bg-ink-0",
              )}
            >
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm",
                    x.state === "done" ? "border-go/50 bg-go-dim text-go" : current ? "border-white/40 text-white" : "border-white/10 text-scribe-3",
                  )}
                  aria-hidden
                >
                  {x.state === "done" ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h2 className={cn("text-lg font-medium", x.state === "done" || current ? "text-scribe" : "text-scribe-2")}>{x.title}</h2>
                    <span className={cn("text-xs", x.state === "done" ? "text-go" : x.state === "checking" ? "text-scribe-3" : current ? "text-signal" : "text-scribe-3")}>
                      {x.state === "done" ? "Done" : x.state === "checking" ? "Checking…" : current ? "Next" : `After step ${i}`}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-scribe-3 [overflow-wrap:anywhere]">{x.detail}</p>
                  {current && x.action ? <div className="mt-4">{x.action}</div> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {done === steps.length ? (
        <p className="mt-6 text-sm text-scribe-2">
          You are set up. Every task you finish pays the same way.{" "}
          <Link href="/hub" className="text-signal hover:text-signal-hi">Find another task &rarr;</Link>
        </p>
      ) : null}
    </div>
  );
}

const primary =
  "inline-flex items-center rounded-lg bg-lilac px-3 py-2 text-base font-semibold text-black transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal";
