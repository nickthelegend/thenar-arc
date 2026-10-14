"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { DimRule } from "@/components/primitives";
import { ArcFinality } from "@/components/arc-finality";
import { appChain, addressUrl, LOCALNET, IS_MAINNET } from "@/lib/chain";
import { formatUsdc } from "@/lib/usdc";
import { ARC_STATUS, STATUS_HELP, STATUS_LABEL, type StackStatus } from "@/lib/arc-status";

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
  status: StackStatus;
  does: React.ReactNode;
  where: { label: string; address?: string; href?: string }[];
  live: React.ReactNode;
  verified: string;
};

const a = (x?: string) => (x && /^0x[0-9a-fA-F]{40}$/.test(x) ? x : undefined);

/**
 * The Arc stack, one row per piece: what it does in Thenar, where it lives,
 * a reading taken now, and how it was verified. Every row carries a status
 * (Live on testnet, Fork, or Not run) taken from lib/arc-status.ts, and every
 * reading comes from /api/arc, which reads the chain when the page asks.
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
      status: ARC_STATUS.usdc,
      does: "Bounties, payouts, licences and gas are one token. A run is paid in the transaction that records it, and Arc's deterministic finality makes that payout final when the block lands — the station shows the measured time.",
      where: [{ label: "USDC (ERC-20 view, 6 dec)", address: a(X.usdc) }, { label: "ThenarProtocol", address: a(C.protocol) }],
      live: <ArcFinalityLine />,
      verified: "Live on Arc testnet: the operator's USDC balanceOf rose by the payout in one tx, paid by a relayer (docs/E2E-TESTNET.md). Also 17 Arc-fork forge tests on Circle's real USDC.",
    },
    {
      piece: "x402 in USDC",
      status: ARC_STATUS.x402,
      does: "An AI agent asks for a task's corpus, is answered 402, signs an EIP-3009 transferWithAuthorization (\"USDC\"/\"2\") and gets the file in the same request. Thenar settles it with an in-process facilitator; every sale goes to SalesLog with the sha256 served.",
      where: [{ label: "GET /api/agent/corpus", href: "/agents" }, { label: "SalesLog", address: a(C.salesLog) }],
      live: reading(data?.x402 ? `${formatUsdc(data.x402.price)} USDC per corpus on ${data.x402.network}` : "—"),
      verified: "Live on Arc testnet: an agent paid over x402 with a real EIP-3009 settlement and SalesLog recorded the sha256 (docs/E2E-TESTNET.md). The facilitator is Thenar's own, in process.",
    },
    {
      piece: "ERC-8004",
      status: ARC_STATUS.erc8004,
      does: "Built so the verifier is an agent in Arc's Identity Registry and every verdict that moved money is written to the Reputation Registry (runVerdict, feedbackHash = run id) by ThenarVerdicts; buyer agents can rate it (corpusQuality) and are logged by agent id. The current registration and reputation counts are read below.",
      where: [{ label: "ThenarVerdicts", address: a(C.verdicts) }, { label: "Reputation Registry", address: a(X.reputationRegistry) }],
      live: reading(v ? (v.agentId ? `agent #${v.agentId} · ${v.written} verdicts written · buyers ${v.reputation.corpusQuality.count}` : "verifier not registered yet") : "—"),
      verified: "Fork only: tests on a fork of Arc testnet using its real registries (register, bind, a paid run writes feedback, getSummary reads it back). Not registered or written on the public testnet; the testnet run logs the buyer as not an ERC-8004 agent.",
    },
    {
      piece: "Arc Memo",
      status: ARC_STATUS.memo,
      does: "A run is submitted through Arc's Memo predeploy with memoId = the run id, so the payout carries what it paid for; the protocol still sees the operator as msg.sender (CallFrom). Where a node doesn't execute CallFrom, the run goes out plain.",
      where: [{ label: "Memo", address: a(X.memo) }],
      live: reading(data?.memo ? (data.memo.live ? "CallFrom answers on this node: browser submissions are tagged (earlier scripted proof runs were not)" : "CallFrom not executed here: runs go out untagged") : "—"),
      verified: "Fork only: a fork test with Arc Foundry (--network arc) saw the Memo event with memoId = trajHash. The testnet proof submitted runs directly through a relayer, not through Memo.",
    },
    {
      piece: "CCTP V2",
      status: ARC_STATUS.cctp,
      does: "Operators withdraw earnings to Base, Ethereum or Arbitrum from /portfolio: a depositForBurn on Arc, Circle's Iris attests, receiveMessage mints native USDC there.",
      where: [{ label: "TokenMessengerV2", address: a(X.tokenMessengerV2) }],
      live: reading(data?.cctp ? data.cctp.destinations.map((d) => d.name).join(" · ") : "—"),
      verified: "Fork only: a real depositForBurn to domain 6. The attestation and the destination mint were never run; they need funds on another chain.",
    },
    {
      piece: "Chainlink CCIP (+ CCTP)",
      status: ARC_STATUS.ccip,
      does: "A buyer agent on Base or Ethereum licenses a corpus on Arc in one transaction: CCTP moves the USDC to ThenarCcipReceiver, CCIP carries the order, the receiver pays licensePolicyFor and every operator. Allowlisted senders, failed messages kept for retry.",
      where: [{ label: "ThenarCcipReceiver", address: a(C.ccipReceiver) }, { label: "CCIP Router", address: a(X.ccipRouter) }],
      live: reading(data?.ccip ? `${data.ccip.licensesBought} licences bought over CCIP · ${formatUsdc(data.ccip.pendingTotal)} USDC awaiting a mint` : "—"),
      verified: "Fork only: 27 Chainlink Local tests, and fork tests against Arc testnet's router (Base Sepolia lane, fee quote, a LICENSE message bought a licence). No live send between chains has been made.",
    },
    {
      piece: "Circle Gateway",
      status: ARC_STATUS.gateway,
      does: "Opt-in (NEXT_PUBLIC_FEATURE_GATEWAY=1): a sponsor's unified USDC balance on another chain funds a bounty — a signed burn intent, Circle attests, gatewayMint on Arc — then the task is posted gaslessly with EIP-3009.",
      where: [{ label: "GatewayMinter", address: a(X.gatewayMinter) }],
      live: reading(data?.gateway ? `${data.gateway.sources.length} source chains` : "—"),
      verified: "Not run: intent building is unit-tested and a balance read has been made against Circle's testnet API, but no burn intent was signed or minted. Off by default.",
    },
    {
      piece: "P-256 passkeys",
      status: ARC_STATUS.passkey,
      does: "An operator registers a passkey on chain (PasskeyRegistry). The verifier signs only for admitted addresses, and a passkey-authorised run (submitTrajectoryWithPasskey) is checked by Arc's P-256 precompile at 0x0100.",
      where: [{ label: "PasskeyRegistry", address: a(C.passkeyRegistry) }],
      live: <span>precompile reading on <Link href="/network" className="underline">/network</Link></span>,
      verified: "Fork only: fork tests verify a WebCrypto signature through the precompile and run a passkey-authorised submit. No passkey has been registered on the public testnet; the testnet proof admitted its operator through the issuer instead.",
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
        across chains and identities, and none of them can stop a run from being paid. Configuration and current reads are shown below. Earlier network proofs, local fork checks and untested integrations are kept distinct; a deployed contract alone is not evidence of a completed flow.
      </p>
      {!data?.deployed && !isLoading ? (
        <p className="mt-3 max-w-[68ch] border-l-2 border-signal pl-3 text-[13px] text-scribe-2">
          Thenar&rsquo;s contracts are not deployed on this network yet, so the readings below are empty.
        </p>
      ) : null}

      <div className="mt-8 flex flex-col">
        {rows.map((r) => (
          <section key={r.piece} className="grid gap-x-8 gap-y-2 border-t border-rule py-5 md:grid-cols-[220px_1fr]">
            <div>
              <h2 className="font-display text-lg font-600">{r.piece}</h2>
              <p
                title={STATUS_HELP[r.status]}
                data-testid="arc-status"
                className={`mt-1 inline-block border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${r.status === "live" ? "border-signal text-signal" : "border-rule text-scribe-3"}`}
              >
                {STATUS_LABEL[r.status]}
              </p>
            </div>
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
              <p className="mt-2 text-[12px] leading-relaxed text-scribe-3">Verified: {IS_MAINNET ? "Current mainnet state is shown above. Earlier transaction-flow verification is documented in the repository." : r.verified}</p>
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
