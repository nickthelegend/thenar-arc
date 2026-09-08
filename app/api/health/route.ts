import { NextResponse } from "next/server";
import { createPublicClient, http, hashDomain } from "viem";
import { AXON_ADDRESS, IS_DEPLOYED, appChain } from "@/lib/chain";
import { AXON_ABI } from "@/lib/abi";
import { countTrajectories, countByChain } from "@/lib/server/db";
import { runDomain } from "@/lib/server/verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = createPublicClient({ chain: appChain, transport: http() });

/** Everything that has to be true for a run to be recordable. */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // The key lives in the signer service, not here. Two things are worth
  // asserting and they are different: that signing is possible at all, and
  // that it is not possible *here*. Reporting only the first would let the key
  // drift back into the web container without anything noticing.
  const signerOrigin = process.env.SIGNER_ORIGIN;
  if (signerOrigin) {
    checks.keyIsolation = {
      ok: !process.env.VERIFIER_PRIVATE_KEY,
      detail: process.env.VERIFIER_PRIVATE_KEY
        ? "VERIFIER_PRIVATE_KEY is set on the web service; it belongs only to the signer"
        : "the web service holds no signing key",
    };
    try {
      const r = await fetch(`${signerOrigin}/api/sign`, { cache: "no-store" });
      const b = (await r.json()) as { holdsKey?: boolean; verifier?: string };
      const expected = process.env.VERIFIER_ADDRESS?.toLowerCase();
      const same = !expected || b.verifier?.toLowerCase() === expected;
      checks.signer = {
        ok: Boolean(b.holdsKey) && same,
        detail: !b.holdsKey
          ? "the signer service holds no key"
          : same
            ? `signer holds ${b.verifier}`
            : `signer holds ${b.verifier}, expected ${expected}`,
      };
    } catch (e) {
      checks.signer = {
        ok: false,
        detail: `signer unreachable at ${signerOrigin}: ${e instanceof Error ? e.message : "unknown"}`,
      };
    }
  } else {
    checks.verifierKey = {
      ok: Boolean(process.env.VERIFIER_PRIVATE_KEY),
      detail: process.env.VERIFIER_PRIVATE_KEY
        ? "configured in this process (no SIGNER_ORIGIN set)"
        : "VERIFIER_PRIVATE_KEY is not set",
    };
  }

  checks.contract = {
    ok: IS_DEPLOYED,
    detail: IS_DEPLOYED ? AXON_ADDRESS : "NEXT_PUBLIC_AXON_ADDRESS is not set",
  };

  try {
    const n = await countTrajectories();
    checks.database = { ok: true, detail: `${n} trajectories stored` };
  } catch (e) {
    checks.database = { ok: false, detail: e instanceof Error ? e.message : "unreadable" };
  }

  try {
    const block = await client.getBlockNumber();
    checks.rpc = { ok: true, detail: `block ${block}` };
  } catch (e) {
    checks.rpc = { ok: false, detail: e instanceof Error ? e.message : "unreachable" };
  }

  if (IS_DEPLOYED) {
    try {
      const onchainVerifier = await client.readContract({
        address: AXON_ADDRESS, abi: AXON_ABI, functionName: "verifier",
      });
      const expected = process.env.VERIFIER_ADDRESS?.toLowerCase();
      const actual = String(onchainVerifier).toLowerCase();
      checks.verifierMatches = {
        ok: !expected || expected === actual,
        detail: expected === actual ? "server key matches the contract" : `contract expects ${actual}`,
      };
    } catch (e) {
      checks.verifierMatches = { ok: false, detail: e instanceof Error ? e.message : "unreadable" };
    }
  }

  if (IS_DEPLOYED) {
    // A signature is only worth anything if the domain matches the one the
    // contract hashes against. Renaming the product once changed this and every
    // submission started reverting with BadSignature, so it is checked here
    // rather than trusted.
    try {
      const onchain = await client.readContract({
        address: AXON_ADDRESS, abi: AXON_ABI, functionName: "domainSeparator",
      });
      const d = runDomain(appChain.id, AXON_ADDRESS);
      const local = hashDomain({
        domain: { ...d, chainId: BigInt(d.chainId) },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
        },
      });
      checks.signingDomain = {
        ok: local === onchain,
        detail: local === onchain
          ? "signing domain matches the contract"
          : `signing domain ${local} does not match the contract's ${onchain}`,
      };
    } catch (e) {
      checks.signingDomain = { ok: false, detail: e instanceof Error ? e.message : "unreadable" };
    }
  }

  // The number on the feed and the number on the chain have to be the same
  // number. They were not: rows recorded under a previous deployment carried
  // across and were rendered with explorer links the current chain could not
  // resolve. Anything that lets them diverge again should fail this check, not
  // wait to be noticed on the public feed.
  if (IS_DEPLOYED) {
    try {
      const onchain = Number(await client.readContract({
        address: AXON_ADDRESS, abi: AXON_ABI, functionName: "trajectoryCount",
      }));
      const stored = await countTrajectories();
      const other = (await countByChain())
        .filter((r) => r.chain_id !== appChain.id)
        .map((r) => `${r.n} on ${r.chain_id ?? "unresolved"}`)
        .join(", ");
      checks.ledgerMatchesChain = {
        ok: stored === onchain,
        detail: stored === onchain
          ? `${stored} runs stored, ${onchain} on chain${other ? ` (plus ${other}, not shown)` : ""}`
          : `${stored} runs stored for chain ${appChain.id} but the contract reports ${onchain}`,
      };
    } catch (e) {
      checks.ledgerMatchesChain = { ok: false, detail: e instanceof Error ? e.message : "unreadable" };
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
