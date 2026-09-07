"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { appChain, FAUCET_URL, CURRENCY } from "@/lib/chain";
import { useSession } from "@/components/session";

/**
 * The three ways this app can be unusable through no fault of the operator.
 *
 * Each one used to fail silently in its own way: a degraded RPC looked like an
 * empty protocol, an offline tab looked like a broken page, and a wallet on the
 * wrong chain looked like a wallet that would not connect. Naming the condition
 * and offering the one action that fixes it is the difference between a bug
 * report and a two-second recovery.
 *
 * Nothing here is decorative — each band appears only while its condition
 * actually holds, and each is checked against something real.
 */
export function Conditions() {
  const { isConnected } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const s = useSession();

  const [offline, setOffline] = useState(false);
  const [rpcDown, setRpcDown] = useState(false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    // Read the initial state off the effect's synchronous pass.
    const t = setTimeout(
      () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false),
      0,
    );
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // The chain's own health, asked directly rather than inferred from a page
  // that happens to be empty. Two consecutive failures before saying so, since
  // one dropped request is normal on a public endpoint.
  useEffect(() => {
    let misses = 0;
    let live = true;
    const check = async () => {
      try {
        const res = await fetch(appChain.rpcUrls.default.http[0], {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
          signal: AbortSignal.timeout(8000),
        });
        const j = await res.json();
        if (!res.ok || !j?.result) throw new Error("no result");
        misses = 0;
        if (live) setRpcDown(false);
      } catch {
        misses += 1;
        if (live && misses >= 2) setRpcDown(true);
      }
    };
    void check();
    const id = setInterval(check, 30_000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const wrongNetwork = isConnected && s.wrongNetwork;
  const lowGas = s.connected && !s.wrongNetwork && s.balance < 0.001;

  if (!offline && !rpcDown && !wrongNetwork && !lowGas) return null;

  return (
    <div role="status" className="border-b border-rule-strong bg-ink-2">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 font-mono text-[12px]">
        {offline ? (
          <Band tone="reject" label="Offline">
            This browser has no network. Nothing can be read from the chain until it
            comes back; a run already in progress is still recording locally.
          </Band>
        ) : rpcDown ? (
          <Band tone="reject" label="Chain unreachable">
            {appChain.name}&rsquo;s public RPC has not answered twice in a row. The
            contract is fine; this endpoint is not.
          </Band>
        ) : wrongNetwork ? (
          <Band tone="reject" label="Wrong network">
            <span>
              This wallet is on another chain. Thenar settles on {appChain.name}.
            </span>
            <button
              type="button"
              onClick={() => switchChain({ chainId: appChain.id })}
              disabled={isPending}
              className="ml-2 border border-scribe bg-scribe px-2.5 py-1 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-0 transition-colors hover:border-signal-hi hover:bg-signal-hi disabled:opacity-60"
            >
              {isPending ? "Switching…" : `Switch to ${appChain.name}`}
            </button>
          </Band>
        ) : (
          <Band tone="signal" label={`Low on ${CURRENCY}`}>
            <span>Not enough {CURRENCY} to cover gas on a submit.</span>
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-2 text-signal underline underline-offset-2 hover:text-signal-hi"
            >
              Top up from the faucet
            </a>
          </Band>
        )}
      </div>
    </div>
  );
}

function Band({ tone, label, children }: {
  tone: "reject" | "signal"; label: string; children: React.ReactNode;
}) {
  return (
    <>
      <span className={tone === "reject" ? "text-reject" : "text-signal"}>{label}</span>
      <span className="flex flex-wrap items-center gap-y-1 text-scribe-2">{children}</span>
    </>
  );
}
