"use client";

import { useRouter } from "next/navigation";
import { suggestInstructions } from "@/lib/instructions";
import { useEffect, useState, useMemo } from "react";
import { parseEther } from "viem";
import { Button, DimRule } from "@/components/primitives";
import { useSession } from "@/components/session";
import { useThenarWrite } from "@/lib/write";
import { txUrl, CURRENCY, appChain } from "@/lib/chain";
import { parSecondsFor } from "@/lib/par";
import { cn } from "@/lib/cn";
import { PostPreflight } from "@/components/post-preflight";
import { fmtMon, fmtSeconds, shortHash } from "@/lib/format";
import { PropPicker } from "@/components/prop-picker";
import { RoomPicker } from "@/components/room-picker";
import { useTaskCatalogue } from "@/components/tasks-provider";
import { SCENARIOS } from "@/lib/chain";
import { payloads, targets, propById, type Prop } from "@/lib/props";

/** Anyone can open work here: the escrow is what makes the bounty real. */
export default function PostTaskPage() {
  const s = useSession();
  const tx = useThenarWrite();
  const router = useRouter();

  const [name, setName] = useState("Put the toothpaste into the drawer");
  // The scene is chosen, not inferred from prose. A funder picks the object to
  // move and the landmark to move it to, and the instruction is written from
  // them — so what the operator sees in the viewport is what was escrowed for.
  // Models a funder uploaded live beside the built-in ones, so a task can be
  // posted against a scene the library does not ship. Without this the upload
  // endpoint stores a model nothing can ever select.
  const [uploaded, setUploaded] = useState<Prop[]>([]);
  useEffect(() => {
    let live = true;
    fetch("/api/props")
      .then((r) => (r.ok ? r.json() : { props: [] }))
      .then((d) => {
        if (!live) return;
        setUploaded(
          (d.props ?? []).map((p: Record<string, unknown>) => ({
            id: String(p.id), label: String(p.label), scenario: "uploaded",
            role: p.role as "payload" | "target", widthMm: Number(p.width_mm),
            url: `/api/props/${p.id}`, bytes: Number(p.bytes),
          })),
        );
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const allPayloads = [...payloads(), ...uploaded.filter((p) => p.role === "payload")];
  const allTargets = [...targets(), ...uploaded.filter((p) => p.role === "target")];

  const [payloadId, setPayloadId] = useState("toothpaste");
  const [targetId, setTargetId] = useState("drawer");
  /**
   * How long before the funder may take back what was never paid out.
   *
   * Zero is the contract's own "never", which is what this form has always
   * created. It stays available and it is no longer the only option.
   */
  const [days, setDays] = useState(0);
  /** The deadline as a date, resolved on the client where the clock is. */
  const [closesOn, setClosesOn] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(
      () =>
        setClosesOn(
          days > 0 ? new Date(Date.now() + days * 86_400_000).toLocaleDateString() : null,
        ),
      0,
    );
    return () => clearTimeout(t);
  }, [days]);
  const [slots, setSlots] = useState("10");
  const [reward, setReward] = useState("0.004");
  const [scenario, setScenario] = useState(1);
  const [difficulty, setDifficulty] = useState(3);

  // Existing tasks as starting points. A funder posting a second task usually
  // wants the same shape as their first with one thing changed, and rebuilding
  // it from defaults invites a typo in the economics rather than the scene.
  const { tasks } = useTaskCatalogue();

  const slotsN = Number(slots);
  const rewardN = Number(reward);
  const validName = name.trim().length >= 8;

  /**
   * Other ways to say the same task, from the two objects already chosen.
   *
   * Recomputed rather than stored: it is a pure function of the props and the
   * scenario, and a stale list would offer wording for objects the funder has
   * since changed.
   */
  const suggestions = useMemo(
    () => suggestInstructions(payloadId, targetId, SCENARIOS[scenario] ?? "general", uploaded),
    [payloadId, targetId, scenario, uploaded],
  );
  const validSlots = Number.isInteger(slotsN) && slotsN > 0 && slotsN <= 10_000;
  const validReward = /^\d*\.?\d*$/.test(reward) && rewardN > 0;
  const total = validSlots && validReward ? slotsN * rewardN : 0;

  // Two separate gates. The definition of the task is wrong or right on its
  // own, and blocks the button whatever the wallet is doing. Affordability can
  // only be judged once a wallet is connected, so it gates only after that.
  const formValid = validName && validSlots && validReward;
  const affordable = total > 0 && total <= s.balance;
  const blocked = !formValid || (s.connected && !s.wrongNetwork && !affordable);

  return (
    <div className="mx-auto max-w-[720px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Post a task</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        A task is a funded bounty. The {CURRENCY} you escrow is what operators are paid
        from, one accepted run at a time, and whatever is left stays yours in the
        contract.
      </p>

      <DimRule className="mt-8" note="Definition" />

      <div className="mt-5 flex flex-col gap-5">
        <PropPicker
          label="Object to move"
          hint="The payload the operator picks up. This is the model the station loads — the preview is the asset itself, not a picture of it."
          options={allPayloads}
          value={payloadId}
          onChange={(id) => { setPayloadId(id); setName(compose(id, targetId, uploaded)); }}
        />

        <PropPicker
          label="Landmark"
          hint="Where it has to end up. The datum circle is placed on this, and the operator sees it in the scene."
          options={allTargets}
          value={targetId}
          onChange={(id) => { setTargetId(id); setName(compose(payloadId, id, uploaded)); }}
        />

        <Field label="Instruction" hint="Written from the two objects above. Edit the wording if it matters, but keep both names in it — the station reads them back to build the scene.">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Put the toothpaste into the upper drawer"
            className={cn(inputCls, !validName && name.length > 0 && "border-reject")}
          />
          {!validName && name.length > 0 ? (
            <Err>Give the operator a full instruction — at least eight characters.</Err>
          ) : null}

          {/* Phrasings for the two objects already chosen. Not a language
              model — composed from those objects, then round-tripped through
              the same parser the station uses, so a suggestion that would
              render a different scene never appears. The wording stays the
              funder's: these are a starting point, and the field above is
              still free text. */}
          {suggestions.length > 0 ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">
                Or say it another way
              </span>
              <ul className="flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <li key={s.text}>
                    <button
                      type="button"
                      onClick={() => setName(s.text)}
                      className={cn(
                        "border px-2 py-1 text-left font-mono text-[12px] transition-colors",
                        name === s.text
                          ? "border-signal text-signal"
                          : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe",
                      )}
                    >
                      {s.text}
                      <span className="ml-2 uppercase tracking-[0.12em] text-scribe-3">{s.skill}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <span className="text-[12px] leading-relaxed text-scribe-3">
                Each one is composed from the objects above and checked against
                the parser that builds the scene &mdash; the label on the right
                is the manipulation the app will read back from it.
              </span>
            </div>
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
              <span className="text-[12px] text-scribe-3">{CURRENCY}</span>
            </div>
            {!validReward ? <Err>A positive amount in {CURRENCY}.</Err> : null}
          </Field>
        </div>

        {/* The one protection a funder has.
            The contract's createTaskUntil takes a deadline and closeTask
            returns the unspent escrow after it; without one, escrow enters and
            can only leave as a payout, so a task nobody finishes keeps the
            remainder for good. This form only ever called createTask, so every
            task posted through it was the unrecoverable kind — and nothing on
            the page said so. */}
        <Field
          label="Deadline"
          hint="After this you can close the task and take back whatever was never paid out. Leave it empty and the escrow can never come back."
        >
          <div className="flex flex-wrap items-center gap-2">
            {DEADLINES.map((d) => (
              <button
                key={d.days}
                type="button"
                onClick={() => setDays(days === d.days ? 0 : d.days)}
                aria-pressed={days === d.days}
                className={cn(
                  "border px-2.5 py-1 font-mono text-[12px] transition-colors",
                  days === d.days
                    ? "border-signal bg-signal-dim text-signal-hi"
                    : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe-2",
                )}
              >
                {d.label}
              </button>
            ))}
            {/* The date is computed after mount, not during render: reading
                the clock while rendering makes the server's markup and the
                browser's first paint disagree, and the disagreement is a date. */}
            <span className="font-mono text-[12px] text-scribe-3">
              {days > 0
                ? closesOn
                  ? `closes ${closesOn} — you can reclaim after that`
                  : `closes in ${days} days — you can reclaim after that`
                : "no deadline — the escrow can never be returned"}
            </span>
          </div>
        </Field>

        {tasks.length > 0 ? (
          <Field
            label="Start from"
            hint="Copy an existing task's scene, room, rate and difficulty, then change what you need. Nothing is posted until you sign."
          >
            <div className="flex flex-wrap gap-2">
              {tasks.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setPayloadId(t.scene.payload.id);
                    setTargetId(t.scene.target.id);
                    setName(t.name);
                    setScenario(Math.max(0, SCENARIOS.indexOf(t.scenario as (typeof SCENARIOS)[number])));
                    setDifficulty(t.difficulty);
                    setReward(String(t.rewardMon));
                    setSlots(String(t.slotsTotal));
                  }}
                  className="border border-rule px-2.5 py-1 font-mono text-[12px] text-scribe-3 transition-colors hover:border-rule-strong hover:text-scribe-2"
                >
                  #{t.id} {t.scene.payload.label}&rarr;{t.scene.target.label}
                </button>
              ))}
            </div>
          </Field>
        ) : null}


        <Field
          label="Room"
          hint="Where the task happens, and what the station will actually draw. This is the scenario index the contract stores, so the room is recoverable from chain state alone — coverage across rooms is what makes the dataset generalise."
        >
          <RoomPicker value={scenario} onChange={setScenario} />
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
          <span className="font-mono text-3xl leading-none text-signal">
            {fmtMon(total, 4)}<span className="ml-1.5 text-[12px] text-scribe-3">{CURRENCY}</span>
          </span>
          <span className="mt-1 font-mono text-[12px] text-scribe-3">
            {validSlots ? slotsN : 0} runs × {validReward ? fmtMon(rewardN, 4) : "0"} {CURRENCY}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="label">Your balance</span>
          <span className={cn("font-mono text-[15px] tabular-nums", affordable || total === 0 ? "text-scribe" : "text-reject")}>
            {fmtMon(s.balance, 4)} {CURRENCY}
          </span>
        </div>
      </div>

      {/* What the escrow will actually draw, what happens to the rest, and what
          the transaction placing it costs. The block above priced the escrow to
          four decimals and left all three unanswered. */}
      <PostPreflight slots={validSlots ? slotsN : 0} rewardMon={validReward ? rewardN : 0} days={days} />

      {s.connected && !s.wrongNetwork && total > 0 && !affordable ? (
        <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-reject">
          That escrow is more than this wallet holds. Lower the slot count or the
          reward, or top up from the faucet.
        </p>
      ) : null}

      {tx.error ? <p role="alert" className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-reject">{tx.error}</p> : null}

      {tx.phase === "confirmed" && tx.txHash ? (
        <p className="mt-3 max-w-[62ch] text-[13px] text-go">
          Task posted ·{" "}
          <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="font-mono text-probe hover:underline">
            {shortHash(tx.txHash)}
          </a>
        </p>
      ) : null}

      <div className="mt-6 flex gap-3">
        <Button
          variant="primary"
          disabled={tx.busy || blocked}
          onClick={async () => {
            if (!s.connected) return s.connect();
            if (s.wrongNetwork) return s.switchToChain();
            // Two entry points, one for each kind of task the contract can
            // hold. createTaskUntil is not a variant of createTask with an
            // extra argument — a task with expiresAt 0 can never be closed —
            // so which one is called is the funder's decision, not a detail.
            const r =
              days > 0
                ? await tx.run(
                    "createTaskUntil",
                    [
                      name.trim(), slotsN, parseEther(reward), scenario, difficulty,
                      BigInt(Math.floor(Date.now() / 1000) + days * 86_400),
                    ],
                    parseEther(String(total)),
                  )
                : await tx.run(
                    "createTask",
                    [name.trim(), slotsN, parseEther(reward), scenario, difficulty],
                    parseEther(String(total)),
                  );
            if (r) router.push("/hub");
          }}
        >
          {tx.phase === "signing" ? "Confirm in wallet…"
            : tx.phase === "pending" ? "Posting…"
            : !formValid ? "Finish the definition"
            : !s.connected ? "Connect a wallet"
            : s.wrongNetwork ? `Switch to ${appChain.name}`
            : !affordable ? "Escrow exceeds your balance"
            : "Escrow and post"}
        </Button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full border border-rule bg-ink-2 px-3 py-2 font-mono text-[13px] text-scribe placeholder:text-scribe-3 focus:border-rule-strong focus:outline-none";


/**
 * The instruction, written from the two objects the funder picked.
 *
 * It has to keep both names in it: `propsForTask` reads the instruction back to
 * decide what the station renders, so an instruction that drops a name would
 * silently give the operator a different scene from the one funded.
 */
function compose(payloadId: string, targetId: string, extra: Prop[] = []): string {
  const find = (id: string) => propById(id) ?? extra.find((e) => e.id === id);
  const p = find(payloadId)?.label.toLowerCase() ?? "object";
  const t = find(targetId)?.label.toLowerCase() ?? "target";
  const into = ["drawer", "crate", "pen cup", "air fryer"].includes(t) ? "into" : "on";
  return `Put the ${p} ${into} the ${t}`;
}

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

/** Deadlines a funder is likely to want, in whole days. */
const DEADLINES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;
