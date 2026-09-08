/**
 * Driving the arm by saying what to do.
 *
 * This was rejected as "novelty; hurts a precision task", and the second half
 * of that is true of the wrong design. Continuous voice steering would be
 * worse than a pointer at everything a pointer is for. What voice is actually
 * good at is discrete, named commands — and for an operator who cannot use a
 * pointer or hold a key accurately, discrete named commands are the difference
 * between driving the station and not.
 *
 * So the grammar is deliberately small and quantised. Every command is a fixed
 * step or a state change, nothing is continuous, and each one maps to a
 * keystroke that already exists — the voice path drives the same controls the
 * keyboard does rather than a second, subtly different one that could disagree
 * with it about what a run looks like.
 *
 * Recognition happens in the browser. Nothing is recorded, nothing is uploaded
 * by this code, and the transcript never leaves the page.
 */

export type VoiceCommand =
  | { kind: "step"; key: string; times: number }
  | { kind: "grip"; close: boolean }
  | { kind: "stop" };

/** One press is a small move; "a lot" is five of them. Bounded so a misheard
 *  number cannot send the tool across the workspace. */
const MAX_STEPS = 5;

const DIRECTIONS: Record<string, string> = {
  out: "w", forward: "w", further: "w", away: "w",
  in: "s", back: "s", closer: "s", nearer: "s",
  left: "a", right: "d",
  up: "e", higher: "e", raise: "e",
  down: "q", lower: "q",
};

/**
 * Quantities, longest phrase first.
 *
 * Order is load-bearing rather than cosmetic: "a lot" contains "a", so a map
 * iterated in declaration order matched the article and stopped, turning
 * "down a lot" into a single step. Sorted by length at use, so adding a phrase
 * later cannot reintroduce it.
 *
 * Everything above five is recognised and clamped rather than ignored. An
 * operator who says "left eight" has been understood and bounded, which they
 * can see happen; one whose word was not in the map would get a single step
 * and no way to tell why.
 */
const NUMBERS: Record<string, number> = {
  "a lot": MAX_STEPS, "a bit": 1, "a couple": 2, "a few": 3,
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twice: 2,
};

const NUMBER_WORDS = Object.entries(NUMBERS).sort((x, y) => y[0].length - x[0].length);

/**
 * Read one utterance as at most one command.
 *
 * Deliberately unforgiving about ambiguity: an utterance naming two directions
 * is dropped rather than half-obeyed, because a half-obeyed instruction in a
 * measured run is worse than an ignored one — the operator can repeat
 * themselves, but they cannot un-move the tool.
 */
export function parseCommand(raw: string): VoiceCommand | null {
  const text = raw.toLowerCase().trim();
  if (!text) return null;

  if (/\b(stop|halt|wait|cancel)\b/.test(text)) return { kind: "stop" };
  if (/\b(grab|grasp|close|pick(\s+it)?\s*up|take)\b/.test(text)) return { kind: "grip", close: true };
  if (/\b(release|let\s+go|drop|open|place|put\s+it\s+down)\b/.test(text)) return { kind: "grip", close: false };

  const named = Object.keys(DIRECTIONS).filter((d) =>
    new RegExp(`\\b${d}\\b`).test(text),
  );
  // Two directions in one breath is an utterance this grammar cannot honour.
  const keys = new Set(named.map((d) => DIRECTIONS[d]));
  if (keys.size !== 1) return null;

  let times = 1;
  const digit = text.match(/\b(\d{1,2})\b/);
  if (digit) times = Number(digit[1]);
  else {
    for (const [word, n] of NUMBER_WORDS) {
      if (new RegExp(`\\b${word}\\b`).test(text)) { times = n; break; }
    }
  }

  return { kind: "step", key: [...keys][0], times: Math.min(MAX_STEPS, Math.max(1, times)) };
}

/** What the operator can say, for the panel that has to tell them. */
export const VOICE_GRAMMAR: { say: string; does: string }[] = [
  { say: "out / in", does: "Reach further or pull back" },
  { say: "left / right", does: "Swing the arm" },
  { say: "up / down", does: "Raise or lower the tool" },
  { say: "grab / release", does: "Close or open the jaws" },
  { say: "left three", does: "Repeat a step, up to five" },
  { say: "stop", does: "Stop listening" },
];
