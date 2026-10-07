import "server-only";
import { ARC_EXTERNAL, USDC } from "@/lib/chain";
import { probeMemo } from "@/lib/memo";
import { arc } from "@/lib/server/arc";

/**
 * Whether the node this server talks to executes Arc's CallFrom precompile,
 * so a call wrapped in Memo runs as its sender. Probed once per process (a
 * failed probe is retried after a minute): Arc testnet and mainnet do; a
 * local Arc fork's RPC does not, and there writes go out plain.
 */
let live: boolean | null = null;
let probedAt = 0;
let probing: Promise<boolean> | null = null;

export async function memoLive(): Promise<boolean> {
  if (live === true) return true;
  if (live === false && Date.now() - probedAt < 60_000) return false;
  probing ??= probeMemo(arc, USDC, ARC_EXTERNAL.memo)
    .then((v) => {
      live = v;
      probedAt = Date.now();
      return v;
    })
    .finally(() => {
      probing = null;
    });
  return probing;
}
