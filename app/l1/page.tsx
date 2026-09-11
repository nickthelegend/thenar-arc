import type { Metadata } from "next";
import Link from "next/link";
import { DimRule } from "@/components/primitives";
import { L1_CLAIMS, L1_VERDICT } from "@/lib/l1-proof";

export const metadata: Metadata = {
  title: "The L1 — Thenar",
  description:
    "Three claims that need a chain of our own: it issues its own gas token, its operator sets what a run costs, and a policy minted on it is delivered to a second chain by the validators themselves.",
};

/**
 * What a chain of our own buys, and the run that shows it.
 *
 * These three claims sat behind "needs an L1 I cannot fund" for weeks, which
 * turned out to be a premise rather than a fact. The transcript below is the
 * real one — committed at docs/l1-proof.txt, produced by scripts/l1.mjs against
 * a sovereign Avalanche L1 with its own validators, with every figure read back
 * off the chain rather than reported from what was sent.
 *
 * It is a transcript on a page rather than a live panel on purpose. That L1
 * runs on a local network; a visitor cannot reach it, and a page offering a
 * button would be claiming a capability this deployment does not have. What is
 * honestly available is the evidence and the commands that reproduce it.
 */

const WHY: Record<string, string> = {
  "36":
    "A chain that issues its own gas token can pay an operator in the same asset they spend to be paid. On a shared chain those are two different assets, and a newcomer needs the second one before they can ever earn the first — which is the whole reason this product ships a faucet link in its nav.",
  "33":
    "What a run costs is a runtime setting here, not a property of the network. The operator sets the floor and the chain walks its base fee down to it block by block; nobody has to be asked, and no upgrade has to ship.",
  "32":
    "A policy minted on one chain arrives on another carried by the validators themselves. The receiving chain checks a signature over the message, not a bridge operator's promise — so the destination can hold the same task, trajectory count and fee without anyone having been trusted to relay them honestly.",
};

const CHAIN_ID = "88812";

export default function L1Page() {
  return (
    <div className="mx-auto max-w-[900px] px-5 py-10">
      <span className="label">Sovereign L1</span>
      <h1 className="mt-1 font-display text-4xl font-600 leading-none tracking-[-0.01em]">
        Three things that need a chain of our own
      </h1>
      <p className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-scribe-2">
        Thenar settles on Avalanche Fuji, and everything the live product does
        works there. These three do not — they need a chain whose rules we set.
        Each was run against a sovereign Avalanche L1 with real validators, and
        every figure below was read back off that chain rather than reported
        from what was sent to it.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3 font-mono text-[13px]">
        <span>
          <span className="text-scribe-3">Claims</span>{" "}
          <span className="tabular-nums text-scribe">{L1_CLAIMS.length}</span>
        </span>
        <span>
          <span className="text-scribe-3">Chain</span>{" "}
          <span className="tabular-nums text-scribe">{CHAIN_ID}</span>
        </span>
        <span>
          <span className="text-scribe-3">Gas token</span>{" "}
          <span className="text-scribe">THN</span>
        </span>
        {L1_VERDICT ? <span className="text-signal">{L1_VERDICT}</span> : null}
      </div>

      {L1_CLAIMS.map((c) => (
        <section key={c.n} className="mt-8 border-t border-rule pt-5">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[13px] tabular-nums text-signal">{c.n}</span>
            <h2 className="font-display text-lg font-600">{c.title}</h2>
          </div>
          {WHY[c.n] ? (
            <p className="mt-2 max-w-[70ch] text-[14px] leading-relaxed text-scribe-2">
              {WHY[c.n]}
            </p>
          ) : null}
          <pre className="mt-3 overflow-x-auto border border-rule bg-ink-1 p-4 font-mono text-[12px] leading-relaxed text-scribe-2">
            {c.lines.join("\n")}
          </pre>
        </section>
      ))}

      <DimRule className="mt-10" note="What this is not" />
      <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-scribe-2">
        This is a transcript, not a live panel. That L1 runs on a local network
        with its own validators — you cannot reach it from here, and a page
        offering you a button would be claiming something this deployment does
        not have. The commands that reproduce it are in{" "}
        <code className="font-mono text-[13px] text-scribe">l1/README.md</code>,
        including the two things that cost an afternoon to find: the CLI wants{" "}
        <code className="font-mono text-[13px] text-scribe">--use-local-machine</code>{" "}
        together with{" "}
        <code className="font-mono text-[13px] text-scribe">
          --num-bootstrap-validators 1
        </code>{" "}
        (bootstrap endpoints alone convert the subnet but serve no RPC), and the
        relayer account needs THN minted to it before the third claim can deploy
        its receiver.
      </p>
      <p className="mt-4 max-w-[70ch] font-mono text-[12px] leading-relaxed text-scribe-3">
        Everything the live product does settles on Avalanche Fuji. Every
        contract behind it is listed, and read live, at{" "}
        <Link href="/contracts" className="text-signal hover:text-signal-hi">
          /contracts
        </Link>
        .
      </p>
    </div>
  );
}
