"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEther } from "viem";
import { Button, DimRule } from "@/components/primitives";
import { useSession } from "@/components/session";
import { useAxonWrite } from "@/lib/write";
import { SCENARIOS, txUrl } from "@/lib/chain";
import { parSecondsFor } from "@/lib/par";
import { cn } from "@/lib/cn";
import { fmtMon, fmtSeconds, shortHash } from "@/lib/format";

/** Anyone can open work here: the escrow is what makes the bounty real. */
export default function PostTaskPage() {
  const s = useSession();
  const tx = useAxonWrite();
  const router = useRouter();

  const [name, setName] = useState("");
  const [slots, setSlots] = useState("10");
  const [reward, setReward] = useState("0.004");
  const [scenario, setScenario] = useState(1);
  const [difficulty, setDifficulty] = useState(3);

  const slotsN = Number(slots);
  const rewardN = Number(reward);
  const validName = name.trim().length >= 8;
  const validSlots = Number.isInteger(slotsN) && slotsN > 0 && slotsN <= 10_000;
  const validReward = /^\d*\.?\d*$/.test(reward) && rewardN > 0;
  const total = validSlots && validReward ? slotsN * rewardN : 0;
  const affordable = total > 0 && total <= s.balance;
  const ok = validName && validSlots && validReward && affordable;

  return (
    <div className="mx-auto max-w-[720px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Post a task</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        A task is a funded bounty. The MON you escrow is what operators are paid
        from, one accepted run at a time, and whatever is left stays yours in the
        contract.
      </p>

      <DimRule className="mt-8" note="Definition" />

      <div className="mt-5 flex flex-col gap-5">
        <Field label="Instruction" hint="What the operator has to do. Written as an order, not a description.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Put the toothpaste into the upper drawer"
            className={cn(inputCls, !validName && name.length > 0 && "border-reject")}
          />
          {!validName && name.length > 0 ? (
            <Err>Give the operator a full instruction — at least eight characters.</Err>
          ) : null}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Slots" hint="How many accepted runs this task collects.">
            <input
              value={slots}
              onChange={(e) => setSlots(e.target.value)}
              inputMode="numeric"
              className={cn(inputCls, !validSlots && "border-reject")}
            />
            {!validSlots ? <Err>A whole number between 1 and 10,000.</Err> : null}
          </Field>

          <Field label="Reward per run" hint="Paid at a perfect score, scaled down by the measured quality.">
            <div className="flex items-center gap-2">
              <input
                value={reward}
                onChange={(e) => setReward(e.target.value)}
                inputMode="decimal"
                className={cn(inputCls, "text-right", !validReward && "border-reject")}
              />
              <span className="text-[12px] text-scribe-3">MON</span>
            </div>
            {!validReward ? <Err>A positive amount in MON.</Err> : null}
          </Field>
        </div>

        <Field label="Scenario" hint="Where the task happens. Coverage across scenarios is what makes the dataset generalise.">
          <div className="flex flex-wrap gap-2">
            {SCENARIOS.map((sc, i) => (
              <button
                key={sc}
                onClick={() => setScenario(i)}
                aria-pressed={scenario === i}
                className={cn(
                  "border px-2.5 py-1 font-mono text-[12px] capitalize transition-colors",
                  scenario === i ? "border-scribe bg-scribe text-ink-0" : "border-rule text-scribe-3 hover:border-rule-strong",
                )}
              >
                {sc}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Difficulty" hint={`Sets the par time the efficiency score is measured against — ${fmtSeconds(parSecondsFor(difficulty))}.`}>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                aria-pressed={difficulty === d}
                className={cn(
                  "size-8 border font-mono text-[12px] transition-colors",
                  difficulty === d ? "border-scribe bg-scribe text-ink-0" : "border-rule text-scribe-3 hover:border-rule-strong",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <DimRule className="mt-10" note="Escrow" />

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border border-rule px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="label">To escrow now</span>
          <span className="font-mono text-3xl leading-none text-brass">
            {fmtMon(total, 4)}<span className="ml-1.5 text-[12px] text-scribe-3">MON</span>
          </span>
          <span className="mt-1 font-mono text-[12px] text-scribe-3">
            {validSlots ? slotsN : 0} runs × {validReward ? fmtMon(rewardN, 4) : "0"} MON
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="label">Your balance</span>
          <span className={cn("font-mono text-[15px] tabular-nums", affordable || total === 0 ? "text-scribe" : "text-reject")}>
            {fmtMon(s.balance, 4)} MON
          </span>
        </div>
      </div>

      {total > 0 && !affordable ? (
        <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-reject">
          That escrow is more than this wallet holds. Lower the slot count or the
          reward, or top up from the faucet.
        </p>
      ) : null}

      {tx.error ? <p role="alert" className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-reject">{tx.error}</p> : null}

      {tx.phase === "confirmed" && tx.txHash ? (
        <p className="mt-3 max-w-[62ch] text-[13px] text-go">
          Task posted ·{" "}
          <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="font-mono text-datum hover:underline">
            {shortHash(tx.txHash)}
          </a>
        </p>
      ) : null}

      <div className="mt-6 flex gap-3">
        <Button
          variant="primary"
          disabled={tx.busy || (s.connected && !ok)}
          onClick={async () => {
            if (!s.connected) return s.connect();
            if (s.wrongNetwork) return s.switchToMonad();
            const r = await tx.run(
              "createTask",
              [name.trim(), slotsN, parseEther(reward), scenario, difficulty],
              parseEther(String(total)),
            );
            if (r) router.push("/hub");
          }}
        >
          {tx.phase === "signing" ? "Confirm in wallet…"
            : tx.phase === "pending" ? "Posting…"
            : !s.connected ? "Connect a wallet"
            : s.wrongNetwork ? "Switch to Monad"
            : "Escrow and post"}
        </Button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full border border-rule bg-ink-2 px-3 py-2 font-mono text-[13px] text-scribe placeholder:text-scribe-3 focus:border-rule-strong focus:outline-none";

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      {children}
      <span className="max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">{hint}</span>
    </label>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <span className="text-[12px] text-reject">{children}</span>;
}
