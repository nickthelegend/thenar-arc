"use client";

import Link from "next/link";
import { useState } from "react";
import { ARC_NETWORK, addressUrl, FAUCET_URL } from "@/lib/chain";
import { useSession } from "@/components/session";
import { PRIVY_CONFIGURED } from "@/lib/auth-config";

function chooseDevWallet(enabled: boolean) {
  if (ARC_NETWORK !== "testnet") return;
  document.cookie = `thenar-dev-wallet=${enabled ? "1" : "0"}; Path=/; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
  // A full navigation recreates the wallet providers from the new cookie.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  location.assign("/dev-wallet");
}

export function TestnetWalletBanner({ dev }: { dev: boolean }) {
  if (ARC_NETWORK !== "testnet") return null;
  return <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-rule bg-ink-1 px-5 py-2 text-sm" data-testid="testnet-wallet-banner">
    <span>{dev ? "Testnet dev wallet · browser-held key · real test USDC" : "Arc testnet · test USDC only"}</span>
    <Link className="text-probe underline" href="/dev-wallet">Wallet options</Link>
    {!dev ? <button className="text-probe underline" onClick={() => chooseDevWallet(true)}>Use testnet dev wallet</button>
      : PRIVY_CONFIGURED ? <button className="text-probe underline" onClick={() => chooseDevWallet(false)}>Use Privy sign-in</button> : null}
  </div>;
}

export function TestnetWalletPanel() {
  const s = useSession();
  const [copied, setCopied] = useState(false);
  if (ARC_NETWORK !== "testnet") return <p>Dev wallets are unavailable on this network. Connect a recoverable wallet or use wallet-free practice.</p>;
  return <div className="mx-auto max-w-2xl space-y-5 px-5 py-10">
    <h1 className="font-display text-4xl">Testnet wallet</h1>
    <p>Use the dev-wallet option above if Privy sign-in is not enabled for this site yet. It creates a key in this browser, signs here, and sends real transactions to Arc testnet (5042002). It cannot sign on mainnet.</p>
    <p className="text-scribe-2">For testing only. Do not send real funds. Clearing browser storage loses this wallet. Keep the same browser and origin for the whole flow. Transactions and payment signatures ask for confirmation.</p>
    {!s.connected ? <button className="border border-rule-strong px-4 py-2" onClick={s.connect} disabled={s.connecting}>Connect wallet</button> : <>
      <a data-testid="wallet-address" href={addressUrl(s.address!)} className="block break-all font-mono text-probe underline">{s.address}</a>
      <p data-testid="wallet-balance">Balance: {s.balance.toFixed(6)} test USDC · also pays gas</p>
      <button className="border border-rule-strong px-4 py-2" onClick={async () => { await navigator.clipboard.writeText(s.address!); setCopied(true); }}>{copied ? "Address copied" : "Copy funding address"}</button>
      <a className="block text-probe underline" href={FAUCET_URL} target="_blank" rel="noreferrer">Get test USDC from Circle’s faucet</a>
    </>}
    {s.connectError ? <p role="alert" className="text-reject">Wallet connection failed. Try connecting again.</p> : null}
    <ol className="list-decimal space-y-3 pl-5">
      <li><Link className="text-probe underline" href="/post">Sponsor: create a task</Link> with a reward and funded slots.</li>
      <li><Link className="text-probe underline" href="/start">Operator: set up a passkey</Link>, drive the arm, then submit an accepted run.</li>
      <li>Read the exact reward and open its Arc testnet payout transaction.</li>
      <li><Link className="text-probe underline" href="/corpus">Buyer: purchase the task’s data</Link> over x402. A browser wallet signs the same payment an agent signs.</li>
    </ol>
  </div>;
}
