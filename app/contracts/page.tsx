import type { Metadata } from "next";
import Link from "next/link";
import { chainClient } from "@/lib/rpc";
import { appChain, addressUrl, AXON_ADDRESS, CURRENCY, IS_DEPLOYED, txUrl, chainMeta, USDC, LOCALNET } from "@/lib/chain";
import { DEPLOYED, EXTERNAL_CONTRACTS, LIVE_CONTRACTS, SUPERSEDED, type Deployed } from "@/lib/registry";
import {
  CONTRIBUTION_RECORD_ABI, SALES_LOG_ABI, THENAR_CCIP_RECEIVER_ABI, THENAR_VERDICTS_ABI,
} from "@/lib/registry-abi";
import { AXON_ABI } from "@/lib/abi";
import { USDC_ABI, formatUsdc } from "@/lib/usdc";
import { DimRule } from "@/components/primitives";
import { IndexUnavailable, settlementsFor, type Settlement } from "@/lib/arcscan";
import { fmtGasCost } from "@/lib/format";

export const metadata: Metadata = {
  title: "Contracts — Thenar",
  description:
    `Every contract this protocol has deployed on ${appChain.name}, its address, what it does, and the surface that uses it. Read live from chain.`,
};

// Read at request time. A registry that caches is a registry that can be wrong.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const client = chainClient();

/** USDC held (ERC-20, 6 decimals) and code size, for every entry, straight from the node. */
async function presence(rows: Deployed[]) {
  return Promise.all(
    rows.map(async (r) => {
      const [code, balance] = await Promise.all([
        client.getBytecode({ address: r.address }).catch(() => null),
        client.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [r.address] }).catch(() => null) as Promise<bigint | null>,
      ]);
      return { ...r, bytes: code === null ? null : code ? (code.length - 2) / 2 : 0, balance };
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
    safe("protocol", async () => {
      const [tasks, runs, policies, cap] = await Promise.all([
        client.readContract({ address: at("protocol"), abi: AXON_ABI, functionName: "taskCount" }),
        client.readContract({ address: at("protocol"), abi: AXON_ABI, functionName: "trajectoryCount" }),
        client.readContract({ address: at("protocol"), abi: AXON_ABI, functionName: "policyCount" }),
        client.readContract({ address: at("protocol"), abi: AXON_ABI, functionName: "maxTaskEscrow" }),
      ]);
      return [
        ["Tasks", String(tasks)],
        ["Paid runs", String(runs)],
        ["Policies", String(policies)],
        ["Escrow cap per task", `${formatUsdc(cap as bigint)} ${CURRENCY}`],
      ];
    }),
    safe("verdicts", async () => {
      const [agent, verdicts, written, mean] = await Promise.all([
        client.readContract({ address: at("verdicts"), abi: THENAR_VERDICTS_ABI, functionName: "verifierAgent" }),
        client.readContract({ address: at("verdicts"), abi: THENAR_VERDICTS_ABI, functionName: "verdicts" }),
        client.readContract({ address: at("verdicts"), abi: THENAR_VERDICTS_ABI, functionName: "written" }),
        client.readContract({ address: at("verdicts"), abi: THENAR_VERDICTS_ABI, functionName: "meanScore" }),
      ]);
      const [bound, id] = agent as readonly [boolean, bigint];
      return [
        ["Verifier agent (ERC-8004)", bound ? `#${id}` : "not bound yet"],
        ["Verdicts", String(verdicts)],
        ["Written to the Reputation Registry", String(written)],
        ["Mean verdict", `${(Number(mean) / 100).toFixed(2)} / 100`],
      ];
    }),
    safe("sales", async () => {
      const n = await client.readContract({ address: at("sales"), abi: SALES_LOG_ABI, functionName: "saleCount" });
      return [["Sales logged", String(n)]];
    }),
    safe("ccipReceiver", async () => {
      const [bought, pending, owed] = await Promise.all([
        client.readContract({ address: at("ccipReceiver"), abi: THENAR_CCIP_RECEIVER_ABI, functionName: "licensesBought" }),
        client.readContract({ address: at("ccipReceiver"), abi: THENAR_CCIP_RECEIVER_ABI, functionName: "pendingTotal" }),
        client.readContract({ address: at("ccipReceiver"), abi: THENAR_CCIP_RECEIVER_ABI, functionName: "owedTotal" }),
      ]);
      return [
        ["Licences bought over CCIP", String(bought)],
        ["Awaiting the CCTP mint", `${formatUsdc(pending as bigint)} ${CURRENCY}`],
        ["Held for buyers", `${formatUsdc(owed as bigint)} ${CURRENCY}`],
      ];
    }),
  ]);
  return out;
}

export default async function ContractsPage() {
  const [live, prior, reads] = await Promise.all([
    presence(LIVE_CONTRACTS), SUPERSEDED, IS_DEPLOYED ? readings() : Promise.resolve({} as Record<string, [string, string][]>),
  ]);
  const held = live.some(r => r.balance === null) ? null : live.reduce((n, r) => n + Number(formatUsdc(r.balance!)), 0);
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
        <span><span className="text-scribe-3">Held on chain</span> <span className="tabular-nums text-signal">{held === null ? "Unavailable" : held.toFixed(6)}</span> <span className="text-scribe-3">{CURRENCY}</span></span>
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

            {r.arc ? (
              <p className="mt-2 max-w-[74ch] border-l-2 border-signal pl-3 text-[13px] leading-relaxed text-scribe-2">
                <span className="text-[12px] text-signal">Arc</span>{" "}
                {r.arc}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-baseline gap-x-7 gap-y-1 font-mono text-[12px] text-scribe-3">
              <span>{r.bytes === null ? "Code unavailable" : `${r.bytes.toLocaleString("en-GB")} bytes`}</span>
              <span className={r.balance !== null && r.balance > 0n ? "text-signal" : undefined}>
                {r.balance === null ? "Balance unavailable" : `${formatUsdc(r.balance)} ${CURRENCY}`}
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
                    <dt className="text-[12px] text-scribe-3">{k}</dt>
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
        Every transaction sent to the protocol contract, from the Arc
        explorer&rsquo;s index rather than from anything we store &mdash; including the ones that
        reverted, which a ledger of accepted runs by definition cannot show.
        The method is resolved from the selector against the deployed
        contract&rsquo;s own compiler artifact rather than against the pruned ABI
        this interface calls &mdash; which is why{" "}
        <code className="text-scribe-2">submitTrajectoryFor</code> and{" "}
        <code className="text-scribe-2">fundTask</code> appear here by name. They
        are real functions of this contract that no page sends, made by scripts
        and other callers, and against the interface&rsquo;s ABI they read as
        unrecognised selectors.
      </p>
      {IS_DEPLOYED ? <CallLog /> : (
        <p className="mt-4 font-mono text-[13px] text-scribe-3">Nothing is deployed on {appChain.name} yet, so there are no calls to list.</p>
      )}

      <DimRule className="mt-10" note="Circle and Chainlink on Arc" />
      <p className="mt-3 max-w-[74ch] text-[14px] leading-relaxed text-scribe-2">
        The contracts Thenar calls but did not deploy: Circle&rsquo;s USDC (the escrow and the gas), Arc&rsquo;s
        Memo, the ERC-8004 registries, CCTP V2 and Gateway for moving USDC between chains, and Chainlink&rsquo;s CCIP
        router. Only USDC and x402 have been exercised on the public testnet; the rest ran on a fork. <Link href="/arc" className="text-signal hover:text-signal-hi">What each one does here &rarr;</Link>
      </p>
      <ul className="mt-3">
        {EXTERNAL_CONTRACTS.map((r) => (
          <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-6 border-b border-rule py-2.5">
            <span className="text-[14px] text-scribe">{r.name}</span>
            <a href={addressUrl(r.address)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-scribe-3 hover:text-signal">
              {r.address} &rarr;
            </a>
          </li>
        ))}
      </ul>

      <DimRule className="mt-10" note="Superseded" />

      {prior.map((r) => (
        <section key={r.key} className="border-t border-rule py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="font-display text-lg font-600 text-scribe-2">{r.name}</h2>
            <a href={`${chainMeta(r.chainId ?? appChain.id)?.explorer ?? appChain.blockExplorers.default.url}/address/${r.address}`}
               target="_blank" rel="noreferrer"
               className="font-mono text-[12px] text-scribe-3 transition-colors hover:text-scribe">
              {r.address} &rarr;
            </a>
          </div>
          <p className="mt-2 max-w-[74ch] text-[14px] leading-relaxed text-scribe-2">{r.does}</p>
          <div className="mt-3 flex flex-wrap gap-x-7 gap-y-1 font-mono text-[12px] text-scribe-3">
            <span>on {chainMeta(r.chainId ?? appChain.id)?.name ?? appChain.name}</span>
            <span>{r.source}</span>
          </div>
        </section>
      ))}

      <p className="mt-8 max-w-[74ch] font-mono text-[12px] leading-relaxed text-scribe-3">
        Source for every entry is in this repository (<code className="text-scribe-2">contracts/src</code>)
        {LOCALNET ? ", deployed on this machine's Arc fork" : ", verified on the Arc explorer at deployment"}. The ABI the app calls is
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
  let failed: string | null = null;
  try {
    calls = await settlementsFor(AXON_ADDRESS);
  } catch (e) {
    failed = e instanceof IndexUnavailable ? e.message : e instanceof Error ? e.message : "The Arc explorer did not answer.";
  }

  if (failed) {
    return (
      <p className="mt-4 font-mono text-[13px] text-scribe-3">
        {failed} Everything above is read straight
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

  const spent = calls.reduce((n, c) => n + c.fee, 0);
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
              {fmtGasCost(c.fee, CURRENCY)}
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
