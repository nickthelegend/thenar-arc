/** Measurement formatting. Every figure in Thenar is rendered through here. */

/**
 * The reader's own locale, for numbers only.
 *
 * Every figure on this site was formatted `en-US`, which is not a neutral
 * choice — it is one locale asserted over every reader. Someone in Berlin
 * reading `0.0478` sees a thousands separator where a decimal point was meant,
 * on a page whose entire subject is exact quantities. That is the part of
 * localisation that is a defect rather than a content project, and it is what
 * is fixed here.
 *
 * The prose stays in English, deliberately and not by omission: translating it
 * would mean rewriting several thousand words of argued copy, and a
 * half-translated interface reads worse than an untranslated one.
 *
 * Resolved once. `undefined` asks Intl for the environment's own locale, which
 * on the server is the host's — so it is pinned to a fixed locale there and
 * only allowed to vary in the browser, or the same figure would render one way
 * in the HTML and another after hydration.
 */
const SERVER_LOCALE = "en-GB";

/**
 * Null until the reader's locale has been adopted deliberately.
 *
 * Reading `navigator.language` directly at call time is the obvious version
 * and it is wrong: the server renders `0.0000` and a browser in Berlin
 * hydrates `0,0000`, which is a mismatch React resolves by throwing away the
 * markup. So the first client render deliberately agrees with the server, and
 * the reader's own locale is adopted one render later by <LocaleReady>.
 */
let adopted: string | null = null;

/** Called once after mount. Returns whether anything actually changed, so the
 *  caller can avoid a re-render for the readers already being served right. */
export function adoptReaderLocale(): boolean {
  const want = typeof navigator === "undefined" ? SERVER_LOCALE : navigator.language || SERVER_LOCALE;
  try {
    // Intl throws on a tag it cannot parse, and a browser reporting something
    // unexpected should get the figures it was already being shown rather than
    // an exception thrown out of a render.
    const same =
      new Intl.NumberFormat(want).format(1234.5) === new Intl.NumberFormat(SERVER_LOCALE).format(1234.5);
    adopted = want;
    return !same;
  } catch {
    adopted = SERVER_LOCALE;
    return false;
  }
}

/** Test seam. The module holds the locale so the formatters can stay plain
 *  functions rather than hooks; this is the only other way to set it. */
export function __setLocale(tag: string | null) {
  adopted = tag;
}

function locale(): string {
  return adopted ?? SERVER_LOCALE;
}

export const fmtInt = (n: number) => n.toLocaleString(locale());

/**
 * Money gets a fixed scale, never a floating one.
 *
 * The digit count is fixed across locales even though the separators are not:
 * a payout shown to three places in one country and two in another would make
 * the same transaction look like two different amounts.
 */
export const fmtMon = (n: number, dp = 3) =>
  n.toLocaleString(locale(), { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Scores live on 0..10000 on chain; operators read them as a percentage. */
export const fmtScore = (score: number) =>
  (score / 100).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDeviation = (mm: number) =>
  `${mm >= 0 ? "+" : "−"}${Math.abs(mm).toLocaleString(locale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;

export const fmtSeconds = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  // Padded on the raw number rather than the localised one: a locale whose
  // decimal mark is a comma still needs two digits before it, and padding the
  // formatted string would count the separator as a digit.
  const secs = r.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${m}:${r < 10 ? "0" : ""}${secs}`;
};

export const fmtPercent = (f: number, dp = 1) =>
  (f).toLocaleString(locale(), { style: "percent", minimumFractionDigits: dp, maximumFractionDigits: dp });

/** A moment, in the reader's own conventions rather than in American order. */
export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(locale(), { year: "numeric", month: "short", day: "numeric" });

export const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString(locale(), {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export const SCENARIO_LABEL: Record<string, string> = {
  kitchen: "Kitchen",
  office: "Office",
  bathroom: "Bathroom",
  workshop: "Workshop",
  home: "Home",
  play: "Play",
};

/**
 * A gas figure at a price the chain is genuinely quoting.
 *
 * Fuji's base fee sits at ten wei when nothing is happening, so a submit that
 * burns six hundred thousand gas costs about ninety-six billionths of a token.
 * `fmtMon` at three decimals renders that as 0.000, which is a zero where there
 * is a real cost — and a product that prints a zero for a number it charged is
 * doing the thing it exists to argue against.
 *
 * So below a thousandth of a token it switches to nAVAX, the unit Avalanche
 * uses for exactly this range and the one a faucet and an explorer both speak.
 */
export const fmtGasCost = (mon: number, symbol: string) => {
  if (mon === 0) return `0 ${symbol}`;
  if (mon < 0.001) {
    // Fuji's base fee bottoms out at ten wei, which puts a submit at a tenth of
    // one nano-token — so two decimals is not detail, it is the whole figure.
    // Below one, keep three digits; above ten, none, because 96 nAVAX and
    // 96.00 nAVAX say the same thing and one of them is harder to read.
    const nano = mon * 1e9;
    const dp = nano < 1 ? 3 : nano < 10 ? 2 : 0;
    return `${nano.toLocaleString(locale(), { maximumFractionDigits: dp })} n${symbol}`;
  }
  return `${fmtMon(mon, 6)} ${symbol}`;
};
