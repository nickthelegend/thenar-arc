"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBlockNumber, useBytecode, useReadContract } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { Button } from "@/components/primitives";
import { useSession } from "@/components/session";
import { ACTIVE_DEPLOYMENT, CURRENCY, LOCALNET, LOCAL_RPC, USDC, appChain } from "@/lib/chain";
import { SPONSORED_ACCOUNT, delegationCode, localSponsored, setLocalSponsored } from "@/lib/local-sponsor";

/**
 * The local chain, and the wallet this browser holds on it.
 *
 * Where FAUCET_URL points on a local build: the one place to see which chain
 * the site is on, what is deployed there, and to top up a wallet.
 */
export default function LocalnetPage() {
  const s = useSession();
  const { data: block } = useBlockNumber({ watch: true });
  const { data: usdc, refetch } = useReadContract({
    address: USDC, abi: erc20Abi, functionName: "balanceOf",
    args: s.address ? [s.address] : undefined, query: { enabled: Boolean(s.address && USDC), refetchInterval: 4_000 },
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Read after mount: the setting lives in this browser's storage.
  const [sponsored, setSponsored] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSponsored(localSponsored()), 0);
    return () => clearTimeout(t);
  }, []);
  const { data: code } = useBytecode({
    address: s.address ?? undefined, query: { enabled: Boolean(s.address && SPONSORED_ACCOUNT), refetchInterval: 4_000 },
  });
  const delegated = Boolean(SPONSORED_ACCOUNT && code && code.toLowerCase() === delegationCode(SPONSORED_ACCOUNT));

  if (!LOCALNET) {
    return (
      <div className="mx-auto max-w-[760px] px-5 py-8">
        <h1 className="font-display text-4xl font-600">Local chain</h1>
        <p className="mt-3 text-[15px] text-scribe-2">This build runs on {appChain.name}, not on a local chain.</p>
      </div>
    );
  }

  const fund = async () => {
    if (!s.address) return;
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/localnet/fund", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: s.address, gas: !sponsored }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "The faucet refused.");
      setNote(
        !b.funded ? (sponsored ? "This wallet already has 20 USDC." : "This wallet already has more than 1 MON.")
        : sponsored ? "Sent 20 USDC. The sponsor pays this wallet's gas, so it needs no MON."
        : `Sent 5 ${CURRENCY} and 20 USDC.`,
      );
      void s.refetchBalance(); void refetch();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The faucet did not answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[760px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Local chain</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        This build of Thenar runs on a chain on this machine: anvil with the Osaka hardfork, which has the
        P-256 precompile Monad has, and the same contracts DeployMonad.s.sol deploys. Transactions here are
        real and signed; they are not on Monad.
      </p>
      <dl className="mt-6 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 border-y border-rule py-4 font-mono text-[13px] max-sm:grid-cols-1">
        <dt className="label">Chain</dt><dd>{appChain.name} · {appChain.id}</dd>
        <dt className="label">RPC</dt><dd className="break-all">{LOCAL_RPC}</dd>
        <dt className="label">Block</dt><dd data-testid="local-block">{block?.toString() ?? "…"}</dd>
        <dt className="label">Protocol</dt>
        <dd className="break-all"><Link className="text-probe hover:underline" href={`/explorer/address/${ACTIVE_DEPLOYMENT.contracts.axon}`}>{ACTIVE_DEPLOYMENT.contracts.axon}</Link></dd>
      </dl>

      {!s.connected ? (
        <>
          <Button variant="primary" className="mt-6" onClick={s.connect} disabled={s.connecting}>
            {s.connecting ? "Connecting…" : "Sign in with the local wallet"}
          </Button>
          {s.connectError ? <p className="mt-3 text-[13px] text-reject">{s.connectError.message.split("\n")[0]}</p> : null}
        </>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <p className="font-mono text-[13px]">
            <span className="label mr-2">Wallet</span>
            <Link className="break-all text-probe hover:underline" href={`/explorer/address/${s.address}`}>{s.address}</Link>
          </p>
          <p className="font-mono text-[13px]" data-testid="local-balances">
            <span className="label mr-2">Holds</span>
            {s.balance.toFixed(4)} {CURRENCY} · {usdc !== undefined ? formatUnits(usdc, 6) : "…"} USDC
          </p>
          <Button className="self-start" onClick={fund} disabled={busy}>{busy ? "Sending…" : "Top up from the faucet"}</Button>
          {note ? <p className="text-[13px] text-scribe-2">{note}</p> : null}
        </div>
      )}

      {SPONSORED_ACCOUNT ? (
        <section className="mt-8 border border-rule px-5 py-4" aria-labelledby="sponsor-title">
          <h2 id="sponsor-title" className="label">Gas</h2>
          <label className="mt-2 flex items-start gap-3 text-[14px] text-scribe-2">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-probe"
              checked={sponsored}
              onChange={(e) => { setLocalSponsored(e.target.checked); setSponsored(e.target.checked); }}
            />
            <span>
              A sponsor pays this wallet&rsquo;s gas. On Monad, Privy does this for operators who sign in with email.
              Here the wallet delegates its address to a smart account under EIP-7702, signs each call, and a
              sponsor&rsquo;s key sends it. The protocol still sees this address, and pays it.
            </span>
          </label>
          {s.connected ? (
            <p className="mt-2 font-mono text-[12px] text-scribe-3" data-testid="local-delegation">
              {delegated ? `Delegated to ${SPONSORED_ACCOUNT}` : "Not delegated yet: the first sponsored transaction signs the authorisation."}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
