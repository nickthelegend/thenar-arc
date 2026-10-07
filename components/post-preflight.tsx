"use client";

import Link from "next/link";
import { useAcceptedScores, useObservedCost } from "@/lib/hooks";
import { CURRENCY } from "@/lib/chain";
import { fmtGasCost, fmtMon, fmtScore } from "@/lib/format";

/**
 * What a funder is actually signing.
 *
 * /post priced the escrow to four decimals and stopped there, which answers the
 * smallest of the three questions somebody about to commit money has. The other
 * two were on the chain the whole time and nobody had gone and read them.
 *
 * How much of the escrow gets spent. A run does not pay the reward; it pays the
 * reward scaled by the run's score, so the escrow is a ceiling and not a price.
 * Every accepted run on this deployment is on the chain with its score, so the
 * quote is this deployment's own record rather than a worked example.
 *
 * What happens to the rest. Nothing. AxonProtocol has no refund path: escrow
 * enters through createTask and fundTask, leaves only as a payout, and a task
 * that never fills leaves the remainder in the contract permanently. That is
 * the single most consequential fact about posting a task here and it was
 * written down nowhere a funder would look.
 *
 * And what the transaction itself costs, measured off the six real postings
 * this contract has, at the price the chain is quoting now.
 */
export function PostPreflight({
  slots, rewardMon, days,
}: {
  slots: number;
  rewardMon: number;
  /** Days until the funder may reclaim, or zero for a task that never expires. */
  days: number;
}) {
  const cost = useObservedCost(days > 0 ? "createTaskUntil" : "createTask");
  // The other entry point, so the note below can say what was measured
  // instead of asserting it: a sentence that named "the six tasks here" went
  // on saying six after a seventh was posted.
  const otherKind = days > 0 ? "createTask" : "createTaskUntil";
  const other = useObservedCost(otherKind);
  const { data: accepted } = useAcceptedScores();

  const escrow = slots * rewardMon;
  if (escrow <= 0) return null;

  // Score is 0..10000 on chain, and a payout is reward × score / 10000.
  // Only from runs that exist: with none scored there is no rate to project,
  // and a mean of zero read as one made the whole escrow the "shortfall".
  const mean = accepted && accepted.n > 0 ? accepted.meanScore : null;
  const drawn = mean === null ? null : (escrow * mean) / 10_000;
  const left = drawn === null ? null : escrow - drawn;

  return (
    <div className="mt-4 border border-rule bg-ink-1 px-5 py-4">
      <span className="label">Before you sign</span>

      <ul className="mt-3 flex flex-col gap-3 text-[13px] leading-relaxed text-scribe-2">
        <li>
          <span className="text-scribe">The escrow is a ceiling, not a price.</span>{" "}
          A run is paid the reward scaled by its score, so only a run scoring
          100.00 draws the full {fmtMon(rewardMon, 4)} {CURRENCY}.
          {accepted && accepted.n > 0 && drawn !== null ? (
            <>
              {" "}
              The {accepted.n} accepted {accepted.n === 1 ? "run" : "runs"} on this
              deployment averaged {fmtScore(Math.round(mean!))}; at that rate{" "}
              {slots} filled {slots === 1 ? "slot" : "slots"} would draw about{" "}
              <span className="font-mono tabular-nums text-scribe">
                {fmtMon(drawn, 4)} {CURRENCY}
              </span>{" "}
              of the {fmtMon(escrow, 4)} escrowed.
            </>
          ) : null}
        </li>

        <li>
          {days > 0 ? (
            <>
              <span className="text-scribe">
                What is not drawn comes back to you after the deadline.
              </span>{" "}
              A task with a deadline can be closed by its funder once it passes,
              and{" "}
              <code className="font-mono text-[12px] text-scribe">closeTask</code>{" "}
              returns whatever was never paid out &mdash; including the{" "}
              {left !== null ? (
                <>
                  roughly{" "}
                  <span className="font-mono tabular-nums text-scribe">
                    {fmtMon(left, 4)} {CURRENCY}
                  </span>{" "}
                  of scoring shortfall above
                </>
              ) : (
                "difference between the ceiling and what runs actually score"
              )}
              . Only you, only after the deadline, and only once.
            </>
          ) : (
            <>
              <span className="text-reject">
                With no deadline, what is not drawn stays in the contract for good.
              </span>{" "}
              Escrow enters through{" "}
              <code className="font-mono text-[12px] text-scribe">createTask</code>{" "}
              and{" "}
              <code className="font-mono text-[12px] text-scribe">fundTask</code>,
              and the only other way out is{" "}
              <code className="font-mono text-[12px] text-scribe">closeTask</code>,
              which a task without a deadline can never reach. So a task nobody
              finishes keeps its remainder, and so does the{" "}
              {left !== null ? (
                <>
                  roughly{" "}
                  <span className="font-mono tabular-nums text-scribe">
                    {fmtMon(left, 4)} {CURRENCY}
                  </span>{" "}
                  of scoring shortfall above
                </>
              ) : (
                "difference between the ceiling and what runs actually score"
              )}
              . Set a deadline above if you want it back.
            </>
          )}{" "}
          Read the contract at{" "}
          <Link href="/contracts" className="text-signal hover:text-signal-hi">/contracts</Link>.
        </li>

        {/* Nothing has gone through this entry point yet. The other one may
            have been used, and that is said only when its receipts show it:
            quoting the other function's gas would be quoting a number for a
            call nobody made. */}
        {cost && cost.samples === 0 ? (
          <li>
            <span className="text-scribe">Posting it costs gas too</span>, and
            there is no measured figure for it: no task has yet been created
            through the call this button makes with these settings.
            {other && other.samples > 0 ? (
              <>
                {" "}The tasks measured here were posted with{" "}
                <code className="font-mono text-[12px] text-scribe">{otherKind}</code>,
                and one function&rsquo;s gas is not another&rsquo;s.
              </>
            ) : null}
          </li>
        ) : null}

        {cost && cost.costMon !== null && cost.medianGas !== null ? (
          <li>
            <span className="text-scribe">Posting it costs gas too.</span>{" "}
            About{" "}
            <span className="font-mono tabular-nums text-scribe">
              {fmtGasCost(cost.costMon, CURRENCY)}
            </span>{" "}
            on top of the escrow &mdash; {cost.medianGas.toLocaleString()} gas across{" "}
            {cost.samples} real {cost.samples === 1 ? "posting" : "postings"} of this
            contract, at{" "}
            {Number(cost.gasPriceWei) / 1e9 < 0.001
              ? `${Number(cost.gasPriceWei).toLocaleString()} wei`
              : `${(Number(cost.gasPriceWei) / 1e9).toFixed(2)} gwei`}
            .
          </li>
        ) : null}
      </ul>
    </div>
  );
}
