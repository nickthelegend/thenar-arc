import { NextResponse } from "next/server";
import { hashDomain } from "viem";
import { chainClient } from "@/lib/rpc";
import { AXON_ADDRESS, IS_DEPLOYED, appChain } from "@/lib/chain";
import { AXON_ABI } from "@/lib/abi";
import { countTrajectories, countByChain, ENGINE } from "@/lib/server/db";
import { canonicalShape } from "@/app/api/sign/route";
import { runDomain } from "@/lib/server/verifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const client = chainClient();

/** Everything that has to be true for a run to be recordable. */
export async function GET() {
  // Liveness and audit are answered separately, because they are different
  // questions with different remedies. `checks` is "can this service do its job
  // right now" — the signer, the database, the RPC, the contract. `audit` is
  // "does the historical record hold up", which no restart can change.
  const checks: Record<string, { ok: boolean; detail: string }> = {};
  const audit: Record<string, { ok: boolean; detail: string }> = {};

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
      const b = (await r.json()) as { holdsKey?: boolean; verifier?: string; canonical?: string };
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

      // The signer computes the hash, so the two services agreeing about the
      // canonical form is not a nicety — it is the difference between a
      // corpus that re-derives and one that does not. They were once deployed
      // apart, and every run submitted in that window was stored disagreeing
      // with its own hash while nothing failed loudly.
      const mine = canonicalShape();
      checks.serialisation = {
        ok: b.canonical === mine,
        detail: b.canonical === mine
          ? "signer and web agree on the trajectory format"
          : `signer would hash a run differently from this service (${String(b.canonical).slice(0, 12)} vs ${mine.slice(0, 12)}) — redeploy the older one`,
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
    // Which engine, not just how many rows. The counts are identical either
    // side of a migration, so a cutover that silently did not happen looks
    // exactly like one that did.
    checks.database = { ok: true, detail: `${n} trajectories stored in ${ENGINE}` };
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
      // Not "these two numbers differ" but which direction, because the two
      // directions are entirely different faults. More stored than the chain
      // knows is a ledger claiming payouts that were never made. Fewer is a
      // payout on chain whose trajectory nobody can retrieve — which on a
      // protocol that pays for data is the more serious of the two, and the
      // one worth naming rather than reporting as a mismatch.
      const gap = onchain - stored;

      // A gap is not automatically a loss.
      //
      // A station run writes its artefact and then records it, and its CID is
      // derived from the trajectory hash — "axon:" plus the first sixteen hex
      // of it. Three of the records on this contract were not written that way:
      // their CIDs are "axon:relayed", "axon:prize-deployer" and
      // "axon:prize-buyer", set by a relay and by the prize scripts, and no
      // artefact ever existed for them to lose. Reporting those as retrievable
      // data that has gone missing is a false alarm about the one property this
      // protocol sells, so the two are counted apart. Only read the CIDs when
      // there is something to explain — nine round trips do not belong on the
      // fast path of a health check.
      let unbacked = 0;
      if (gap > 0) {
        const ids = Array.from({ length: onchain }, (_, i) => BigInt(i));
        const records = await Promise.all(ids.map((id) =>
          client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "getTrajectory", args: [id] })
            .catch(() => null)));
        unbacked = records.filter((r) => {
          const rec = r as { cid?: string; trajHash?: string } | null;
          if (!rec?.cid || !rec?.trajHash) return false;
          return rec.cid !== `axon:${rec.trajHash.slice(2, 18)}`;
        }).length;
      }
      // What must hold: every run that was recorded through the station has its
      // artefact. Records written by another path were never station runs.
      const missing = Math.max(0, gap - unbacked);

      audit.ledgerMatchesChain = {
        ok: missing === 0,
        detail:
          gap === 0
            ? `${stored} runs stored, ${onchain} on chain${other ? ` (plus ${other}, not shown)` : ""}`
            : gap > 0
              ? missing === 0
                ? `${stored} station runs stored and all retrievable; ${unbacked} record` +
                  `${unbacked === 1 ? "" : "s"} on chain ${appChain.id} ${unbacked === 1 ? "was" : "were"} ` +
                  `written without an artefact (relay and prize scripts), so ${onchain} on chain is correct`
                : `${missing} station run${missing === 1 ? "" : "s"} paid on chain ${appChain.id} ` +
                  `${missing === 1 ? "has" : "have"} no stored trajectory — the payout is real and the ` +
                  `artefact behind it cannot be retrieved (${stored} stored, ${onchain} on chain, ` +
                  `${unbacked} written without one)`
              : `${-gap} more runs stored than the contract has accepted, which means the ledger ` +
                `is claiming payouts the chain never made (${stored} stored, ${onchain} on chain)`,
      };
    } catch (e) {
      audit.ledgerMatchesChain = { ok: false, detail: e instanceof Error ? e.message : "unreadable" };
    }
  }

  // The status code answers the liveness question only. A historical ledger
  // finding used to set 503, which said "this service cannot serve requests"
  // about a service whose signer, database, RPC and contract were all fine —
  // and, because no restart can change history, it said so permanently. Any
  // uptime monitor pointed here was red for ever and the one signal that should
  // mean "wake someone up" meant nothing. The finding is not hidden: it is
  // reported in full, and `ok` still reflects both.
  const live = Object.values(checks).every((c) => c.ok);
  const clean = Object.values(audit).every((c) => c.ok);
  return NextResponse.json(
    { ok: live && clean, live, checks, audit },
    { status: live ? 200 : 503 },
  );
}
