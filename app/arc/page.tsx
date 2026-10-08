"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { DimRule } from "@/components/primitives";
import { ArcFinality } from "@/components/arc-finality";
import { appChain, addressUrl, LOCALNET } from "@/lib/chain";
import { formatUsdc } from "@/lib/usdc";

type Summary = { count: number; average: number | null };
type ArcInfo = {
  network: string;
  chainId: number;
  deployed: boolean;
  contracts: Record<string, string>;
  external: Record<string, string>;
  memo?: { live: boolean };
  verifier?: {
    agentId: string | null; bound: boolean; verdicts: number; written: number;
    reputation: { runVerdict: Summary; corpusQuality: Summary };
  };
  ccip?: { receiver: string; licensesBought: number; pendingTotal: string; owedTotal: string; lanes: { name: string; selector: string }[] };
  x402?: { network: string; asset: string; price: string };
  gateway?: { apiUrl: string; sources: { domain: number; name: string }[] };
  cctp?: { domain: number; destinations: { key: string; name: string; cctpDomain: number }[] };
};

type Row = {
  piece: string;
  does: React.ReactNode;
  where: { label: string; address?: string; href?: string }[];
  live: React.ReactNode;
  verified: string;
};

const a = (x?: string) => (x && /^0x[0-9a-fA-F]{40}$/.test(x) ? x : undefined);

/**
 * The Arc stack, one row per piece: what it does in Thenar, where it lives,
 * a reading taken now, and how it was verified. Nothing on this page is a
 * claim the chain can't back: every live cell comes from /api/arc, which
 * reads Arc when the page asks.
 */
export default function ArcStackPage() {
  const { data, isError, isLoading } = useQuery({
    queryKey: ["arc-info"],
    queryFn: async () => {
      const r = await fetch("/api/arc");
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as ArcInfo;
    },
    refetchInterval: 15_000,
  });

  const C = data?.contracts ?? {};
  const X = data?.external ?? {};
  const v = data?.verifier;
  const reading = (node: React.ReactNode) => (isLoading ? "reading…" : isError ? "unavailable right now" : node);

  const rows: Row[] = [
    {
      piece: "USDC gas, sub-second finality",
      does: "Bounties, payouts, licences and gas are one token. A run is paid in the transaction that records it, and Arc's deterministic finality makes that payout final when the block lands — the station shows the measured time.",
      where: [{ label: "USDC (ERC-20 view, 6 dec)", address: a(X.usdc) }, { label: "ThenarProtocol", address: a(C.protocol) }],
      live: <ArcFinalityLine />,
      verified: "Fork e2e: the operator's USDC balanceOf rises by the payout net of gas in one tx; 17 Arc-fork forge tests on Circle's real USDC.",
    },
    {
      piece: "x402 in USDC",
      does: "An AI agent asks for a task's corpus, is answered 402, signs an EIP-3009 transferWithAuthorization (\"USDC\"/\"2\") and gets the file in the same request. Thenar settles it with an in-process facilitator; every sale goes to SalesLog with the sha256 served.",
      where: [{ label: "GET /api/agent/corpus", href: "/agents" }, { label: "SalesLog", address: a(C.salesLog) }],
      live: reading(data?.x402 ? `${formatUsdc(data.x402.price)} USDC per corpus on ${data.x402.network}` : "—"),
      verified: "Fork e2e: an agent pays over x402 with a real EIP-3009 settlement and SalesLog records it.",
    },
    {
      piece: "ERC-8004",
      does: "The verifier is an agent in Arc's Identity Registry. Every verdict that moved money is written to the Reputation Registry (runVerdict, feedbackHash = run id) by ThenarVerdicts; buyer agents rate it (corpusQuality) and are logged by agent id.",
      where: [{ label: "ThenarVerdicts", address: a(C.verdicts) }, { label: "Reputation Registry", address: a(X.reputationRegistry) }],
      live: reading(v ? (v.agentId ? `agent #${v.agentId} · ${v.written} verdicts written · buyers ${v.reputation.corpusQuality.count}` : "verifier not registered yet") : "—"),
      verified: "Fork tests against Arc testnet's real registries: register, bind, a paid run writes feedback, getSummary reads it back.",
    },
    {
      piece: "Arc Memo",
      does: "A run is submitted through Arc's Memo predeploy with memoId = the run id, so the payout carries what it paid for; the protocol still sees the operator as msg.sender (CallFrom). Where a node doesn't execute CallFrom, the run goes out plain.",
      where: [{ label: "Memo", address: a(X.memo) }],
      live: reading(data?.memo ? (data.memo.live ? "CallFrom answers: runs are tagged" : "CallFrom not executed here: runs go out untagged") : "—"),
      verified: "Fork test with Arc Foundry (--network arc): Memo event with memoId = trajHash, operator paid.",
    },
    {
      piece: "CCTP V2",
      does: "Operators withdraw earnings to Base, Ethereum or Arbitrum from /portfolio: a depositForBurn on Arc, Circle's Iris attests, receiveMessage mints native USDC there.",
      where: [{ label: "TokenMessengerV2", address: a(X.tokenMessengerV2) }],
      live: reading(data?.cctp ? data.cctp.destinations.map((d) => d.name).join(" · ") : "—"),
      verified: "Fork: a real depositForBurn to domain 6. The attestation and the destination mint are user-run (Iris can't attest a fork).",
    },
    {
      piece: "Chainlink CCIP (+ CCTP)",
      does: "A buyer agent on Base or Ethereum licenses a corpus on Arc in one transaction: CCTP moves the USDC to ThenarCcipReceiver, CCIP carries the order, the receiver pays licensePolicyFor and every operator. Allowlisted senders, failed messages kept for retry.",
      where: [{ label: "ThenarCcipReceiver", address: a(C.ccipReceiver) }, { label: "CCIP Router", address: a(X.ccipRouter) }],
      live: reading(data?.ccip ? `${data.ccip.licensesBought} licences bought over CCIP · ${formatUsdc(data.ccip.pendingTotal)} USDC awaiting a mint` : "—"),
      verified: "27 Chainlink Local tests; fork tests against Arc testnet's router (Base Sepolia lane, fee quote, a LICENSE message bought a licence). Live sends are user-run.",
    },
    {
      piece: "Circle Gateway",
      does: "Opt-in (NEXT_PUBLIC_FEATURE_GATEWAY=1): a sponsor's unified USDC balance on another chain funds a bounty — a signed burn intent, Circle attests, gatewayMint on Arc — then the task is posted gaslessly with EIP-3009.",
      where: [{ label: "GatewayMinter", address: a(X.gatewayMinter) }],
      live: reading(data?.gateway ? `${data.gateway.sources.length} source chains` : "—"),
      verified: "Intent building and checks unit-tested; balance read against Circle's live testnet API. A mint needs a funded Gateway balance: user-run, off by default.",
    },
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-10">
      <span className="label">{appChain.name}{LOCALNET ? " · local fork" : ""}</span>
      <h1 className="mt-1 font-display text-4xl font-600 leading-none tracking-[-0.01em]">The Arc stack</h1>
      <p className="mt-4 max-w-[68ch] text-[15px] leading-relaxed text-scribe-2">
        Thenar pays people per robot run and sells what they record to AI agents. On Arc that is one token and one
        transaction: USDC is the escrow, the payout and the gas, a run is final when its block lands, and an agent pays
        for data in the HTTP request that fetches it. The core loop needs only the first two rows; the rest extend it
        across chains and identities, and none of them can stop a run from being paid.
      </p>
      {!data?.deployed && !isLoading ? (
        <p className="mt-3 max-w-[68ch] border-l-2 border-signal pl-3 text-[13px] text-scribe-2">
          Thenar&rsquo;s contracts are not deployed on this network yet, so the readings below are empty.
        </p>
      ) : null}

      <div className="mt-8 flex flex-col">
        {rows.map((r) => (
          <section key={r.piece} className="grid gap-x-8 gap-y-2 border-t border-rule py-5 md:grid-cols-[220px_1fr]">
            <h2 className="font-display text-lg font-600">{r.piece}</h2>
            <div>
              <p className="max-w-[74ch] text-[14px] leading-relaxed text-scribe-2">{r.does}</p>
              <p className="mt-2 font-mono text-[12px] text-signal">{r.live}</p>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] text-scribe-3">
                {r.where.map((w) =>
                  w.address ? (
                    <a key={w.label} href={addressUrl(w.address)} target="_blank" rel="noreferrer" className="hover:text-probe">
                      {w.label} {w.address.slice(0, 8)}… &rarr;
                    </a>
                  ) : w.href ? (
                    <Link key={w.label} href={w.href} className="hover:text-probe">{w.label} &rarr;</Link>
                  ) : (
                    <span key={w.label}>{w.label} (not deployed)</span>
                  ),
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-scribe-3">Verified: {r.verified}</p>
            </div>
          </section>
        ))}
      </div>

      <DimRule className="mt-10" note="Arc, live" />
      <ArcFinality />
    </div>
  );
}

function ArcFinalityLine() {
  return <span>gas and payouts in USDC · final on inclusion</span>;
}
