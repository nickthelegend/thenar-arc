"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * What GET /api/arc says about the Arc stack this deployment runs on.
 *
 * One shape, read by /arc, /agents, /licence and /post, so every page that
 * names a piece of the stack shows the same live reading. Amount strings are
 * USDC base units (6 decimals).
 */
export type ArcInfo = {
  network: "testnet" | "mainnet" | "fork";
  chainId: number;
  explorer: string;
  deployed: boolean;
  contracts: {
    protocol: string; verdicts: string; ccipReceiver: string; salesLog: string;
    corpusShares: string; corpusManifest: string; corpusAudit: string; passkeyRegistry: string;
  };
  external: {
    usdc: string; memo: string; identityRegistry: string; reputationRegistry: string;
    ccipRouter: string; ccipChainSelector: string; tokenMessengerV2: string;
    gatewayWallet: string; gatewayMinter: string;
  };
  memo: { live: boolean };
  verifier: {
    address: string;
    agentId: string | null;
    bound: boolean;
    verdicts: number;
    written: number;
    meanScore: number;
    reputation: {
      runVerdict: { count: number; average: number | null };
      corpusQuality: { count: number; average: number | null };
    };
  };
  ccip: {
    receiver: string;
    licensesBought: number;
    pendingTotal: string;
    owedTotal: string;
    lanes: { name: string; selector: string }[];
  };
  x402: { network: string; asset: string; price: string; facilitator: string };
  gateway: { apiUrl: string; sources: { domain: number; name: string }[] };
  cctp: { domain: number; destinations: { key: string; name: string; cctpDomain: number }[] };
};

/** Live, re-read every 15 s. A failure is an error state, never a zero. */
export function useArcInfo() {
  return useQuery({
    queryKey: ["arc-info"],
    refetchInterval: 15_000,
    retry: 1,
    queryFn: async (): Promise<ArcInfo> => {
      const r = await fetch("/api/arc", { headers: { accept: "application/json" } });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error ?? `/api/arc answered ${r.status}`);
      }
      return r.json();
    },
  });
}

/** An address is set (deployments write "" for a contract not deployed yet). */
export const isSet = (a: string | null | undefined): a is `0x${string}` => Boolean(a && /^0x[0-9a-fA-F]{40}$/.test(a));
