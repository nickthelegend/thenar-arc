/**
 * A task scanned from a real table.
 *
 * The camera measures where the object to move and the object to put it on
 * actually stand, in millimetres in the arm's own frame, and those two points
 * travel in the task's name on chain: "Put the cup on the coaster
 * [scan 202,38 > 288,-66]". The scene stays what tasks-provider says it must
 * be — a pure function of chain state — and the verifier reads the goal from
 * the same name it reads everything else from, so no private table decides
 * where a run had to end.
 *
 * The measurement itself is a homography from a sheet of A4 lying flat in
 * front of the arm: long side pointing away, near edge centred A4_GAP_MM ahead
 * of the base. Four clicks on its corners fix the map from image pixels to
 * table millimetres, exactly, for anything standing on the table plane.
 */
import { REACH_MAX, REACH_MIN } from "./kinematics";
import { armsForTask } from "./skills";

export type ScannedScene = {
  /** Where the object to move starts, metres, arm frame. */
  pick: [number, number];
  /** Where it has to come to rest, metres, arm frame. */
  place: [number, number];
};

const TAG = /\[scan (-?\d{1,4}),(-?\d{1,4}) > (-?\d{1,4}),(-?\d{1,4})\]/;
const ARM_TAG = /\[arm (so101|thenar6)\]/;
const ANY_TAG = /\s*\[(?:scan|arm) [^\]]*\]/g;

/**
 * Which arm a task is for, read from the name for the same reason the scan is.
 *
 * The SO-101 — the MG996R-built arm the team has on its own bench, and one a
 * contributor can own — unless the name says "[arm thenar6]", or the task
 * needs two arms: a pair of SO-101s is not a bench this station models, so a
 * two-arm task stays on the THENAR-6 pair it was written for.
 */
export type ArmKind = "thenar6" | "so101";
export function armOf(name: string): ArmKind {
  const tag = ARM_TAG.exec(name)?.[1] as ArmKind | undefined;
  if (tag) return tag;
  return armsForTask(instructionOf(name)) > 1 ? "thenar6" : "so101";
}
export const ARM_LABEL: Record<ArmKind, string> = { thenar6: "THENAR-6", so101: "SO-101 · MG996R" };

/** The scene a task's name carries, or null for a task that was not scanned. */
export function parseScan(name: string): ScannedScene | null {
  const m = TAG.exec(name);
  if (!m) return null;
  const [px, py, gx, gy] = m.slice(1).map(Number);
  const scene: ScannedScene = { pick: [px / 1000, py / 1000], place: [gx / 1000, gy / 1000] };
  return checkScan(scene) ? null : scene;
}

/** The instruction without its measurement, for surfaces that show a sentence. */
export const instructionOf = (name: string) => name.replace(ANY_TAG, "").trim();

/** A task's name as it goes on chain: the instruction, then its arm, then its
 *  scan. The arm is always written when one was chosen, so what a task is for
 *  never depends on a default that could change. */
export function formatName(instruction: string, opts: { arm?: ArmKind; scan?: ScannedScene | null } = {}): string {
  const mm = (v: number) => Math.round(v * 1000);
  const s = opts.scan;
  return [
    instructionOf(instruction),
    opts.arm ? `[arm ${opts.arm}]` : "",
    s ? `[scan ${mm(s.pick[0])},${mm(s.pick[1])} > ${mm(s.place[0])},${mm(s.place[1])}]` : "",
  ].filter(Boolean).join(" ");
}

/** Add a scan to a name, keeping an arm tag it already had (and adding none). */
export const formatScan = (instruction: string, s: ScannedScene) =>
  formatName(instruction, { arm: ARM_TAG.exec(instruction)?.[1] as ArmKind | undefined, scan: s });

/** Why a scanned scene cannot be a task, or null when it can. */
export function checkScan(s: ScannedScene): string | null {
  for (const [what, p] of [["The object to move", s.pick], ["The target", s.place]] as const) {
    const r = Math.hypot(p[0], p[1]);
    if (r > REACH_MAX) return `${what} is ${Math.round(r * 1000)} mm from the base; the arm reaches ${Math.round(REACH_MAX * 1000)} mm.`;
    if (r < Math.max(REACH_MIN, 0.08)) return `${what} is ${Math.round(r * 1000)} mm from the base, too close to reach.`;
  }
  if (Math.hypot(s.pick[0] - s.place[0], s.pick[1] - s.place[1]) < 0.06) return "The object to move is already on its target.";
  return null;
}

// ---- the sheet -----------------------------------------------------------------

export const A4 = { long: 297, short: 210 } as const;
export const A4_GAP_MM = 90;

export type Pt = { x: number; y: number };

/** The sheet's corners in the arm frame (mm), in the order they are clicked. */
export function sheetCorners(gap = A4_GAP_MM): (Pt & { name: string })[] {
  const h = A4.short / 2;
  return [
    { name: "near left", x: gap, y: h },
    { name: "near right", x: gap, y: -h },
    { name: "far right", x: gap + A4.long, y: -h },
    { name: "far left", x: gap + A4.long, y: h },
  ];
}

function solve(A: number[], b: number[], n: number): number[] {
  A = A.slice();
  b = b.slice();
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (Math.abs(A[p * n + c]) < 1e-12) throw new Error("three of the corners are in a line");
    if (p !== c) {
      for (let k = 0; k < n; k++) [A[c * n + k], A[p * n + k]] = [A[p * n + k], A[c * n + k]];
      [b[c], b[p]] = [b[p], b[c]];
    }
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / A[c * n + c];
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
    x[r] = s / A[r * n + r];
  }
  return x;
}

/** The 3×3 homography (h33 = 1) taking four `from` points onto four `to` points. */
export function homography(from: Pt[], to: Pt[]): number[] {
  if (from.length !== 4 || to.length !== 4) throw new Error("a homography needs four point pairs");
  const A: number[] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push(x, y, 1, 0, 0, 0, -u * x, -u * y);
    b.push(u);
    A.push(0, 0, 0, x, y, 1, -v * x, -v * y);
    b.push(v);
  }
  return [...solve(A, b, 8), 1];
}

/** The inverse of a 3×3 homography, normalised so h33 = 1: table mm back to image pixels. */
export function invert(H: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const m = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
  return m.map((v) => v / m[8]);
}

export function apply(H: number[], { x, y }: Pt): Pt {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

/** Is a clicked quadrilateral a plausible picture of a flat sheet? A sentence when not. */
export function checkQuad(pts: Pt[]): string | null {
  if (pts.length !== 4) return "Click all four corners.";
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], c = pts[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) return "Three of the corners are in a line; click the sheet's four corners.";
    const s = Math.sign(cross);
    if (sign && s !== sign) return "The corners cross over: click them in order, near left, near right, far right, far left.";
    sign = s;
  }
  let area = 0;
  for (let i = 0; i < 4; i++) area += pts[i].x * pts[(i + 1) % 4].y - pts[(i + 1) % 4].x * pts[i].y;
  if (Math.abs(area) / 2 < 400) return "The sheet is too small in the picture; move the camera closer.";
  return null;
}

/** Where an object's box touches the table: the middle of its bottom edge. */
export const footprint = (b: { x: number; y: number; w: number; h: number }): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h });

/**
 * Where the camera stood, in the table's frame (mm), recovered from the sheet.
 *
 * The four corners fix the table→image homography, and with square pixels and
 * the principal point at the image centre that is enough to recover the
 * focal length and the camera's pose (one-view calibration). Null when the
 * view is too square-on to separate them.
 */
export function cameraFrom(H: number[], size: { w: number; h: number }): { x: number; y: number; z: number } | null {
  // Table → image, with the image origin moved to its centre.
  const M = invert(H);
  const cx = size.w / 2, cy = size.h / 2;
  const col = (j: number) => [M[j] - cx * M[6 + j], M[3 + j] - cy * M[6 + j], M[6 + j]];
  const h1 = col(0), h2 = col(1), h3 = col(2);
  // The two constraints on ω = diag(1/f², 1/f², 1), solved together for a = 1/f²:
  // the table's axes are perpendicular (h1ᵀωh2 = 0) and equally long
  // (h1ᵀωh1 = h2ᵀωh2). Either alone is degenerate when a table axis is
  // parallel to the image, which is exactly the square-on view a person takes.
  const A1 = h1[0] * h2[0] + h1[1] * h2[1], B1 = h1[2] * h2[2];
  const A2 = h1[0] ** 2 + h1[1] ** 2 - h2[0] ** 2 - h2[1] ** 2, B2 = h1[2] ** 2 - h2[2] ** 2;
  const a = -(A1 * B1 + A2 * B2) / (A1 * A1 + A2 * A2);
  const f2 = 1 / a;
  if (!(f2 > 0) || !Number.isFinite(f2)) return null;
  const f = Math.sqrt(f2);
  const kinv = (v: number[]) => [v[0] / f, v[1] / f, v[2]];
  const r1 = kinv(h1), r2 = kinv(h2), t = kinv(h3);
  const lam = 1 / Math.hypot(...r1);
  const R1 = r1.map((v) => v * lam), R2 = r2.map((v) => v * lam), T = t.map((v) => v * lam);
  const R3 = [R1[1] * R2[2] - R1[2] * R2[1], R1[2] * R2[0] - R1[0] * R2[2], R1[0] * R2[1] - R1[1] * R2[0]];
  // Camera centre C = −Rᵀ·t, with R's columns R1, R2, R3.
  const C = [0, 1, 2].map((i) => -([R1, R2, R3][i][0] * T[0] + [R1, R2, R3][i][1] * T[1] + [R1, R2, R3][i][2] * T[2]));
  return { x: C[0], y: C[1], z: Math.abs(C[2]) };
}

/**
 * The centre of an object's footprint on the table (mm), from its detection
 * box and the sheet's homography.
 *
 * The bottom of a box is not where the object stands. For a rounded object
 * it is where a ray grazing its front-bottom edge meets the table, which is
 * r·tan(θ/2) short of the centre: r the object's half-width, θ the camera's
 * elevation over it. Measured on a rendered photo with a known layout, the
 * bottom edge put a 98 mm apple 38 mm short. So: the bottom edge's two ends
 * give the width on the table, the sheet gives where the camera is
 * (cameraFrom), and the centre is that offset further from the camera.
 */
export function groundCentre(H: number[], b: { x: number; y: number; w: number; h: number }, size: { w: number; h: number }): Pt {
  const y = b.y + b.h;
  const near = apply(H, { x: b.x + b.w / 2, y });
  const left = apply(H, { x: b.x, y }), right = apply(H, { x: b.x + b.w, y });
  const r = Math.hypot(right.x - left.x, right.y - left.y) / 2;
  const cam = cameraFrom(H, size);
  if (!cam) return near;
  const dx = near.x - cam.x, dy = near.y - cam.y, d = Math.hypot(dx, dy) || 1;
  const off = r * Math.tan(Math.atan2(cam.z, d) / 2);
  return { x: near.x + (dx / d) * off, y: near.y + (dy / d) * off };
}
