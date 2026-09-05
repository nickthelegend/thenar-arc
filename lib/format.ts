/** Measurement formatting. Every figure in Thenar is rendered through here. */

export const fmtInt = (n: number) => n.toLocaleString("en-US");

/** MON is money and money gets a fixed scale, never a floating one. */
export const fmtMon = (n: number, dp = 3) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Scores live on 0..10000 on chain; operators read them as a percentage. */
export const fmtScore = (score: number) => (score / 100).toFixed(2);

export const fmtDeviation = (mm: number) =>
  `${mm >= 0 ? "+" : "−"}${Math.abs(mm).toFixed(1)}`;

export const fmtSeconds = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
};

export const fmtPercent = (f: number, dp = 1) => `${(f * 100).toFixed(dp)}%`;

export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export const SCENARIO_LABEL: Record<string, string> = {
  kitchen: "Kitchen",
  office: "Office",
  bathroom: "Bathroom",
  workshop: "Workshop",
  home: "Home",
  play: "Play",
};
