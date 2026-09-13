"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEther } from "viem";
import { DimRule } from "@/components/primitives";
import { useTaskCatalogue } from "@/components/tasks-provider";
import { AXON_ADDRESS, SCENARIOS, addressUrl, appChain, txUrl } from "@/lib/chain";

/**
 * A lab's data budget, in a wallet that can only fund Thenar.
 *
 * Thenar's buyers are robotics labs, and a lab paying for demonstrations has
 * the problem every organisation has with a hot wallet: whoever holds the key
 * can spend the budget on anything. Here the budget sits in a Privy server
 * wallet with a Privy policy attached. The policy allows one kind of
 * transaction — escrowing at most one USDC in AxonProtocolV2 on Arc — and Privy
 * refuses to sign anything else. So posting a bounty works, and asking the same
 * wallet to send its USDC anywhere else is refused before a signature exists.
 *
 * Everything on this page is live: the policy is read back from Privy, the
 * balance and the bounties from Arc.
 */

type Rule = {
  name: string;
  method: string;
  action: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
};
type LabState = {
  wallet: { id: string; address: `0x${string}` };
  balanceWei: string;
  limitWei: string;
  chainId: number;
  policy: { id: string; name: string; rules: Rule[] };
};
type Outcome =
  | { kind: "posted"; taskId: number; hash: string; escrowWei: string }
  | { kind: "refused"; message: string; code: string }
  | { kind: "signed"; hash: string }
  | { kind: "error"; message: string };

const usdc = (wei: string | bigint) => `${Number(formatEther(BigInt(wei))).toLocaleString("en-GB", { maximumFractionDigits: 4 })} USDC`;
const short = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`;

function describe(c: Rule["conditions"][number]): string {
  const op = { eq: "is", neq: "is not", lt: "<", lte: "≤", gt: ">", gte: "≥", in: "is one of" }[c.operator] ?? c.operator;
  if (c.field === "value") return `value ${op} ${usdc(String(c.value))}`;
  if (c.field === "chain_id") return `chain ${op} ${c.value === String(appChain.id) ? `${appChain.name} (${appChain.id})` : String(c.value)}`;
  if (c.field === "to") {
    const v = String(c.value);
    return `to ${op} ${v.toLowerCase() === AXON_ADDRESS.toLowerCase() ? "AxonProtocolV2" : short(v)}`;
  }
  return `${c.field} ${op} ${String(c.value)}`;
}

async function act(payload: object): Promise<Outcome> {
  const r = await fetch("/api/lab", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const b = await r.json();
  if (b.refused === true) return { kind: "refused", message: b.message, code: b.code };
  if (!r.ok) return { kind: "error", message: b.error ?? `the lab answered ${r.status}` };
  if (typeof b.taskId === "number") return { kind: "posted", taskId: b.taskId, hash: b.hash, escrowWei: b.escrowWei };
  return { kind: "signed", hash: b.hash };
}

const field = "border border-scribe-3 bg-transparent px-3 py-2 font-mono text-[13px] text-scribe outline-none focus:border-signal";
const label = "font-mono text-[11px] uppercase tracking-[0.12em] text-scribe-3";
const button =
  "border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 " +
  "transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60";

export default function LabPage() {
  const { tasks, refetch } = useTaskCatalogue();
  const [lab, setLab] = useState<LabState | { error: string } | null>(null);

  const [name, setName] = useState("Lab bounty: put the pen on the closed laptop");
  const [slots, setSlots] = useState(2);
  const [reward, setReward] = useState(0.1);
  const [scenario, setScenario] = useState(2);
  const [difficulty, setDifficulty] = useState(2);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<Outcome | null>(null);

  const [probeTo, setProbeTo] = useState("0x000000000000000000000000000000000000dEaD");
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<Outcome | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/lab");
      const b = await r.json();
      setLab(r.ok ? b : { error: b.error ?? `the lab answered ${r.status}` });
    } catch (e) {
      setLab({ error: String(e) });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function postBounty() {
    if (formProblem) return;
    setPosting(true);
    setPosted(null);
    try {
      const out = await act({ action: "post-bounty", name, slots, rewardUsdc: reward, scenario, difficulty });
      setPosted(out);
      if (out.kind === "posted") {
        refetch();
        void load();
      }
    } catch (e) {
      setPosted({ kind: "error", message: String(e) });
    } finally {
      setPosting(false);
    }
  }

  async function testPolicy() {
    setProbing(true);
    setProbe(null);
    try {
      setProbe(await act({ action: "test-policy", to: probeTo.trim() }));
    } catch (e) {
      setProbe({ kind: "error", message: String(e) });
    } finally {
      setProbing(false);
    }
  }

  const ready = lab && "wallet" in lab ? lab : null;
  const escrow = slots * reward;
  // Checked before anything is sent, with the same limits /api/lab enforces, so
  // a mistyped form says what is wrong instead of costing a request to find out.
  const formProblem =
    name.trim().length < 3 ? "Describe what to record in at least 3 characters."
    : name.length > 96 ? "Keep the description to 96 characters."
    : !Number.isInteger(slots) || slots < 1 || slots > 20 ? "Runs wanted must be a whole number from 1 to 20."
    : !(reward >= 0.01) || reward > 100 ? "Pay per run must be at least 0.01 USDC."
    : !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 ? "Difficulty must be a whole number from 1 to 5."
    : null;
  const ceiling = ready ? Number(formatEther(BigInt(ready.limitWei))) : null;
  const funded = ready ? tasks.filter((t) => t.funder.toLowerCase() === ready.wallet.address.toLowerCase()) : [];

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none">Labs</h1>
      <p className="mt-4 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        A lab pays for demonstrations without anyone holding the key that pays. Its budget sits in a
        Privy wallet whose policy allows one thing: escrowing a bounty in Thenar on {appChain.name}, up to
        a ceiling per transaction. Privy signs that. It refuses to sign anything else, so the budget cannot
        be spent on anything but bounties — by a leaked credential, a bug, or this server.
      </p>

      <DimRule className="mt-10" note="The lab's wallet" />
      {!lab ? (
        <p className="mt-4 text-[14px] text-scribe-3">Reading Privy and {appChain.name}…</p>
      ) : "error" in lab ? (
        <p className="mt-4 text-[14px] text-reject">{lab.error}</p>
      ) : (
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-8 gap-y-2 text-[14px]">
          <dt className={label}>Address</dt>
          <dd>
            <a href={addressUrl(lab.wallet.address)} target="_blank" rel="noreferrer" className="break-all font-mono text-[13px] text-signal hover:text-signal-hi">
              {lab.wallet.address} &rarr;
            </a>
          </dd>
          <dt className={label}>Held by</dt>
          <dd className="text-scribe-2">
            Privy, as server wallet <span className="font-mono text-[13px] text-scribe">{lab.wallet.id}</span>. No key
            for it exists on this machine.
          </dd>
          <dt className={label}>Balance</dt>
          <dd className="font-mono text-[13px] text-scribe">{usdc(lab.balanceWei)}</dd>
        </dl>
      )}

      {ready ? (
        <>
          <DimRule className="mt-10" note="Its policy, as Privy holds it" />
          <p className="mt-4 text-[14px] text-scribe-2">
            <span className="text-scribe">{ready.policy.name}</span>{" "}
            <span className="font-mono text-[12px] text-scribe-3">({ready.policy.id})</span>
          </p>
          <ul className="mt-3 space-y-2">
            {ready.policy.rules.map((r) => (
              <li key={r.name} className="border-l-2 border-signal pl-3 text-[14px] text-scribe-2">
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-go">{r.action}</span>{" "}
                <span className="font-mono text-[13px] text-scribe">{r.method}</span> when{" "}
                {r.conditions.map(describe).join(", and ")}
              </li>
            ))}
            <li className="border-l-2 border-reject pl-3 text-[14px] text-scribe-2">
              <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-reject">Deny</span> everything
              else. A wallet with a policy is refused any request no rule allows.
            </li>
          </ul>
        </>
      ) : null}

      <DimRule className="mt-10" note="Post a bounty from the budget" />
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => { e.preventDefault(); void postBounty(); }}
      >
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={label}>What to record</span>
          <input className={field} value={name} maxLength={96} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Runs wanted</span>
          <input className={field} type="number" min={1} max={20} value={slots} onChange={(e) => setSlots(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Paid per run, USDC</span>
          <input className={field} type="number" min={0.01} step={0.01} value={reward} onChange={(e) => setReward(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Scene</span>
          <select className={field} value={scenario} onChange={(e) => setScenario(Number(e.target.value))}>
            {SCENARIOS.map((s, i) => <option key={s} value={i}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Difficulty</span>
          <input className={field} type="number" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} />
        </label>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <button type="submit" disabled={posting || !ready || formProblem !== null} className={button}>
            {posting ? "Privy is signing…" : `Escrow ${escrow.toLocaleString("en-GB", { maximumFractionDigits: 4 })} USDC`}
          </button>
          {formProblem ? (
            <span className="text-[13px] text-reject">{formProblem}</span>
          ) : ceiling !== null ? (
            <span className={`text-[13px] ${escrow > ceiling ? "text-reject" : "text-scribe-3"}`}>
              {escrow > ceiling
                ? `Over the policy's ${ceiling} USDC ceiling. Privy will refuse to sign it — try it.`
                : `Within the policy's ${ceiling} USDC ceiling.`}
            </span>
          ) : null}
        </div>
      </form>
      <OutcomeLine outcome={posted} />

      <DimRule className="mt-10" note="Try to spend it on something else" />
      <p className="mt-4 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        Ask the same wallet to send one cent of USDC to any address. Nothing in the policy allows it.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-3"
        onSubmit={(e) => { e.preventDefault(); void testPolicy(); }}
      >
        <input className={`${field} min-w-0 flex-1`} value={probeTo} spellCheck={false} aria-label="Recipient address" onChange={(e) => setProbeTo(e.target.value)} />
        <button type="submit" disabled={probing || !ready} className={button}>
          {probing ? "Asking Privy…" : "Send 0.01 USDC"}
        </button>
      </form>
      <OutcomeLine outcome={probe} />

      <DimRule className="mt-10" note="Bounties this budget has funded" />
      {!ready ? null : funded.length === 0 ? (
        <p className="mt-4 text-[14px] text-scribe-2">None yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="font-mono text-[11px] uppercase tracking-[0.12em] text-scribe-3">
                <th className="py-2 pr-4 font-normal">Task</th>
                <th className="py-2 pr-4 font-normal">What</th>
                <th className="py-2 pr-4 font-normal">Per run</th>
                <th className="py-2 pr-4 font-normal">Runs</th>
                <th className="py-2 font-normal">Escrow left</th>
              </tr>
            </thead>
            <tbody>
              {funded.map((t) => (
                <tr key={t.id} className="border-t border-scribe-3/40">
                  <td className="py-2 pr-4 font-mono">
                    <Link href={`/task/${t.id}`} className="text-signal hover:text-signal-hi">#{t.id}</Link>
                  </td>
                  <td className="py-2 pr-4 text-scribe">{t.name}</td>
                  <td className="py-2 pr-4 font-mono text-scribe-2">{usdc(t.rewardWei)}</td>
                  <td className="py-2 pr-4 font-mono text-scribe-2">{t.slotsFilled}/{t.slotsTotal}</td>
                  <td className="py-2 font-mono text-scribe-2">{usdc(t.escrowWei)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-10 max-w-[64ch] text-[13px] leading-relaxed text-scribe-3">
        Anyone who can reach this server can press these buttons. That is the point of the demonstration: the
        policy, not access to the page, is what decides what this wallet can do.
      </p>
    </div>
  );
}

function OutcomeLine({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null;
  if (outcome.kind === "posted") {
    return (
      <p className="mt-3 text-[14px] text-scribe-2">
        <span className="text-go">Signed by Privy, settled on {appChain.name}.</span> Task{" "}
        <Link href={`/task/${outcome.taskId}`} className="font-mono text-signal hover:text-signal-hi">#{outcome.taskId}</Link>{" "}
        holds {usdc(outcome.escrowWei)} ·{" "}
        <a href={txUrl(outcome.hash)} target="_blank" rel="noreferrer" className="font-mono text-signal hover:text-signal-hi">
          {short(outcome.hash)} &rarr;
        </a>
      </p>
    );
  }
  if (outcome.kind === "refused") {
    return (
      <p className="mt-3 text-[14px] text-scribe-2">
        <span className="text-go">Refused by Privy&apos;s policy engine.</span>{" "}
        <span className="font-mono text-[13px] text-scribe">{outcome.code}</span>: {outcome.message}. Nothing was signed.
      </p>
    );
  }
  if (outcome.kind === "signed") {
    return (
      <p className="mt-3 text-[14px] text-reject">
        Privy signed a transaction its policy should have refused:{" "}
        <a href={txUrl(outcome.hash)} target="_blank" rel="noreferrer" className="font-mono underline">{short(outcome.hash)}</a>
      </p>
    );
  }
  return <p className="mt-3 text-[14px] text-reject">{outcome.message}</p>;
}
