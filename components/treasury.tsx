"use client";

import { useBalance, useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import { useSession } from "@/components/session";
import { useThenarWrite } from "@/lib/write";
import { FOUNDRY_ABI } from "@/lib/registry-abi";
import { AXON_ABI } from "@/lib/abi";
import { DEPLOYED } from "@/lib/registry";
import { AXON_ADDRESS, CURRENCY, SCENARIOS, txUrl } from "@/lib/chain";
import { fmtInt, fmtMon, fmtScore, shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

const TREASURY = DEPLOYED.find((d) => d.key === "foundry")!.address;

type Proposal = {
  name: string; slots: number; rewardPerTrajectory: bigint;
  scenario: number; difficulty: number; proposer: `0x${string}`;
  closesAt: bigint; forWeight: bigint; againstWeight: bigint; executed: boolean;
};

/**
 * The treasury the people who filled the corpus decide how to spend.
 *
 * Governance here has a constituency it did not have to invent: every address
 * the protocol has paid carries a weight earned by doing the work the treasury
 * exists to buy more of, and nobody can acquire a vote except by contributing.
 * What it governs is one thing — which task gets funded next — because a
 * treasury that can only do one thing cannot be voted into doing another.
 *
 * All of which was deployed, funded with 0.01 AVAX, and reachable from no page.
 * Proposal 0 passed 16,500 to nil, closed, and has sat unexecuted since —
 * a decision made by the people entitled to make it and never carried out,
 * because nothing in this interface could call `execute`.
 *
 * The three actions appear exactly where the contract would accept them. A vote
 * button on a closed ballot or an execute on a live one is an offer to send a
 * transaction that reverts, and this page has enough real state to be honest
 * with.
 */
export function Treasury() {
  const s = useSession();
  const tx = useThenarWrite();

  const balance = useBalance({ address: TREASURY });
  const count = useReadContract({ address: TREASURY, abi: FOUNDRY_ABI, functionName: "proposalCount" });
  const floor = useReadContract({ address: TREASURY, abi: FOUNDRY_ABI, functionName: "MIN_WEIGHT_TO_PROPOSE" });
  const standing = useReadContract({
    address: AXON_ADDRESS, abi: AXON_ABI, functionName: "totalScore",
    args: s.address ? [s.address] : undefined,
    query: { enabled: Boolean(s.address) },
  });

  const n = Number((count.data as bigint | undefined) ?? 0n);
  const proposals = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: TREASURY, abi: FOUNDRY_ABI, functionName: "getProposal" as const, args: [BigInt(i)] as const,
    })),
    query: { enabled: n > 0 },
  });

  const mine = Number((standing.data as bigint | undefined) ?? 0n);
  const minWeight = Number((floor.data as bigint | undefined) ?? 0n);
  const pot = balance.data ? Number(formatEther(balance.data.value)) : 0;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3 font-mono text-[13px]">
        <span>
          <span className="text-scribe-3">Treasury</span>{" "}
          <span className="tabular-nums text-signal">{fmtMon(pot, 4)} {CURRENCY}</span>
        </span>
        <span>
          <span className="text-scribe-3">Proposals</span>{" "}
          <span className="tabular-nums text-scribe">{fmtInt(n)}</span>
        </span>
        <span>
          <span className="text-scribe-3">To propose</span>{" "}
          <span className="tabular-nums text-scribe">{fmtScore(minWeight)}</span>
          <span className="text-scribe-3"> of recorded score</span>
        </span>
        {s.connected ? (
          <span className={mine >= minWeight ? "text-signal" : "text-scribe-3"}>
            you hold {fmtScore(mine)}
          </span>
        ) : null}
      </div>

      <p className="mt-3 max-w-[70ch] text-[14px] leading-relaxed text-scribe-2">
        Weight is the score this protocol has already paid you for, read at the
        moment a vote is cast and frozen into it &mdash; a run recorded later
        cannot change the meaning of a ballot already posted. Nobody can acquire
        a vote here except by doing the work.
      </p>

      {n === 0 ? (
        <p className="mt-4 font-mono text-[13px] text-scribe-3">
          Nothing proposed yet.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-px bg-rule">
          {(proposals.data ?? []).map((r, i) => {
            if (r.status !== "success") return null;
            const p = r.result as unknown as Proposal;
            return <Row key={i} id={i} p={p} tx={tx} connected={s.connected} weight={mine} />;
          })}
        </ol>
      )}
    </div>
  );
}

function Row({
  id, p, tx, connected, weight,
}: {
  id: number;
  p: Proposal;
  tx: ReturnType<typeof useThenarWrite>;
  connected: boolean;
  weight: number;
}) {
  const closesAt = Number(p.closesAt) * 1000;
  const open = Date.now() < closesAt;
  const forW = Number(p.forWeight);
  const againstW = Number(p.againstWeight);
  const passed = forW > againstW;
  const cost = Number(formatEther(p.rewardPerTrajectory)) * p.slots;

  return (
    <li className="flex flex-col gap-2 bg-ink-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[15px] text-scribe">{p.name}</span>
        <span className="font-mono text-[12px] tabular-nums text-scribe-3">
          {p.slots} × {fmtMon(Number(formatEther(p.rewardPerTrajectory)), 4)} ={" "}
          <span className="text-signal">{fmtMon(cost, 4)} {CURRENCY}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 font-mono text-[12px] text-scribe-3">
        <span>{SCENARIOS[p.scenario] ?? "general"} · difficulty {p.difficulty}</span>
        <span>proposed by {shortHash(p.proposer)}</span>
        <span className={cn(open ? "text-scribe-2" : passed ? "text-go" : "text-reject")}>
          {open
            ? `voting closes ${new Date(closesAt).toLocaleString()}`
            : p.executed
              ? "executed"
              : passed
                ? "passed, waiting to be executed"
                : "rejected"}
        </span>
        <span className="tabular-nums">
          <span className="text-go">{fmtScore(forW)}</span> for ·{" "}
          <span className="text-reject">{fmtScore(againstW)}</span> against
        </span>
      </div>

      {/* Only where the contract would accept it. Anything else is an offer to
          send a transaction that reverts. */}
      {open && connected && weight > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Act tx={tx} label="Vote for" onRun={() => tx.run("vote", [BigInt(id), true], undefined, { address: TREASURY, abi: FOUNDRY_ABI })} />
          <Act tx={tx} label="Vote against" onRun={() => tx.run("vote", [BigInt(id), false], undefined, { address: TREASURY, abi: FOUNDRY_ABI })} />
        </div>
      ) : null}

      {!open && passed && !p.executed && connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <Act
            tx={tx}
            label={`Execute — fund it with ${fmtMon(cost, 4)} ${CURRENCY}`}
            onRun={() => tx.run("execute", [BigInt(id)], undefined, { address: TREASURY, abi: FOUNDRY_ABI })}
          />
          <span className="font-mono text-[11px] text-scribe-3">
            Anyone may execute a proposal that passed. The treasury pays; the
            task appears on the hub like any other.
          </span>
        </div>
      ) : null}

      {tx.error ? <p role="alert" className="text-[13px] text-reject">{tx.error}</p> : null}
      {tx.phase === "confirmed" && tx.txHash ? (
        <p className="font-mono text-[12px] text-go">
          Sent ·{" "}
          <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
            {shortHash(tx.txHash)}
          </a>
        </p>
      ) : null}
    </li>
  );
}

function Act({
  tx, label, onRun,
}: {
  tx: ReturnType<typeof useThenarWrite>;
  label: string;
  onRun: () => void;
}) {
  return (
    <button
      type="button"
      disabled={tx.busy}
      onClick={onRun}
      className="border border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe disabled:opacity-60"
    >
      {tx.phase === "signing" ? "Confirm in wallet…" : tx.phase === "pending" ? "Sending…" : label}
    </button>
  );
}
