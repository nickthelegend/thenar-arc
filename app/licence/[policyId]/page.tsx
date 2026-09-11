"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DimRule } from "@/components/primitives";
import { WarpAttestation } from "@/components/warp-attestation";
import { usePolicies, useCapTable } from "@/lib/hooks";
import { useTaskCatalogue } from "@/components/tasks-provider";
import { addressUrl, AXON_ADDRESS, CURRENCY, appChain } from "@/lib/chain";
import { fmtInt, fmtMon, shortHash } from "@/lib/format";

/**
 * What one licence bought, and who it paid.
 *
 * The foundry is where a licence is purchased; this is the receipt for it — a
 * link a buyer can keep and anyone can open. Every figure is read from the
 * contract at load: the fee, the number sold, the amount distributed, and the
 * cap table it was distributed across. Nothing is stored on our side, so the
 * receipt stays true if this deployment does not.
 */
export default function LicencePage() {
  const { policyId } = useParams<{ policyId: string }>();
  const id = Number(policyId);
  const valid = Number.isInteger(id) && id >= 0;

  const { data: policies, isLoading } = usePolicies();
  const { byId } = useTaskCatalogue();
  const policy = policies?.find((p) => p.id === id);
  const { data: cap } = useCapTable(valid ? id : undefined);
  const task = policy ? byId(policy.taskId) : undefined;

  if (!valid) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">No such licence</h1>
        <p className="mt-2 text-scribe-2">&ldquo;{String(policyId)}&rdquo; is not a policy id.</p>
        <Link href="/foundry" className="mt-6 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em]">
          Back to the foundry
        </Link>
      </div>
    );
  }

  if (isLoading && !policy) {
    return <div className="mx-auto max-w-[900px] px-5 py-16"><span className="label">Reading policy #{id}…</span></div>;
  }

  if (!policy) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center">
        <h1 className="font-display text-3xl">Not minted</h1>
        <p className="mt-2 text-scribe-2">The contract has no policy #{id}.</p>
        <Link href="/foundry" className="mt-6 inline-block border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em]">
          Back to the foundry
        </Link>
      </div>
    );
  }

  const perLicence = cap?.reduce((n, c) => n + c.payoutMon, 0) ?? 0;

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <span className="label">Licence receipt</span>
      <h1 className="mt-1 font-display text-4xl font-600 leading-none tracking-[-0.01em]">
        Policy #{policy.id}
      </h1>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        Everything below is read from the contract when this page loads &mdash; the
        fee, the number sold, the amount already distributed, and the cap table it
        was distributed across. None of it is stored by us, so this receipt still
        resolves if this deployment does not.
      </p>

      {/* Said here because this is the page where someone is looking at a
          licence fee and could reasonably assume they bought a model. A minted
          policy is a cap table over the trajectories that would train one. No
          trained policy exists — PRODUCT.md has always said so, and the
          interface should say it where the money is. */}
      <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
        A minted policy is the cap table over the trajectories that would train a
        model, and the licence buys the corpus behind it. It is not a trained
        model: nothing here autonomously attempts a task.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="From task" value={`#${policy.taskId}`} />
        <Cell label="Trajectories" value={fmtInt(policy.trajectories)} />
        <Cell label="Licence fee" value={`${fmtMon(policy.licenceMon, 3)} ${CURRENCY}`} tone />
        <Cell label="Licences sold" value={fmtInt(policy.licencesSold)} />
      </div>
      <div className="mt-px grid grid-cols-2 gap-px bg-rule sm:grid-cols-4">
        <Cell label="Contributors" value={fmtInt(cap?.length ?? 0)} />
        <Cell label="Distributed" value={`${fmtMon(policy.distributedMon, 4)} ${CURRENCY}`} tone />
        <Cell label="Per licence" value={`${fmtMon(perLicence, 4)} ${CURRENCY}`} />
        <Cell label="Minted" value={new Date(policy.mintedAt).toLocaleDateString()} />
      </div>

      {task ? (
        <p className="mt-4 text-[14px] leading-relaxed text-scribe-3">
          The corpus is every accepted run on{" "}
          <Link href={`/task/${task.id}`} className="text-scribe-2 underline underline-offset-2 hover:text-probe">
            task #{task.id} &mdash; {task.name}
          </Link>
          , recorded in the {task.scene.room.label.toLowerCase()}.{" "}
          <a href={`/api/dataset?taskId=${task.id}`} className="text-signal hover:text-signal-hi">
            Download it &rarr;
          </a>
        </p>
      ) : null}

      <DimRule className="mt-8" note="Who a licence pays" />
      <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
        Weighted by cumulative quality, snapshotted when the policy was minted.
        Every contributor is paid in the same transaction as the purchase &mdash;
        there is no claim step and no schedule.
      </p>

      {!cap?.length ? (
        <p className="mt-4 text-[14px] text-scribe-3">Reading the cap table&hellip;</p>
      ) : (
        <ol className="mt-4">
          {cap.map((c) => (
            <li key={c.address} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-rule py-3">
              <Link href={`/operator/${c.address}`} className="truncate font-mono text-[13px] text-scribe hover:text-signal">
                {shortHash(c.address)}
              </Link>
              <span className="font-mono text-[12px] tabular-nums text-scribe-2">
                {(c.weightBps / 100).toFixed(2)}%
              </span>
              <span className="w-[96px] text-right font-mono text-[13px] tabular-nums text-signal">
                {fmtMon(c.payoutMon, 4)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <WarpAttestation policy={policy} />

      <DimRule className="mt-10" note="What this licence delivers" />
      <p className="mt-4 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        The corpus recorded against task #{policy.taskId} — {fmtInt(policy.trajectories)}{" "}
        {policy.trajectories === 1 ? "trajectory" : "trajectories"} of joint states,
        gripper state and object poses at 20 Hz, as newline-delimited JSON.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a
          href={`/api/dataset?taskId=${policy.taskId}`}
          className="border border-scribe bg-scribe px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi"
        >
          Download the corpus
        </a>
        <a
          href={`/api/dataset/summary?taskId=${policy.taskId}`}
          className="border border-rule-strong px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe"
        >
          Inspect it first
        </a>
      </div>
      <p className="mt-3 max-w-[64ch] font-mono text-[12px] leading-relaxed text-scribe-3">
        The bulk download needs an active subscription on{" "}
        <Link href="/contracts" className="text-signal hover:text-signal-hi">CorpusAccess</Link>{" "}
        and answers 402 without one — it sells time, not rights. The summary is
        open, and so is any single episode by hash, so a buyer can see what they
        would be getting before paying for it.
      </p>

      <p className="mt-8 font-mono text-[12px] text-scribe-3">
        <a href={addressUrl(AXON_ADDRESS)} target="_blank" rel="noreferrer" className="hover:text-probe">
          {appChain.name} · {shortHash(AXON_ADDRESS)} &rarr;
        </a>
      </p>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: boolean }) {
  return (
    <div className="flex flex-col gap-1 bg-ink-1 px-4 py-3">
      <span className="label">{label}</span>
      <span className={`font-mono text-[16px] tabular-nums ${tone ? "text-signal" : "text-scribe"}`}>
        {value}
      </span>
    </div>
  );
}
