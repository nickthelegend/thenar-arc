import {
  ACCEPT_FLOOR, TOLERANCE_MM, JERK_FLOOR, JERK_CEIL,
  W_PLACEMENT, W_EFFICIENCY, W_SMOOTHNESS,
  REGRASP_PENALTY, REGRASP_PENALTY_CAP, ORDER_PENALTY, GRIP_CLOSED_MM,
} from "@/lib/score";
import { CURRENCY, appChain, AXON_ADDRESS } from "@/lib/chain";

/**
 * Answers, computed rather than written.
 *
 * A chatbot helper was rejected because nothing here needs conversation, and
 * that is still true. What an operator actually asks is not open-ended — "why
 * did my run pay nothing", "how close is close enough", "what is the cap" —
 * and every one of those has an exact answer that already exists as a constant
 * or a live reading.
 *
 * So this answers from those, and only from those. There is no model, nothing
 * is generated, and every answer names where its number came from. That is not
 * a smaller version of a chatbot; for questions with exact answers it is a
 * better one, because a language model asked "what is the tolerance" will
 * produce a plausible number and this produces the one the scorer uses.
 *
 * A question it cannot answer exactly gets told so, rather than approximated.
 */

export type Answer = {
  question: string;
  answer: string;
  /** Where the figure comes from, so it can be checked rather than believed. */
  source: string;
};

/** Matched loosely on words, because an operator types "how close" not a key. */
type Entry = { match: RegExp; question: string; answer: () => string; source: string };

const pct = (w: number) => `${Math.round(w * 100)}%`;

const ENTRIES: Entry[] = [
  {
    match: /toleran|how close|accurate|mm|millim|datum|band/i,
    question: "How close does the payload have to be?",
    answer: () =>
      `Within ±${TOLERANCE_MM} mm of the datum, measured where it comes to rest — not where it passes through. ` +
      `Placement is ${pct(W_PLACEMENT)} of the score and falls off linearly across that band, so ${TOLERANCE_MM} mm away scores zero for placement and dead centre scores full marks.`,
    source: "TOLERANCE_MM and W_PLACEMENT in lib/score.ts, the same constants the verifier scores with",
  },
  {
    match: /pay noth|score.*zero|below|floor|reject|why.*fail|not paid/i,
    question: "Why did my run pay nothing?",
    answer: () =>
      `A run pays nothing below ${(ACCEPT_FLOOR / 100).toFixed(0)} out of 100. Two things send a score there: the payload coming to rest outside the ±${TOLERANCE_MM} mm band, which zeroes every term at once, or a run that never settled at all. ` +
      `The run page breaks down which term lost the points and what they were worth.`,
    source: "ACCEPT_FLOOR in lib/score.ts; the contract refuses a lower score with ScoreTooLow()",
  },
  {
    match: /score|graded|weight|smooth|efficien|jerk/i,
    question: "How is a run scored?",
    answer: () =>
      `Three terms: placement ${pct(W_PLACEMENT)}, smoothness ${pct(W_SMOOTHNESS)}, efficiency ${pct(W_EFFICIENCY)}. ` +
      `Smoothness is the mean jerk of the payload's path — full marks at or below ${JERK_FLOOR} m/s³ and none at or above ${JERK_CEIL}. ` +
      `Efficiency is your time against the task's par. The server re-scores every run with the same function the browser used, and signs the result; the contract will not pay a score it did not sign.`,
    source: "W_PLACEMENT, W_SMOOTHNESS, W_EFFICIENCY, JERK_FLOOR and JERK_CEIL in lib/score.ts",
  },
  {
    match: /regrasp|re-grasp|grasp again|pick.*up again|drop.*again|penalt/i,
    question: "Does re-grasping cost me?",
    answer: () =>
      `Yes, ${pct(REGRASP_PENALTY)} of the final score for every grasp after the first, capped at ${pct(REGRASP_PENALTY_CAP)} however many times it happens. ` +
      `It is derived from the recording rather than reported — the jaws are counted as holding below ${GRIP_CLOSED_MM} mm — so the verifier reaches the same number from the same samples. ` +
      `Putting the payload down to line it up again is often the right call; it just makes the trajectory worth less as training data.`,
    source: "REGRASP_PENALTY, REGRASP_PENALTY_CAP and graspCount() in lib/score.ts",
  },
  {
    match: /order|two object|both object|second payload|sequence/i,
    question: "What if a task has two objects?",
    answer: () =>
      `Place them in the order the instruction names them. Doing it the other way round still records and still pays, at ${pct(ORDER_PENALTY)} less: a recording that reverses the sequence teaches the wrong task. ` +
      `Which was placed first is derived from the samples — whichever object stops moving first — so the verifier reaches it independently.`,
    source: "ORDER_PENALTY and placedInOrder() in lib/score.ts",
  },
  {
    match: /how much|paid|earn|reward|money|usdc/i,
    question: "What does a run pay?",
    answer: () =>
      `The task's own rate, scaled by your score: a perfect run pays the full rate, a run at 80 pays four fifths of it. Every task's rate is on its page and in the contract. ` +
      `Payment is in ${CURRENCY} on ${appChain.name}, transferred in the same call that records the trajectory — there is no claim step and no separate signing step.`,
    source: `submitTrajectory in the contract at ${AXON_ADDRESS}`,
  },
  {
    match: /cap|how many runs|limit|5 runs|five runs/i,
    question: "How many runs can I do on one task?",
    answer: () =>
      "Five per address per task. Beyond that the contract refuses with CapReached, and the station offers the run as practice instead — same scene, same measurement, nothing submitted.",
    source: "RUNS_PER_ACCOUNT in the contract",
  },
  {
    match: /gas|cost me|fee|expensive/i,
    question: "What does it cost me to submit?",
    answer: () =>
      `Gas on ${appChain.name}, which on this network has been a small fraction of what a run pays — the run page shows the gas actually paid against the ${CURRENCY} earned, per run, from the receipt. ` +
      "A task can also be funded so a relayer pays the gas, in which case submitting costs you nothing.",
    source: "the transaction receipt for your own run, shown on its page",
  },
  {
    match: /practice|practise|free|try|without.*wallet/i,
    question: "Can I try it without a wallet?",
    answer: () =>
      "Yes. Practice runs need no wallet and consume no slot — the scene, the controls and the measurement are identical, you are just not asked to sign at the end. A first-time operator is offered one before their first paid attempt.",
    source: "the station's practice mode",
  },
];

/**
 * The best exact answer, or an honest refusal.
 *
 * Deliberately returns one answer rather than a ranked list: a helper that
 * offers three possible answers to a factual question has not answered it.
 */
export function ask(question: string): Answer | null {
  const q = question.trim();
  if (q.length < 3) return null;
  for (const e of ENTRIES) {
    if (e.match.test(q)) {
      return { question: e.question, answer: e.answer(), source: e.source };
    }
  }
  return null;
}

/** Everything it can answer, for a panel that should show its own limits. */
export function askable(): string[] {
  return ENTRIES.map((e) => e.question);
}
