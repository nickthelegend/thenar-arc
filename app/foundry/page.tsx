"use client";

import { useEffect } from "react";

import { useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import { Button, DimRule } from "@/components/primitives";
import { Treasury } from "@/components/treasury";
import { useSession } from "@/components/session";
import { useCapTable, usePolicies, type ChainPolicy } from "@/lib/hooks";
import { useThenarWrite } from "@/lib/write";
import { txUrl, addressUrl, CURRENCY } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtInt, fmtMon, shortHash } from "@/lib/format";
import { useTaskCatalogue } from "@/components/tasks-provider";

export default function FoundryPage() {
  const s = useSession();
  const { tasks } = useTaskCatalogue();
  const { data: policies, isLoading, refetch } = usePolicies();

  const mintable = (tasks ?? []).filter((t) => t.slotsFilled >= t.slotsTotal && !t.policyMinted);

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Foundry</h1>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        When a task fills its slots, the policy trained on it is minted with the
        contributor list attached — every operator who produced a trajectory,
        weighted by the quality it measured. Buying a licence pays that list
        directly, in one transaction. Nobody claims later; the split is the payment.
      </p>

      {mintable.length > 0 ? (
        <>
          <DimRule className="mt-8" note={`Ready to mint — ${mintable.length} filled task${mintable.length === 1 ? "" : "s"}`} />
          <ul className="mt-4 flex flex-col gap-3">
            {mintable.map((t) => (
              <MintRow key={t.id} taskId={t.id} name={t.name} onDone={refetch} connected={s.connected} onConnect={s.connect} />
            ))}
          </ul>
        </>
      ) : null}

      {/* The treasury the contributors decide how to spend.
          Deployed, funded, and reachable from no page — so proposal 0 passed
          16,500 to nil, closed, and has sat unexecuted ever since. */}
      <DimRule className="mt-10" note="Treasury" />
      <Treasury />

      <DimRule className="mt-10" note="Minted policies" />

      {isLoading ? (
        <ul className="mt-6 flex flex-col gap-4" aria-busy="true">
          {Array.from({ length: 2 }, (_, i) => <li key={i} className="hatch h-40" />)}
        </ul>
      ) : (policies?.length ?? 0) === 0 ? (
        <div className="mt-6 border border-rule px-6 py-16 text-center">
          <p className="text-[15px] text-scribe-2">No policy has been minted yet.</p>
          <p className="mx-auto mt-1 max-w-[52ch] text-[14px] text-scribe-3">
            A policy can be minted once a task fills every slot. Run the open work
            and this fills itself.
          </p>
          <Link
            href="/hub"
            className="mt-5 inline-block border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
          >
            Open the hub
          </Link>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-10">
          {policies!.map((p) => (
            <PolicyCard key={p.id} policy={p} taskName={tasks?.find((t) => t.id === p.taskId)?.name} onDone={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function MintRow({
  taskId, name, onDone, connected, onConnect,
}: { taskId: number; name: string; onDone: () => void; connected: boolean; onConnect: () => void }) {
  const tx = useThenarWrite();
  const [fee, setFee] = useState("0.05");

  const bad = !/^\d*\.?\d*$/.test(fee) || Number(fee) <= 0;

  return (
    <li className="flex flex-wrap items-center gap-3 border border-rule px-4 py-3">
      <span className="font-mono text-[12px] text-scribe-3">#{taskId}</span>
      <span className="min-w-0 flex-1 truncate text-[14px]">{name}</span>
      <label className="flex items-center gap-2">
        <span className="label">Licence</span>
        <input
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          inputMode="decimal"
          aria-label="Licence fee in AVAX"
          className={cn(
            "w-[92px] border bg-ink-2 px-2 py-1 text-right font-mono text-[13px] tabular-nums text-signal focus:outline-none",
            bad ? "border-reject" : "border-rule focus:border-rule-strong",
          )}
        />
        <span className="text-[12px] text-scribe-3">{CURRENCY}</span>
      </label>
      <Button
        variant="primary"
        disabled={tx.busy || bad}
        onClick={async () => {
          if (!connected) return onConnect();
          const r = await tx.run("mintPolicy", [BigInt(taskId), parseEther(fee)]);
          if (r) onDone();
        }}
      >
        {tx.phase === "signing" ? "Confirm…" : tx.phase === "pending" ? "Minting…" : "Mint policy"}
      </Button>
      {tx.error ? <p role="alert" className="w-full text-[13px] text-reject">{tx.error}</p> : null}
    </li>
  );
}

function PolicyCard({ policy: p, taskName, onDone }: { policy: ChainPolicy; taskName?: string; onDone: () => void }) {
  const s = useSession();
  const tx = useThenarWrite();
  const { data: cap } = useCapTable(p.id);

  const top = cap?.length ? Math.max(...cap.map((c) => c.weightBps)) : 1;

  return (
    <article className="border border-rule">
      <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[12px] text-scribe-3">POL-{String(p.id).padStart(3, "0")}</span>
          <h2 className="font-display text-xl font-600">{taskName ?? `Task #${p.taskId}`}</h2>
        </div>
        <span className="font-mono text-[12px] text-scribe-3">
          from task #{p.taskId} · minted {new Date(p.mintedAt).toLocaleDateString()}
          {" · "}
          <Link href={`/licence/${p.id}`} className="hover:text-probe">receipt &rarr;</Link>
        </span>
      </header>

      <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="Trajectories" value={fmtInt(p.trajectories)} />
        <Cell label="Contributors" value={fmtInt(cap?.length ?? 0)} />
        <Cell label="Licences sold" value={fmtInt(p.licencesSold)} />
        <Cell label="Licence" value={`${fmtMon(p.licenceMon, 3)} ${CURRENCY}`} tone="signal" />
      </div>

      <DatasetPreview taskId={p.taskId} />

      <div className="px-5 py-4">
        <YourShare cap={cap} address={s.address} licenceMon={p.licenceMon} />
        <DimRule note={`Cap table — ${cap?.length ?? 0} contributor${cap?.length === 1 ? "" : "s"}`} />
        {!cap?.length ? (
          <p className="mt-4 text-[13px] text-scribe-3">Reading the cap table…</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {cap.map((c) => {
              const yours = s.address?.toLowerCase() === c.address.toLowerCase();
              return (
              <li key={c.address} className={cn("flex items-center gap-3", yours && "bg-signal-dim")}>
                <a
                  href={addressUrl(c.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-[118px] shrink-0 font-mono text-[12px] text-scribe-2 hover:text-probe"
                >
                  {shortHash(c.address)}
                </a>
                <span className="h-2.5 flex-1 bg-ink-3">
                  <span className="block h-full bg-signal transition-[width] duration-500" style={{ width: `${(c.weightBps / top) * 100}%` }} />
                </span>
                <span className="w-[86px] shrink-0 text-right font-mono text-[12px] tabular-nums text-scribe-2">
                  {(c.weightBps / 100).toFixed(2)}%
                </span>
                <span className="w-[92px] shrink-0 text-right font-mono text-[12px] tabular-nums text-signal">
                  {fmtMon(c.payoutMon, 4)}
                </span>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-rule px-5 py-3">
        <span className="text-[13px] text-scribe-2">
          {tx.phase === "confirmed" && tx.txHash ? (
            <>
              Paid {cap?.length ?? 0} contributors in one transaction ·{" "}
              <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="font-mono text-probe hover:underline">
                {shortHash(tx.txHash)}
              </a>
              {tx.elapsedMs ? <span className="ml-2 font-mono text-scribe-3">{(tx.elapsedMs / 1000).toFixed(2)}s</span> : null}
            </>
          ) : tx.error ? (
            <span role="alert" className="text-reject">{tx.error}</span>
          ) : (
            <>{fmtMon(p.distributedMon, 4)} {CURRENCY} distributed so far · every sale splits the same way</>
          )}
        </span>
        <Button
          variant="primary"
          disabled={tx.busy}
          onClick={async () => {
            if (!s.connected) return s.connect();
            if (s.wrongNetwork) return s.switchToChain();
            const r = await tx.run("licensePolicy", [BigInt(p.id)], p.licenceWei);
            if (r) onDone();
          }}
        >
          {tx.phase === "signing" ? "Confirm…"
            : tx.phase === "pending" ? "Paying out…"
            : !s.connected ? "Connect to licence"
            : s.wrongNetwork ? "Switch network"
            : `Licence for ${fmtMon(p.licenceMon, 3)} ${CURRENCY}`}
        </Button>
      </footer>
    </article>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "signal" }) {
  return (
    <div className="flex flex-col gap-1 bg-ink-1 px-5 py-3">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[16px] tabular-nums", tone === "signal" ? "text-signal" : "text-scribe")}>{value}</span>
    </div>
  );
}


type Summary = {
  episodes: number; frames: number; contributors: number;
  score: { min: number; median: number; p90: number; max: number; mean: number };
  deviationMm: { mean: number };
  seconds: { total: number; mean: number };
  distribution: { from: number; to: number; n: number }[];
};

/**
 * What the licence buys, before it is bought.
 *
 * A buyer paying for a corpus should be able to see its shape first. This is
 * the same set of rows the export ships — settled runs on the active chain —
 * summarised rather than downloaded, so deciding does not mean fetching
 * thousands of frames.
 */
function DatasetPreview({ taskId }: { taskId: number }) {
  const [d, setD] = useState<Summary | null>(null);
  /**
   * Nothing stored for this task, which is not the same as a broken read.
   *
   * The route answers 404 when a task has no settled runs on the active chain,
   * which is the correct status and a legitimate state — a policy can be minted
   * over runs the current deployment has never stored. The panel used to
   * disappear on it, so a buyer looking at a minted policy saw the cap table,
   * the fee, and no statement at all about what the licence covers.
   *
   * Told apart from a real failure, because "we hold nothing for this task" and
   * "we could not find out" are different answers to the only question a buyer
   * is asking here.
   */
  const [state, setState] = useState<"reading" | "ok" | "empty" | "failed">("reading");

  useEffect(() => {
    let live = true;
    fetch(`/api/dataset/summary?taskId=${taskId}`)
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) return setState("failed");
        const j = (await r.json()) as Summary;
        // The route answers with a zeroed summary rather than a 404, so the
        // empty case is a value to read rather than a status to catch.
        if (!j.episodes) return setState("empty");
        setD(j);
        setState("ok");
      })
      .catch(() => { if (live) setState("failed"); });
    return () => { live = false; };
  }, [taskId]);

  if (state === "empty" || state === "failed") {
    return (
      <div className="border-t border-rule px-5 py-4">
        <DimRule note="What the licence buys" />
        <p className="mt-4 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">
          {state === "empty" ? (
            <>
              This deployment holds no recordings for task #{taskId}, so there is
              nothing to summarise. The policy and its cap table are on chain and
              unaffected &mdash; a policy can be minted over runs settled against
              a superseded contract, and those are listed on{" "}
              <Link href="/archive" className="text-signal hover:text-signal-hi">/archive</Link>.
            </>
          ) : (
            <>The corpus index did not answer. Everything above is read from the chain and is unaffected.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-rule px-5 py-4">
      <DimRule note="What the licence buys" />
      {!d ? (
        <p className="mt-4 text-[13px] text-scribe-3">Reading the corpus&hellip;</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <Reading label="Episodes" value={fmtInt(d.episodes)} />
            <Reading label="Frames" value={fmtInt(d.frames)} note="at 20 Hz" />
            <Reading label="Contributors" value={fmtInt(d.contributors)} />
            <Reading label="Median score" value={(d.score.median / 100).toFixed(2)} />
            <Reading label="Mean deviation" value={`${d.deviationMm.mean.toFixed(1)} mm`} />
            <Reading label="Recorded" value={`${(d.seconds.total / 60).toFixed(1)} min`} />
          </div>

          <div className="mt-4 flex items-end gap-1" role="img"
               aria-label={`Score distribution across ${d.episodes} episodes`}>
            {d.distribution.map((b) => {
              const top = Math.max(...d.distribution.map((x) => x.n)) || 1;
              return (
                <span key={b.from} className="flex flex-1 flex-col items-center gap-1">
                  <span className="w-full bg-signal" style={{ height: `${Math.max(2, (b.n / top) * 44)}px` }} />
                  <span className="font-mono text-[12px] tabular-nums text-scribe-3">{b.n || ""}</span>
                </span>
              );
            })}
          </div>
          <p className="mt-1 flex justify-between font-mono text-[12px] text-scribe-3">
            <span>40.00</span><span>score</span><span>100.00</span>
          </p>

          <a
            href={`/api/dataset?taskId=${taskId}`}
            className="mt-4 inline-block font-mono text-[12px] uppercase tracking-[0.14em] text-signal hover:text-signal-hi"
          >
            Download the corpus &rarr;
          </a>
        </>
      )}
    </div>
  );
}

function Reading({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className="font-mono text-[15px] tabular-nums text-scribe">
        {value}
        {note ? <span className="ml-1 text-[12px] text-scribe-3">{note}</span> : null}
      </span>
    </span>
  );
}


/**
 * What a licence on this policy would pay the person reading the page.
 *
 * The cap table already lists every contributor's share; a contributor should
 * not have to find their own address in it. Shown only when the connected
 * wallet is actually in the table, because a line saying "you would receive
 * nothing" to someone who never contributed is noise, not information.
 */
function YourShare({ cap, address, licenceMon }: {
  cap: { address: string; weightBps: number; payoutMon: number }[] | undefined;
  address: string | null | undefined;
  licenceMon: number;
}) {
  if (!cap?.length || !address) return null;
  const mine = cap.find((c) => c.address.toLowerCase() === address.toLowerCase());
  if (!mine) return null;

  return (
    <p className="mb-3 border border-signal bg-signal-dim px-3 py-2 font-mono text-[12px] text-signal">
      Your share of this policy is {(mine.weightBps / 100).toFixed(2)}% &mdash;{" "}
      {fmtMon(mine.payoutMon, 4)} {CURRENCY} for every {fmtMon(licenceMon, 3)}{" "}
      {CURRENCY} licence sold, paid in the same transaction as everyone else&rsquo;s.
    </p>
  );
}
