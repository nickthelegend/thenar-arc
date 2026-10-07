import { NextResponse } from "next/server";
import {
  ACTIVE_DEPLOYMENT, ARC_EXTERNAL, ARC_NETWORK, CCIP_RECEIVER, IS_DEPLOYED, IS_MAINNET, appChain, isAddress,
} from "@/lib/chain";
import { THENAR_CCIP_RECEIVER_ABI } from "@/lib/registry-abi";
import { gatewayFor } from "@/lib/gateway";
import { ARC_CCTP, CCTP_DESTINATIONS } from "@/lib/cctp";
import { AGENT_CORPUS } from "@/lib/agent-corpus";
import { arc } from "@/lib/server/arc";
import { memoLive } from "@/lib/server/memo";
import { verifierStatus } from "@/lib/server/erc8004";
import { logged } from "@/lib/server/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The CCIP lanes a licence can be bought over, into Arc. Chainlink's CCIP directory. */
const LANES = IS_MAINNET
  ? [{ name: "Ethereum", selector: "5009297550715157269" }, { name: "Base", selector: "15971525489660198786" }]
  : [{ name: "Ethereum Sepolia", selector: "16015286601757825753" }, { name: "Base Sepolia", selector: "10344971235874465080" }];

let cached: { at: number; body: unknown } | null = null;

/**
 * The Arc stack this deployment runs on, live: Thenar's contracts, the Circle
 * and Chainlink ones it calls, whether Memo's CallFrom executes on this node,
 * the verifier as an ERC-8004 agent and its reputation, the CCIP receiver's
 * books, and the x402 / Gateway / CCTP terms. Amount strings are USDC base
 * units (6 decimals). Cached for five seconds.
 */
async function handleGET() {
  if (cached && Date.now() - cached.at < 5_000) return NextResponse.json(cached.body);
  const C = ACTIVE_DEPLOYMENT.contracts;
  const X = ARC_EXTERNAL;
  const g = gatewayFor(IS_MAINNET ? "mainnet" : "testnet");
  const cctpNet = IS_MAINNET ? "mainnet" : "testnet";

  const ccipBooks = isAddress(CCIP_RECEIVER)
    ? Promise.all([
        arc.readContract({ address: CCIP_RECEIVER, abi: THENAR_CCIP_RECEIVER_ABI, functionName: "licensesBought" }),
        arc.readContract({ address: CCIP_RECEIVER, abi: THENAR_CCIP_RECEIVER_ABI, functionName: "pendingTotal" }),
        arc.readContract({ address: CCIP_RECEIVER, abi: THENAR_CCIP_RECEIVER_ABI, functionName: "owedTotal" }),
      ]).catch(() => null)
    : Promise.resolve(null);

  try {
    const [live, verifier, books] = await Promise.all([memoLive(), verifierStatus(), ccipBooks]);
    const body = {
      network: ARC_NETWORK,
      chainId: appChain.id,
      explorer: appChain.blockExplorers.default.url,
      deployed: IS_DEPLOYED,
      contracts: {
        protocol: C.protocol, verdicts: C.verdicts, ccipReceiver: C.ccipReceiver, salesLog: C.salesLog,
        corpusShares: C.corpusShares, corpusManifest: C.corpusManifest, corpusAudit: C.corpusAudit,
        passkeyRegistry: C.passkeyRegistry,
      },
      external: {
        usdc: X.usdc, memo: X.memo, identityRegistry: X.identityRegistry, reputationRegistry: X.reputationRegistry,
        ccipRouter: X.ccipRouter, ccipChainSelector: String(X.ccipChainSelector ?? ""),
        tokenMessengerV2: X.tokenMessengerV2, gatewayWallet: X.gatewayWallet, gatewayMinter: X.gatewayMinter,
      },
      memo: { live },
      verifier: { ...verifier, address: verifier.address ?? "" },
      ccip: {
        receiver: C.ccipReceiver,
        licensesBought: books ? Number(books[0]) : 0,
        pendingTotal: books ? String(books[1]) : "0",
        owedTotal: books ? String(books[2]) : "0",
        lanes: LANES,
      },
      x402: { network: AGENT_CORPUS.network, asset: AGENT_CORPUS.asset, price: AGENT_CORPUS.amount, facilitator: "in-process" as const },
      gateway: { apiUrl: g.apiUrl, sources: g.sources.map((s) => ({ domain: s.domain, name: s.name })) },
      cctp: {
        domain: ARC_CCTP.domain,
        destinations: CCTP_DESTINATIONS[cctpNet].map((d) => ({ key: d.key, name: d.name, cctpDomain: d.cctpDomain })),
      },
    };
    cached = { at: Date.now(), body };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.split("\n")[0] : "Arc could not be read" }, { status: 502 });
  }
}

export const GET = logged("/api/arc", handleGET);
