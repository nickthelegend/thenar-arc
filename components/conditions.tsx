"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { appChain, RPC_ENDPOINTS, FAUCET_URL, CURRENCY } from "@/lib/chain";
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
  /** How far this machine's clock is from the chain's, in milliseconds. */
  const [skewMs, setSkewMs] = useState<number | null>(null);

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

    /** One endpoint's answer, or null if it did not give one. */
    const ask = async (url: string, method: string, params: unknown[] = []) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(8000),
        });
        const j = await res.json();
        return res.ok && j?.result ? j.result : null;
      } catch {
        return null;
      }
    };

    const check = async () => {
      /**
       * Every endpoint, not the first one.
       *
       * This asked the chain's first declared RPC and nothing else, which was
       * right when the app read from that one endpoint too. It now fails over
       * to two others — so a banner that watched only the primary would
       * announce the chain unreachable while every figure on the page was
       * being read successfully from a secondary. A false alarm on this bar is
       * worse than none: it is the one element that claims to know.
       */
      const answers = await Promise.all(RPC_ENDPOINTS.map((u) => ask(u, "eth_blockNumber")));
      const answeredAt = answers.findIndex((a) => a !== null);
      const reachable = answeredAt >= 0 ? RPC_ENDPOINTS[answeredAt] : null;

      if (reachable === null) {
        misses += 1;
        if (live && misses >= 2) setRpcDown(true);
        return;
      }
      misses = 0;
      if (live) setRpcDown(false);

      /**
       * Whether this machine agrees with the chain about what time it is.
       *
       * Half the figures on this site are times: a task's deadline, how long a
       * sitting has run, whether a proposal's voting has closed. Every one of
       * them compares a chain timestamp with `Date.now()`, and if the two
       * disagree the interface reports the disagreement as fact — a deadline
       * shown as passed that has not, a run timed at the wrong length.
       *
       * The chain is the reference because it is the thing being measured
       * against. Blocks land every couple of seconds here, so a healthy skew is
       * a few seconds; two minutes is a clock nobody set.
       */
      const block = await ask(reachable, "eth_getBlockByNumber", ["latest", false]);
      const ts = block && typeof block === "object" && "timestamp" in block
        ? Number((block as { timestamp: string }).timestamp) * 1000
        : null;
      if (ts && live) setSkewMs(Date.now() - ts);
    };

    void check();
    const id = setInterval(check, 30_000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const wrongNetwork = isConnected && s.wrongNetwork;
  const lowGas = s.connected && !s.wrongNetwork && s.balance < 0.001;
  // Blocks land every couple of seconds, so anything past two minutes is the
  // machine, not the network.
  const skewed = skewMs !== null && Math.abs(skewMs) > 120_000;

  if (!offline && !rpcDown && !wrongNetwork && !lowGas && !skewed) return null;

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
        ) : skewed ? (
          <Band tone="signal" label="Clock is off">
            This machine&rsquo;s clock is{" "}
            {Math.abs(Math.round(skewMs! / 60_000))} minutes{" "}
            {skewMs! > 0 ? "ahead of" : "behind"} {appChain.name}. Deadlines,
            voting windows and run times on this site are all measured against
            the chain, so they will read wrong here until it is corrected.
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
