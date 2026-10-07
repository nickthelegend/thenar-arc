/**
 * The bytes an owner's key signs for one frame sent to a physical SO-101.
 *
 * Shared by the page that signs (components/station/arm-link.tsx) and the
 * relay that checks (scripts/arm-relay.mjs), so the two build it identically.
 * The sequence number and the timestamp make every frame different, so a
 * recorded stream cannot be replayed to the arm.
 */
export function commandMessage(seq: number, ts: number, q: readonly number[]): Uint8Array {
  return new TextEncoder().encode(`thenar-so101-cmd-v1|${seq}|${ts}|${q.map((v) => v.toFixed(2)).join(",")}`);
}

export const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
