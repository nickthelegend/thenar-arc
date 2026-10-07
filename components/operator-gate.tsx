"use client";

import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { useContractWrite } from "@/lib/contract-write";
import { Button } from "@/components/primitives";
import { useSession } from "@/components/session";
import { CHAIN_SHORT, PASSKEY_ADDRESS, appChain, txUrl } from "@/lib/chain";
import { PASSKEY_ABI } from "@/lib/passkey-abi";
import { createPasskey, passkeyHostOk, passkeysAvailable, signChallenge, storedPasskey } from "@/lib/passkey";

type Status = { address: string; passkey: boolean; operator: boolean };

/**
 * The step between an operator and the payroll: a passkey.
 *
 * Once per address. The device makes a passkey (Face ID, a fingerprint, a
 * PIN) and its public key is registered on Monad, in PasskeyRegistry, from
 * the operator's own wallet. Then the passkey signs a one-time challenge,
 * PasskeyRegistry checks it through Monad's P-256 precompile, and the address
 * joins the CorpusShares whitelist: from then on its runs are signed and paid,
 * and each paid run issues its share of the corpus.
 */
export function OperatorGate({ onAdmitted }: { onAdmitted?: () => void }) {
  const s = useSession();
  const address = s.address;
  const client = usePublicClient();
  const { writeContractAsync } = useContractWrite();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!address) return;
    const r = await fetch(`/api/operator?address=${address}`);
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Could not read your passkey status.");
    setStatus(b as Status);
    return b as Status;
  }, [address]);

  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch(`/api/operator?address=${address}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Could not read your passkey status.");
        if (live) setStatus(b as Status);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not read your passkey status."));
    return () => { live = false; };
  }, [address]);

  /** Sign the server's challenge and join the whitelist. */
  const admit = useCallback(async () => {
    if (!address) return;
    setBusy("Asking for a challenge…");
    const c = await fetch("/api/operator", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "challenge", address }),
    }).then((r) => r.json());
    if (!c.challenge) throw new Error(c.error ?? "The server gave no challenge.");
    setBusy("Confirm with your passkey…");
    const assertion = await signChallenge(address, c.challenge);
    setBusy(`Checking it on ${CHAIN_SHORT}…`);
    const r = await fetch("/api/operator", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "admit", address, assertion }),
    });
    const b = await r.json();
    if (!r.ok || !b.admitted) throw new Error(b.error ?? "The passkey was not accepted.");
    if (b.tx) setTx(b.tx);
    await refresh();
    onAdmitted?.();
  }, [address, refresh, onAdmitted]);

  const setUp = useCallback(async () => {
    if (!address) return;
    setError(null);
    try {
      let onChain = status?.passkey ?? false;
      const local = storedPasskey(address);
      // A passkey this browser made but the chain does not know yet, or none
      // at all: make one if needed, then register its key from the wallet.
      if (!onChain || !local) {
        const key = local ?? (setBusy("Creating your passkey…"), await createPasskey(address));
        setBusy(`Registering it on ${CHAIN_SHORT} (confirm in your wallet)…`);
        const hash = await writeContractAsync({
          address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "register", args: [key.x, key.y],
        });
        setTx(hash);
        setBusy(`Waiting for ${CHAIN_SHORT}…`);
        await client?.waitForTransactionReceipt({ hash });
        onChain = true;
      }
      if (onChain) await admit();
    } catch (e) {
      const m = e instanceof Error ? e.message.split("\n")[0] : "The passkey step did not finish.";
      setError(/NotAllowedError|timed out|not allowed/i.test(m) ? "The passkey prompt was closed or timed out. Try again." : m);
    } finally {
      setBusy(null);
    }
  }, [address, status, client, writeContractAsync, admit]);

  if (!address) return null;

  if (status?.operator) {
    return (
      <div className="flex flex-col gap-1.5 border border-rule p-3">
        <span className="text-[12px] text-signal">Passkey set · you can earn</span>
        <span className="text-[13px] leading-relaxed text-scribe-3">
          Your runs are signed and paid, and each paid run issues your share of the corpus.
        </span>
        {tx ? (
          <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-probe hover:underline">
            See it on {CHAIN_SHORT} →
          </a>
        ) : null}
      </div>
    );
  }

  const local = storedPasskey(address);
  const label = !status ? "Checking…" : status.passkey && local ? "Sign in with your passkey" : "Set up your passkey";
  return (
    <div className="flex flex-col gap-2 border border-rule p-3">
      <span className="text-[12px] text-scribe">One step before you earn</span>
      <span className="text-[13px] leading-relaxed text-scribe-2">
        Use Face ID, your fingerprint or a PIN to create a passkey. Its public key is registered on {CHAIN_SHORT}{" "}
        and checked there, so paid runs always come from a person. No seed phrase, and nothing about you
        leaves your device.
      </span>
      {!passkeysAvailable() ? (
        <span className="text-[13px] text-reject">This browser cannot make passkeys. Try Chrome, Safari or Edge.</span>
      ) : !passkeyHostOk() ? (
        <span className="text-[13px] text-reject">
          A passkey belongs to a site&rsquo;s name, and this page was opened at an IP address. Open it at{" "}
          <a className="underline" href={window.location.href.replace(window.location.hostname, "localhost")}>localhost</a> instead.
        </span>
      ) : s.wrongNetwork ? (
        <Button variant="primary" onClick={s.switchToChain}>Switch to {appChain.name}</Button>
      ) : (
        <Button variant="primary" onClick={setUp} disabled={!status || Boolean(busy)}>
          {busy ?? label}
        </Button>
      )}
      {tx && !status?.operator ? (
        <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-probe hover:underline">
          Registration on {CHAIN_SHORT} →
        </a>
      ) : null}
      {error ? <span className="text-[13px] leading-relaxed text-reject">{error}</span> : null}
    </div>
  );
}
