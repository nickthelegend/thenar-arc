"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DimRule } from "@/components/primitives";
import { useTaskCatalogue } from "@/components/tasks-provider";
import { AXON_ADDRESS, CURRENCY, SCENARIOS, USDC, addressUrl, appChain, txUrl } from "@/lib/chain";
import { readableError } from "@/lib/fetch-error";
import { formatNative, formatUsdc } from "@/lib/usdc";

/**
 * A lab's data budget, in a wallet that can only fund Thenar.
 *
 * Thenar's buyers are robotics labs, and a lab paying for demonstrations has
 * the problem every organisation has with a hot wallet: whoever holds the key
 * can spend the budget on anything. Here the budget sits in a Privy server
 * wallet with a Privy policy attached. The policy allows what posting a bounty
 * takes on Arc (a USDC approval to ThenarProtocol and the createTask call that
 * pulls it, up to a ceiling) and Privy refuses to sign anything else. So
 * posting a bounty works, and asking the same wallet to send its USDC anywhere
 * else is refused before a signature exists.
 *
 * Everything on this page is live: the policy is read back from Privy, the
 * balance and the bounties from Arc. Amounts are USDC: the ERC-20's 6
 * decimals for escrow and ceilings, and 18 for a policy's native `value`
 * condition, which on Arc is the same USDC as gas.
 */

type Rule = {
  name: string;
  method: string;
  action: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
};
type LabState = {
  wallet: { id: string; address: `0x${string}` };
  /** The wallet's USDC, ERC-20 base units (6 decimals). */
  balanceUsdc?: string;
  /** The same balance as the node's native reading (18 decimals), from older servers. */
  balanceWei?: string;
  /** The policy's per-bounty ceiling, USDC base units. */
  limitUsdc?: string;
  limitWei?: string;
  chainId: number;
  policy: { id: string; name: string; rules: Rule[] };
};
type Outcome =
  | { kind: "posted"; taskId: number; hash: string; escrow: bigint }
  | { kind: "refused"; message: string; code: string }
  | { kind: "signed"; hash: string }
  | { kind: "error"; message: string };

/** USDC base units (6 decimals) for display. */
const usdc = (units: string | bigint) => `${Number(formatUsdc(BigInt(units))).toLocaleString("en-GB", { maximumFractionDigits: 6 })} ${CURRENCY}`;
/** A native (18-decimal) amount: on Arc that is USDC too, at gas precision. */
const native = (wei: string | bigint) => `${Number(formatNative(BigInt(wei))).toLocaleString("en-GB", { maximumFractionDigits: 6 })} ${CURRENCY}`;
const balanceOf = (l: LabState) =>
  l.balanceUsdc !== undefined ? usdc(l.balanceUsdc) : l.balanceWei !== undefined ? native(l.balanceWei) : "unknown";
const ceilingOf = (l: LabState): number | null =>
  l.limitUsdc !== undefined ? Number(formatUsdc(BigInt(l.limitUsdc)))
  : l.limitWei !== undefined ? Number(formatNative(BigInt(l.limitWei)))
  : null;
const short = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`;

function describe(c: Rule["conditions"][number]): string {
  const op = { eq: "is", neq: "is not", lt: "<", lte: "≤", gt: ">", gte: "≥", in: "is one of" }[c.operator] ?? c.operator;
  if (c.field === "value") return `native value ${op} ${native(String(c.value))}`;
  if (/amount|escrow/i.test(c.field)) return `${c.field} ${op} ${usdc(String(c.value))}`;
  if (c.field === "chain_id") return `chain ${op} ${c.value === String(appChain.id) ? `${appChain.name} (${appChain.id})` : String(c.value)}`;
  if (c.field === "to" || c.field === "spender") {
    const v = String(c.value);
    const name = v.toLowerCase() === AXON_ADDRESS.toLowerCase() ? "ThenarProtocol" : v.toLowerCase() === USDC.toLowerCase() ? "USDC" : short(v);
    return `${c.field} ${op} ${name}`;
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
  if (typeof b.taskId === "number") {
    return { kind: "posted", taskId: b.taskId, hash: b.hash, escrow: BigInt(b.escrowUsdc ?? b.escrow ?? b.escrowWei ?? 0) };
  }
  return { kind: "signed", hash: b.hash };
}

const field = "border border-scribe-3 bg-transparent px-3 py-2 font-mono text-[13px] text-scribe outline-none focus:border-signal";
const label = "text-[11px] text-scribe-3";
const button =
  "border border-scribe bg-scribe px-4 py-2 text-[12px] text-ink-0" +
  "transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60";

export default function LabPage() {
  const { tasks, refetch } = useTaskCatalogue();
  const [lab, setLab] = useState<LabState | { error: string } | { configured: false; reason: string } | null>(null);

  const [name, setName] = useState("Lab bounty: put the pen on the closed laptop");
  const [slots, setSlots] = useState(2);
  const [reward, setReward] = useState(0.005);
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
      setLab({ error: readableError(e) });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function postBounty() {
    if (formProblem) return;
    setPosting(true);
    setPosted(null);
    try {
      // The reward as a USDC decimal string too, so the server parses it to 6
      // decimals itself rather than trusting a float.
      const out = await act({ action: "post-bounty", name, slots, reward, rewardUsdc: reward.toFixed(6), scenario, difficulty });
      setPosted(out);
      if (out.kind === "posted") {
        refetch();
        void load();
      }
    } catch (e) {
      setPosted({ kind: "error", message: readableError(e) });
    } finally {
      setPosting(false);
    }
  }

  /**
   * Read the catalogue again until it has the task this page just posted.
   *
   * Arc is final on inclusion, but the endpoint answering the catalogue's read
   * can still be a block behind the one that confirmed the transaction, so the
   * list could come back without the task the line above it had just
   * announced. Asked again each second, for at most fifteen, and stopped the
   * moment it is there.
   */
  const postedTaskId = posted?.kind === "posted" ? posted.taskId : null;
  const listed = postedTaskId !== null && tasks.some((t) => t.id === postedTaskId);
  useEffect(() => {
    if (postedTaskId === null || listed) return;
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      refetch();
      if (n >= 15) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [postedTaskId, listed, refetch]);

  async function testPolicy() {
    setProbing(true);
    setProbe(null);
    try {
      setProbe(await act({ action: "test-policy", to: probeTo.trim() }));
    } catch (e) {
      setProbe({ kind: "error", message: readableError(e) });
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
    : !(reward >= 0.001) || reward > 100 ? `Pay per run must be at least 0.001 ${CURRENCY}.`
    : !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5 ? "Difficulty must be a whole number from 1 to 5."
    : null;
  const ceiling = ready ? ceilingOf(ready) : null;
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
      ) : "configured" in lab && lab.configured === false ? (
        <div className="mt-4 border border-rule px-5 py-4" role="status">
          <p className="text-[14px] text-scribe-2">Not configured on this deployment.</p>
          <p className="mt-1 text-[13px] leading-relaxed text-scribe-3">{lab.reason}</p>
        </div>
      ) : !("wallet" in lab) ? (
        <p className="mt-4 text-[14px] text-reject">{"error" in lab ? lab.error : "The lab could not be read."}</p>
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
          <dd className="font-mono text-[13px] text-scribe">{balanceOf(lab)}</dd>
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
                <span className="text-[12px] text-go">{r.action}</span>{" "}
                <span className="font-mono text-[13px] text-scribe">{r.method}</span> when{" "}
                {r.conditions.map(describe).join(", and ")}
              </li>
            ))}
            <li className="border-l-2 border-reject pl-3 text-[14px] text-scribe-2">
              <span className="text-[12px] text-reject">Deny</span> everything
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
          <span className={label}>Paid per run, {CURRENCY}</span>
          <input className={field} type="number" min={0.001} step={0.001} value={reward} onChange={(e) => setReward(Number(e.target.value))} />
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
            {posting ? "Privy is signing…" : `Escrow ${escrow.toLocaleString("en-GB", { maximumFractionDigits: 4 })} ${CURRENCY}`}
          </button>
          {formProblem ? (
            <span className="text-[13px] text-reject">{formProblem}</span>
          ) : ceiling !== null ? (
            <span className={`text-[13px] ${escrow > ceiling ? "text-reject" : "text-scribe-3"}`}>
              {escrow > ceiling
                ? `Over the policy's ${ceiling} ${CURRENCY} ceiling. Privy will refuse to sign it — try it.`
                : `Within the policy's ${ceiling} ${CURRENCY} ceiling.`}
            </span>
          ) : null}
        </div>
      </form>
      <OutcomeLine outcome={posted} />

      <DimRule className="mt-10" note="Try to spend it on something else" />
      <p className="mt-4 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        Ask the same wallet to send 0.01 {CURRENCY} to any address. Nothing in the policy allows it.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-3"
        onSubmit={(e) => { e.preventDefault(); void testPolicy(); }}
      >
        <input className={`${field} min-w-0 flex-1`} value={probeTo} spellCheck={false} aria-label="Recipient address" onChange={(e) => setProbeTo(e.target.value)} />
        <button type="submit" disabled={probing || !ready} className={button}>
          {probing ? "Asking Privy…" : `Send 0.01 ${CURRENCY}`}
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
              <tr className="text-[11px] text-scribe-3">
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
        holds {usdc(outcome.escrow)} ·{" "}
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
