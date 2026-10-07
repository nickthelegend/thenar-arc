/**
 * The AS5600 leader's serial protocol, as thenar-arms' firmware speaks it
 * (so101-mg996r/firmware/thenar, ROLE_LEADER=1).
 *
 * An ESP32 reads six AS5600 magnetic encoders through a TCA9548A, one per
 * joint, fifty times a second, at 115200 baud:
 *
 *   THENAR AS5600 LEADER L1          on boot
 *   RAW r0 … r5                      until calibrated: 12-bit counts
 *   L q0 … q5                        once calibrated: joint angles, degrees
 *   FAULT encoder <n> | joint_range  a sensor that did not answer, or a pose out of range
 *
 * and takes three commands:
 *
 *   ZERO                             the leader is at the home pose: remember it
 *   SIGN <joint> <1|-1>              this joint turns the other way
 *   FORGET                           back to RAW
 *
 * The angles are in the same frame as the station's SO-101 (lib/so101-spec.ts):
 * the same joint order, the same home pose, the same limits, all from the one
 * CAD manifest, so a leader's `L` line is a pose the drawn arm can take as is.
 * The sixth value is the jaw, from the handle's trigger.
 *
 * No imports: tests load this file with Node.
 */
export const LEADER_BAUD = 115200;

/** The pose the leader must be held in when it is zeroed, degrees. */
export const LEADER_HOME = [0, -25, 35, 0, 0, 20] as const;

export const LEADER_JOINTS = ["Base", "Shoulder", "Elbow", "Wrist pitch", "Wrist roll", "Jaw"] as const;

export type LeaderLine =
  | { kind: "joints"; q: number[] }
  | { kind: "raw"; raw: number[] }
  | { kind: "banner"; text: string }
  | { kind: "fault"; text: string }
  | { kind: "info"; text: string };

const numbers = (parts: string[], parse: (s: string) => number) => {
  const v = parts.map(parse);
  return v.length === 6 && v.every(Number.isFinite) ? v : null;
};

/** One line from the leader, or null for a line that is not the leader's. */
export function parseLeaderLine(input: string): LeaderLine | null {
  const line = input.trim();
  if (!line) return null;
  const [head, ...rest] = line.split(/\s+/);
  if (head === "L") {
    const q = numbers(rest, Number);
    return q ? { kind: "joints", q } : null;
  }
  if (head === "RAW") {
    const raw = numbers(rest, (s) => (/^\d+$/.test(s) ? Number(s) : NaN));
    return raw && raw.every((r) => r >= 0 && r < 4096) ? { kind: "raw", raw } : null;
  }
  if (head === "FAULT") return { kind: "fault", text: rest.join(" ") };
  if (line.startsWith("THENAR AS5600 LEADER")) return { kind: "banner", text: line };
  if (/^(ZERO saved|SIGN saved|RAW mode|COMMANDS:)/.test(line)) return { kind: "info", text: line };
  return null;
}

export const leaderCommand = {
  zero: "ZERO",
  forget: "FORGET",
  sign: (joint: number, sign: 1 | -1) => `SIGN ${joint} ${sign}`,
};

/** How old a leader pose may be and still drive the arm, ms. The firmware sends every 20. */
export const LEADER_STALE_MS = 300;
