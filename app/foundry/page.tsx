"use client";

import { useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import { Button, DimRule } from "@/components/primitives";
import { useSession } from "@/components/session";
import { useCapTable, usePolicies, useTasks, type ChainPolicy } from "@/lib/hooks";
import { useAxonWrite } from "@/lib/write";
import { txUrl, addressUrl } from "@/lib/chain";
import { cn } from "@/lib/cn";
import { fmtInt, fmtMon, shortHash } from "@/lib/format";

export default function FoundryPage() {
  const s = useSession();
  const { data: tasks } = useTasks();
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
            className="mt-5 inline-block border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-brass-hi hover:bg-brass-hi"
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
  const tx = useAxonWrite();
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
          aria-label="Licence fee in MON"
          className={cn(
            "w-[92px] border bg-ink-2 px-2 py-1 text-right font-mono text-[13px] tabular-nums text-brass focus:outline-none",
            bad ? "border-reject" : "border-rule focus:border-rule-strong",
          )}
        />
        <span className="text-[12px] text-scribe-3">MON</span>
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
  const tx = useAxonWrite();
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
        </span>
      </header>

      <div className="grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="Trajectories" value={fmtInt(p.trajectories)} />
        <Cell label="Contributors" value={fmtInt(cap?.length ?? 0)} />
        <Cell label="Licences sold" value={fmtInt(p.licencesSold)} />
        <Cell label="Licence" value={`${fmtMon(p.licenceMon, 3)} MON`} tone="brass" />
      </div>

      <div className="px-5 py-4">
        <DimRule note={`Cap table — ${cap?.length ?? 0} contributor${cap?.length === 1 ? "" : "s"}`} />
        {!cap?.length ? (
          <p className="mt-4 text-[13px] text-scribe-3">Reading the cap table…</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {cap.map((c) => (
              <li key={c.address} className="flex items-center gap-3">
                <a
                  href={addressUrl(c.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-[118px] shrink-0 font-mono text-[12px] text-scribe-2 hover:text-datum"
                >
                  {shortHash(c.address)}
                </a>
                <span className="h-2.5 flex-1 bg-ink-3">
                  <span className="block h-full bg-brass transition-[width] duration-500" style={{ width: `${(c.weightBps / top) * 100}%` }} />
                </span>
                <span className="w-[86px] shrink-0 text-right font-mono text-[12px] tabular-nums text-scribe-2">
                  {(c.weightBps / 100).toFixed(2)}%
                </span>
                <span className="w-[92px] shrink-0 text-right font-mono text-[12px] tabular-nums text-brass">
                  {fmtMon(c.payoutMon, 4)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-rule px-5 py-3">
        <span className="text-[13px] text-scribe-2">
          {tx.phase === "confirmed" && tx.txHash ? (
            <>
              Paid {cap?.length ?? 0} contributors in one transaction ·{" "}
              <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="font-mono text-datum hover:underline">
                {shortHash(tx.txHash)}
              </a>
              {tx.elapsedMs ? <span className="ml-2 font-mono text-scribe-3">{(tx.elapsedMs / 1000).toFixed(2)}s</span> : null}
            </>
          ) : tx.error ? (
            <span role="alert" className="text-reject">{tx.error}</span>
          ) : (
            <>{fmtMon(p.distributedMon, 4)} MON distributed so far · every sale splits the same way</>
          )}
        </span>
        <Button
          variant="primary"
          disabled={tx.busy}
          onClick={async () => {
            if (!s.connected) return s.connect();
            if (s.wrongNetwork) return s.switchToMonad();
            const r = await tx.run("licensePolicy", [BigInt(p.id)], p.licenceWei);
            if (r) onDone();
          }}
        >
          {tx.phase === "signing" ? "Confirm…"
            : tx.phase === "pending" ? "Paying out…"
            : !s.connected ? "Connect to licence"
            : s.wrongNetwork ? "Switch network"
            : `Licence for ${fmtMon(p.licenceMon, 3)} MON`}
        </Button>
      </footer>
    </article>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "brass" }) {
  return (
    <div className="flex flex-col gap-1 bg-ink-1 px-5 py-3">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[16px] tabular-nums", tone === "brass" ? "text-brass" : "text-scribe")}>{value}</span>
    </div>
  );
}
