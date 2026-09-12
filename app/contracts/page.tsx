import type { Metadata } from "next";
import Link from "next/link";
import { formatEther } from "viem";
import { chainClient } from "@/lib/rpc";
import { appChain, addressUrl, AXON_ADDRESS, CURRENCY, txUrl } from "@/lib/chain";
import { DEPLOYED, SUPERSEDED, type Deployed } from "@/lib/registry";
import {
  CONTRIBUTION_RECORD_ABI, REFERRALS_ABI, PRIZE_POOL_ABI,
  FOUNDRY_ABI, LICENCE_RECEIPT_ABI,
} from "@/lib/registry-abi";
import { DimRule } from "@/components/primitives";
import { settlementsFor, type Settlement } from "@/lib/glacier";
import { fmtGasCost } from "@/lib/format";

export const metadata: Metadata = {
  title: "Contracts — Thenar",
  description:
    "Every contract this protocol has deployed on Avalanche Fuji, its address, what it does, and the surface that uses it. Read live from chain.",
};

// Read at request time. A registry that caches is a registry that can be wrong.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const client = chainClient();

/** Balance and code size, for every entry, straight from the node. */
async function presence(rows: Deployed[]) {
  return Promise.all(
    rows.map(async (r) => {
      const [code, balance] = await Promise.all([
        client.getBytecode({ address: r.address }).catch(() => null),
        client.getBalance({ address: r.address }).catch(() => 0n),
      ]);
      return { ...r, bytes: code ? (code.length - 2) / 2 : 0, balance };
    }),
  );
}

/**
 * A live reading from a contract that would otherwise only be an address.
 *
 * The point of this page is that nothing on it is a claim — every figure is a
 * call. Where a contract has state worth showing, it is shown; where a call
 * reverts or the contract is not configured yet, that is said rather than
 * hidden behind a dash.
 */
async function readings(): Promise<Record<string, [string, string][]>> {
  const at = (key: string) => DEPLOYED.find((d) => d.key === key)!.address;
  const out: Record<string, [string, string][]> = {};

  const safe = async (key: string, fn: () => Promise<[string, string][]>) => {
    try { out[key] = await fn(); }
    catch (e) { out[key] = [["unreadable", e instanceof Error ? e.message.slice(0, 60) : "call failed"]]; }
  };

  await Promise.all([
    safe("contribution", async () => {
      const [supply, sym, dec] = await Promise.all([
        client.readContract({ address: at("contribution"), abi: CONTRIBUTION_RECORD_ABI, functionName: "totalSupply" }),
        client.readContract({ address: at("contribution"), abi: CONTRIBUTION_RECORD_ABI, functionName: "symbol" }),
        client.readContract({ address: at("contribution"), abi: CONTRIBUTION_RECORD_ABI, functionName: "decimals" }),
      ]);
      const n = Number(supply) / 10 ** Number(dec);
      return [["Work recorded", `${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${sym}`]];
    }),
    safe("referrals", async () => {
      const [bounty, remaining, paidOut, cap] = await Promise.all([
        client.readContract({ address: at("referrals"), abi: REFERRALS_ABI, functionName: "bounty" }),
        client.readContract({ address: at("referrals"), abi: REFERRALS_ABI, functionName: "remaining" }),
        client.readContract({ address: at("referrals"), abi: REFERRALS_ABI, functionName: "paidOut" }),
        client.readContract({ address: at("referrals"), abi: REFERRALS_ABI, functionName: "MAX_PER_REFERRER" }),
      ]);
      return [
        ["Bounty per referral", `${formatEther(bounty as bigint)} ${CURRENCY}`],
        ["Remaining in pot", `${formatEther(remaining as bigint)} ${CURRENCY}`],
        ["Paid out", `${formatEther(paidOut as bigint)} ${CURRENCY}`],
        ["Cap per referrer", String(cap)],
      ];
    }),
    safe("prize", async () => {
      const [taskId, entrants, weight, settled, closesAt] = await Promise.all([
        client.readContract({ address: at("prize"), abi: PRIZE_POOL_ABI, functionName: "taskId" }),
        client.readContract({ address: at("prize"), abi: PRIZE_POOL_ABI, functionName: "entrantCount" }),
        client.readContract({ address: at("prize"), abi: PRIZE_POOL_ABI, functionName: "totalWeight" }),
        client.readContract({ address: at("prize"), abi: PRIZE_POOL_ABI, functionName: "settled" }),
        client.readContract({ address: at("prize"), abi: PRIZE_POOL_ABI, functionName: "closesAt" }),
      ]);
      return [
        ["Funds task", `#${String(taskId)}`],
        ["Entrants", String(entrants)],
        ["Total weight", String(weight)],
        ["Settled", settled ? "yes" : "not yet"],
        ["Closes", new Date(Number(closesAt) * 1000).toISOString().slice(0, 10)],
      ];
    }),
    safe("foundry", async () => {
      const [count, period, minWeight] = await Promise.all([
        client.readContract({ address: at("foundry"), abi: FOUNDRY_ABI, functionName: "proposalCount" }),
        client.readContract({ address: at("foundry"), abi: FOUNDRY_ABI, functionName: "VOTING_PERIOD" }),
        client.readContract({ address: at("foundry"), abi: FOUNDRY_ABI, functionName: "MIN_WEIGHT_TO_PROPOSE" }),
      ]);
      return [
        ["Proposals", String(count)],
        ["Voting period", `${Number(period) / 3600} h`],
        ["Weight to propose", String(minWeight)],
      ];
    }),
    safe("licence", async () => {
      const [format, source] = await Promise.all([
        client.readContract({ address: at("licence"), abi: LICENCE_RECEIPT_ABI, functionName: "FORMAT" }),
        client.readContract({ address: at("licence"), abi: LICENCE_RECEIPT_ABI, functionName: "sourceChain" }),
      ]);
      return [
        ["Warp payload format", String(format)],
        ["Source chain", String(source)],
      ];
    }),
  ]);
  return out;
}

export default async function ContractsPage() {
  const [live, prior, reads] = await Promise.all([
    presence(DEPLOYED), presence(SUPERSEDED), readings(),
  ]);
  const held = live.reduce((n, r) => n + Number(formatEther(r.balance)), 0);
  const dark = live.filter((r) => r.surface === "/contracts").length;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Contracts</h1>
      <p className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-scribe-2">
        Every contract this protocol has deployed on {appChain.name}, what it does, and
        the surface that uses it. Addresses, code size, balances and the readings
        below are called at the moment this page is requested — nothing here is
        copied from a document.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3 font-mono text-[13px]">
        <span><span className="text-scribe-3">Deployed</span> <span className="tabular-nums text-scribe">{live.length}</span></span>
        <span><span className="text-scribe-3">Superseded</span> <span className="tabular-nums text-scribe">{prior.length}</span></span>
        <span><span className="text-scribe-3">Held on chain</span> <span className="tabular-nums text-signal">{held.toFixed(6)}</span> <span className="text-scribe-3">{CURRENCY}</span></span>
        <span><span className="text-scribe-3">Reachable only here</span> <span className="tabular-nums text-scribe">{dark}</span></span>
      </div>

      <div className="mt-8 flex flex-col">
        {live.map((r) => (
          <section key={r.key} className="border-t border-rule py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 className="font-display text-lg font-600">{r.name}</h2>
              <a
                href={addressUrl(r.address)}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[12px] text-signal transition-colors hover:text-signal-hi"
              >
                {r.address} &rarr;
              </a>
            </div>

            <p className="mt-2 max-w-[74ch] text-[14px] leading-relaxed text-scribe-2">{r.does}</p>

            {r.avalanche ? (
              <p className="mt-2 max-w-[74ch] border-l-2 border-signal pl-3 text-[13px] leading-relaxed text-scribe-2">
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-signal">Avalanche</span>{" "}
                {r.avalanche}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-baseline gap-x-7 gap-y-1 font-mono text-[12px] text-scribe-3">
              <span>{r.bytes.toLocaleString("en-GB")} bytes</span>
              <span className={Number(formatEther(r.balance)) > 0 ? "text-signal" : undefined}>
                {formatEther(r.balance)} {CURRENCY}
              </span>
              <span>{r.source}</span>
              <span>
                <span className="text-scribe-3">used by </span>
                <span className="text-scribe-2">{r.surface}</span>
              </span>
            </div>

            {reads[r.key]?.length ? (
              <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 border-t border-rule pt-3">
                {reads[r.key].map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2">
                    <dt className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe-3">{k}</dt>
                    <dd className="m-0 font-mono text-[13px] tabular-nums text-scribe">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        ))}
      </div>

      <DimRule className="mt-10" note="Every write, and what it cost" />
      <p className="mt-3 max-w-[74ch] text-[14px] leading-relaxed text-scribe-2">
        Every transaction sent to the protocol contract, from Avalanche&rsquo;s own
        index rather than from anything we store &mdash; including the ones that
        reverted, which a ledger of accepted runs by definition cannot show.
        The method is resolved from the selector against the deployed
        contract&rsquo;s own compiler artifact rather than against the pruned ABI
        this interface calls &mdash; which is why{" "}
        <code className="text-scribe-2">createTaskUntil</code>,{" "}
        <code className="text-scribe-2">closeTask</code> and{" "}
        <code className="text-scribe-2">submitTrajectoryFor</code> appear here by
        name. They are real functions of this contract that the frontend never
        calls, and against the interface&rsquo;s ABI a third of this history read
        as unrecognised selectors.
      </p>
      <CallLog />

      <DimRule className="mt-10" note="Superseded" />

      {prior.map((r) => (
        <section key={r.key} className="border-t border-rule py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="font-display text-lg font-600 text-scribe-2">{r.name}</h2>
            <a href={addressUrl(r.address)} target="_blank" rel="noreferrer"
               className="font-mono text-[12px] text-scribe-3 transition-colors hover:text-scribe">
              {r.address} &rarr;
            </a>
          </div>
          <p className="mt-2 max-w-[74ch] text-[14px] leading-relaxed text-scribe-2">{r.does}</p>
          <div className="mt-3 flex flex-wrap gap-x-7 gap-y-1 font-mono text-[12px] text-scribe-3">
            <span>{r.bytes.toLocaleString("en-GB")} bytes</span>
            <span className={Number(formatEther(r.balance)) > 0 ? "text-reject" : undefined}>
              {formatEther(r.balance)} {CURRENCY} stranded
            </span>
            <span>{r.source}</span>
          </div>
        </section>
      ))}

      <p className="mt-8 max-w-[74ch] font-mono text-[12px] leading-relaxed text-scribe-3">
        Source for every entry is in this repository and verified on Sourcify as{" "}
        <code className="text-scribe-2">exact_match</code>. The ABI the app calls is
        generated from the compiler&rsquo;s own artifacts by{" "}
        <code className="text-scribe-2">scripts/gen-abi.mjs</code>, so it cannot describe
        a function the deployed contract does not have.{" "}
        <Link href="/api/contract" className="text-signal hover:text-signal-hi">
          /api/contract
        </Link>{" "}
        returns the protocol contract&rsquo;s address, chain and full ABI.
      </p>
    </div>
  );
}

/**
 * Every call this contract has taken, with the gas it burned.
 *
 * The page above proves each contract exists and answers. This says what has
 * actually been done to the main one, in order, with the cost — the audit a
 * reader would otherwise have to assemble from an explorer by hand.
 *
 * Two things it deliberately does not tidy. Reverted calls are listed, because
 * a log that only shows successes is the survivorship filter this project keeps
 * taking out of other surfaces. And a selector the generated ABI does not know
 * is printed as a selector rather than guessed at — which is how the six task
 * postings show up as something other than createTask, and they should, because
 * they are.
 */
async function CallLog() {
  let calls: Settlement[] = [];
  let failed = false;
  try {
    calls = await settlementsFor(AXON_ADDRESS);
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <p className="mt-4 font-mono text-[13px] text-scribe-3">
        Avalanche&rsquo;s index did not answer. Everything above is read straight
        from the node and is unaffected.
      </p>
    );
  }
  if (!calls.length) {
    return (
      <p className="mt-4 font-mono text-[13px] text-scribe-3">
        No calls to this contract in the window the index returns.
      </p>
    );
  }

  const spent = calls.reduce((n, c) => n + c.feeAvax, 0);
  const reverted = calls.filter((c) => !c.succeeded).length;
  const gas = calls.reduce((n, c) => n + c.gasUsed, 0);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3 font-mono text-[13px]">
        <span><span className="text-scribe-3">Calls</span> <span className="tabular-nums text-scribe">{calls.length}</span></span>
        <span><span className="text-scribe-3">Reverted</span> <span className={`tabular-nums ${reverted ? "text-reject" : "text-scribe"}`}>{reverted}</span></span>
        <span><span className="text-scribe-3">Gas</span> <span className="tabular-nums text-scribe">{gas.toLocaleString("en-GB")}</span></span>
        <span><span className="text-scribe-3">Spent</span> <span className="tabular-nums text-signal">{fmtGasCost(spent, CURRENCY)}</span></span>
      </div>

      <ol className="mt-2">
        {calls.map((c) => (
          <li
            key={c.txHash}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-rule py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(4,minmax(76px,auto))]"
          >
            <span className="truncate font-mono text-[13px] text-scribe">{c.method}</span>
            <span className="hidden text-right font-mono text-[12px] tabular-nums text-scribe-3 sm:block">
              {c.blockNumber.toLocaleString("en-GB")}
            </span>
            <span className="hidden text-right font-mono text-[12px] tabular-nums text-scribe-3 sm:block">
              {c.gasUsed.toLocaleString("en-GB")} gas
            </span>
            <span className="hidden text-right font-mono text-[12px] tabular-nums text-scribe-2 sm:block">
              {fmtGasCost(c.feeAvax, CURRENCY)}
            </span>
            <a
              href={txUrl(c.txHash)}
              target="_blank"
              rel="noreferrer"
              className={`text-right font-mono text-[12px] ${c.succeeded ? "text-scribe-3 hover:text-signal" : "text-reject"}`}
            >
              {c.succeeded ? `${c.txHash.slice(0, 10)}\u2026` : "reverted"} &rarr;
            </a>
          </li>
        ))}
      </ol>
    </>
  );
}
