import { NextResponse } from "next/server";
import { parseEther } from "viem";
import { logged } from "@/lib/server/log";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";
import { labConfig, labState, postBounty, probePolicy, PolicyRefusal } from "@/lib/server/privy-lab";
import { SCENARIOS } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

const unconfigured = () =>
  NextResponse.json(
    { error: "No Privy lab wallet is configured. Run scripts/privy-lab.mjs, which records it in .env.local." },
    { status: 503 },
  );

/** The lab's wallet, its balance on Arc, and its policy as Privy holds it. */
async function handleGET() {
  const lab = labConfig();
  if (!lab) return unconfigured();
  try {
    return NextResponse.json(await labState(lab));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "the lab could not be read" }, { status: 502 });
  }
}

/**
 * Two things a lab does with its budget.
 *
 * `post-bounty` escrows USDC in a new task, signed by Privy under the policy.
 * The amount is deliberately not checked here against the policy's ceiling:
 * Privy is the control, and a bounty over it is refused by Privy, which is the
 * thing a lab needs to be able to watch happen.
 *
 * `test-policy` asks the wallet to send a cent of USDC to an address of the
 * caller's choosing, which the policy does not allow.
 */
async function handlePOST(req: Request) {
  const lab = labConfig();
  if (!lab) return unconfigured();

  const gate = rateLimit(`lab:${callerKey(req)}`, 6, 60_000);
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Too many requests to the lab's wallet. Wait a moment." },
      { status: 429, headers: { "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) } },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

  try {
    if (body?.action === "post-bounty") {
      const { name, slots, rewardUsdc, scenario, difficulty } = body;
      const days = body.days ?? 7;
      if (typeof name !== "string" || name.trim().length < 3 || name.length > 96) return bad("name must be 3 to 96 characters");
      if (!int(slots, 1, 20)) return bad("slots must be a whole number from 1 to 20");
      if (typeof rewardUsdc !== "number" || !(rewardUsdc >= 0.01) || rewardUsdc > 100) {
        return bad("rewardUsdc must be at least 0.01");
      }
      if (!int(scenario, 0, SCENARIOS.length - 1)) return bad(`scenario must be 0 to ${SCENARIOS.length - 1}`);
      if (!int(difficulty, 1, 5)) return bad("difficulty must be 1 to 5");
      if (!int(days, 1, 60)) return bad("days must be 1 to 60");

      const posted = await postBounty(lab, {
        name: name.trim(),
        slots: slots as number,
        rewardWei: parseEther(rewardUsdc.toFixed(6)),
        scenario: scenario as number,
        difficulty: difficulty as number,
        days: days as number,
      });
      return NextResponse.json({ refused: false, ...posted });
    }

    if (body?.action === "test-policy") {
      const to = body.to;
      if (typeof to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(to)) return bad("to must be an address");
      const hash = await probePolicy(lab, to as `0x${string}`);
      return NextResponse.json({ refused: false, hash, warning: "Privy signed a transfer its policy was meant to refuse." });
    }
  } catch (e) {
    if (e instanceof PolicyRefusal) {
      // 200: the request did what it was for — it asked Privy, and Privy said
      // no. The refusal is the demonstration's answer and the body says so;
      // as a 403 every refusal also logged "Failed to load resource" in the
      // browser console, as if the page had broken.
      return NextResponse.json({ refused: true, by: "privy-policy", code: e.code, message: e.message });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message.split("\n")[0] : "the lab's wallet could not act" },
      { status: 502 },
    );
  }

  return bad("action must be post-bounty or test-policy");
}

export const GET = logged("/api/lab", handleGET);
export const POST = logged("/api/lab", handlePOST);
