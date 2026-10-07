import { sha256, toBytes, type Hex } from "viem";

/**
 * Why an agent bought what it bought, in a form anyone can check.
 *
 * The ledger already proves that an agent paid and what bytes it received.
 * It cannot say why: which model was deciding, what it looked at first, what
 * it was told to find, and whether it checked the file against the chain
 * afterwards. That trail used to scroll past in the agent's terminal and go
 * nowhere.
 *
 * So after each purchase the agent writes it down and signs it with the same
 * key that paid. The server keeps a record only when that key is the sale's
 * buyer, and /agents shows it with the signature checked again in the page.
 * The server cannot write an agent's reasons for it, and an agent cannot
 * attach its reasons to somebody else's purchase.
 *
 * Shared by scripts/qwen-agent.mjs (which signs), the route (which checks
 * and stores) and the page (which checks again).
 */

export type DecisionStep = {
  tool: string;
  args: Record<string, unknown>;
  /** What the tool answered, as the model saw it, cut short. */
  result: string;
  /** ms since the epoch. */
  at: number;
};

export type DecisionRecord = {
  v: 1;
  sale: { tx: Hex; taskId: number };
  buyer: Hex;
  model: { provider: string; name: string; where: string };
  goal: string;
  steps: DecisionStep[];
  /** The model's own closing report. */
  report: string;
  /** The agent's check of its copy against SalesLog, or null if it did not make one. */
  verified: { sha256: string; salesLog: string | null; entry: number | null; matches: boolean } | null;
  /** Atomic units of the payment asset: spent this session, and the cap the code held it to. */
  spent: string;
  budget: string;
  at: number;
};

export const MAX_RECORD_BYTES = 32_000;
export const MAX_STEPS = 24;

/** JSON with every object's keys sorted, so one record always has one digest. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
}

export const recordDigest = (r: DecisionRecord): Hex => sha256(toBytes(canonical(r)));

/** What the agent signs (EIP-191): readable in a wallet, and bound to one sale and one record. */
export const decisionMessage = (r: DecisionRecord) =>
  `Thenar agent decision record\nsale ${r.sale.tx.toLowerCase()}\ndigest ${recordDigest(r)}`;

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max;

/** Why a value is not a decision record, or null when it is one. */
export function recordProblem(r: unknown): string | null {
  if (!r || typeof r !== "object") return "the record is not an object";
  const x = r as Partial<DecisionRecord>;
  if (x.v !== 1) return "unknown record version";
  if (!x.sale || !HEX32.test(String(x.sale.tx)) || !Number.isInteger(x.sale.taskId) || x.sale.taskId < 0) return "sale must name a transaction hash and a task id";
  if (!ADDR.test(String(x.buyer))) return "buyer must be an address";
  if (!x.model || !str(x.model.provider, 40) || !str(x.model.name, 120) || !str(x.model.where, 200)) return "model must name its provider, name and where it ran";
  if (!str(x.goal, 2000) || !str(x.report, 4000)) return "goal and report must be text";
  if (!Array.isArray(x.steps) || x.steps.length > MAX_STEPS) return `steps must be a list of at most ${MAX_STEPS}`;
  for (const s of x.steps) {
    if (!s || !str(s.tool, 60) || !str(s.result, 2000) || typeof s.args !== "object" || !Number.isFinite(s.at)) return "every step needs a tool, its args, its result and a time";
  }
  if (x.verified !== null && (typeof x.verified !== "object" || typeof x.verified.matches !== "boolean" || !str(x.verified.sha256, 80))) return "verified must be null or a check with a result";
  if (!/^\d{1,30}$/.test(String(x.spent)) || !/^\d{1,30}$/.test(String(x.budget))) return "spent and budget are atomic amounts";
  if (!Number.isFinite(x.at)) return "at must be a time";
  if (canonical(x).length > MAX_RECORD_BYTES) return `the record is larger than ${MAX_RECORD_BYTES} bytes`;
  return null;
}
