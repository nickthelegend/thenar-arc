"use client";

import { useCallback, useEffect, useState } from "react";
import { useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { Button, DimRule } from "@/components/primitives";
import { useSession } from "@/components/session";
import { PASSKEY_ADDRESS, addressUrl, txUrl } from "@/lib/chain";
import { PASSKEY_ABI } from "@/lib/passkey-abi";
import { createKey, storedKey, forgetKey, publicCoords, signChallenge } from "@/lib/passkey";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

type Proof = { ok: boolean; digest: string; at: number } | null;

export default function PasskeyPage() {
  const s = useSession();
  const client = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [pair, setPair] = useState<CryptoKeyPair | null>(null);
  const [coords, setCoords] = useState<{ x: `0x${string}`; y: `0x${string}` } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tx, setTx] = useState<string | null>(null);
  const [proof, setProof] = useState<Proof>(null);

  const { data: registered, refetch } = useReadContract({
    address: PASSKEY_ADDRESS,
    abi: PASSKEY_ABI,
    functionName: "hasPasskey",
    args: s.address ? [s.address] : undefined,
    query: { enabled: Boolean(s.address) },
  });

  const { data: onChainKey } = useReadContract({
    address: PASSKEY_ADDRESS,
    abi: PASSKEY_ABI,
    functionName: "passkeyOf",
    args: s.address ? [s.address] : undefined,
    query: { enabled: Boolean(s.address && registered) },
  });

  useEffect(() => {
    void storedKey().then(async (k) => {
      setPair(k);
      if (k) setCoords(await publicCoords(k));
    });
  }, []);

  const generate = useCallback(async () => {
    setError(null); setBusy("Generating a key in this browser…");
    try {
      const c = await createKey();
      setCoords(c);
      setPair(await storedKey());
    } catch (e) {
      setError(e instanceof Error ? e.message : "The browser would not generate a P-256 key.");
    } finally { setBusy(null); }
  }, []);

  const register = useCallback(async () => {
    if (!coords) return;
    setError(null); setBusy("Waiting for the wallet…"); setTx(null);
    try {
      const hash = await writeContractAsync({
        address: PASSKEY_ADDRESS, abi: PASSKEY_ABI,
        functionName: "register", args: [coords.x, coords.y],
      });
      setTx(hash);
      setBusy("Waiting for the receipt…");
      await client?.waitForTransactionReceipt({ hash });
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "The registration did not go through.");
    } finally { setBusy(null); }
  }, [coords, writeContractAsync, client, refetch]);

  const prove = useCallback(async () => {
    if (!pair || !s.address) return;
    setError(null); setBusy("Signing and asking the contract…"); setProof(null);
    try {
      const challenge = `thenar:${s.address}:${Date.now()}`;
      const { digest, r, s: sv } = await signChallenge(pair, challenge);
      const ok = (await client?.readContract({
        address: PASSKEY_ADDRESS, abi: PASSKEY_ABI,
        functionName: "verify", args: [s.address, digest, r, sv],
      })) as boolean;
      setProof({ ok, digest, at: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "The contract would not verify it.");
    } finally { setBusy(null); }
  }, [pair, s.address, client]);

  const revoke = useCallback(async () => {
    setError(null); setBusy("Waiting for the wallet…");
    try {
      const hash = await writeContractAsync({
        address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "revoke", args: [],
      });
      setTx(hash);
      await client?.waitForTransactionReceipt({ hash });
      await forgetKey();
      setPair(null); setCoords(null); setProof(null);
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "The revocation did not go through.");
    } finally { setBusy(null); }
  }, [writeContractAsync, client, refetch]);

  const key = onChainKey as { x: string; y: string; registeredAt: bigint } | undefined;
  const matches = Boolean(coords && key && key.x === coords.x && key.y === coords.y);

  return (
    <div className="mx-auto max-w-[860px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Passkey</h1>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        A passkey signs on secp256r1 &mdash; the curve a Secure Enclave and a
        hardware key use, and not the one Ethereum uses. Avalanche carries the
        P-256 precompile at <span className="font-mono text-scribe">0x0100</span>,
        so a signature from that curve can be checked on chain directly. This binds
        a key your browser generates to your address, and proves a signature against
        it without a seed phrase anywhere in the loop.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3 font-mono text-[13px]">
        <span className="flex items-baseline gap-2">
          <span className="label">Registry</span>
          <a href={addressUrl(PASSKEY_ADDRESS)} target="_blank" rel="noreferrer" className="text-scribe-2 hover:text-probe">
            {shortHash(PASSKEY_ADDRESS)}
          </a>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">This browser</span>
          <span className={coords ? "text-go" : "text-scribe-3"}>{coords ? "holds a key" : "no key"}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">On chain</span>
          <span className={registered ? "text-go" : "text-scribe-3"}>
            {s.connected ? (registered ? "registered" : "not registered") : "connect to read"}
          </span>
        </span>
      </div>

      {!s.connected ? (
        <div className="mt-8">
          <p className="text-[15px] text-scribe-2">Connect the wallet you want the key bound to.</p>
          <Button variant="primary" className="mt-4" onClick={s.connect} disabled={s.connecting}>
            {s.connecting ? "Connecting…" : "Connect a wallet"}
          </Button>
        </div>
      ) : (
        <>
          <DimRule className="mt-8" note="One — a key in this browser" />
          <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
            Generated non-extractable, so it cannot be read out by this page or any
            other, and kept in this browser&rsquo;s storage. Only the public half is
            ever sent anywhere.
          </p>
          {coords ? (
            <dl className="mt-4 grid gap-x-6 gap-y-2 font-mono text-[13px] sm:grid-cols-[auto_1fr]">
              <dt className="label self-center">x</dt>
              <dd className="truncate text-scribe-2">{coords.x}</dd>
              <dt className="label self-center">y</dt>
              <dd className="truncate text-scribe-2">{coords.y}</dd>
            </dl>
          ) : (
            <Button className="mt-4" onClick={generate} disabled={Boolean(busy)}>Generate a key</Button>
          )}

          <DimRule className="mt-8" note="Two — bind it to your address" />
          <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
            One transaction writes the two coordinates into the registry against
            your address. Nothing secret leaves the browser.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={register} disabled={!coords || Boolean(busy) || isPending}>
              {registered ? "Replace the registered key" : "Register on chain"}
            </Button>
            {registered ? (
              <Button onClick={revoke} disabled={Boolean(busy) || isPending}>Revoke</Button>
            ) : null}
          </div>
          {key && registered ? (
            <p className="mt-3 font-mono text-[12px] text-scribe-3">
              Registered {new Date(Number(key.registeredAt) * 1000).toLocaleString()} ·{" "}
              <span className={matches ? "text-go" : "text-reject"}>
                {matches ? "matches the key in this browser" : "a different key from this browser's"}
              </span>
            </p>
          ) : null}

          <DimRule className="mt-8" note="Three — prove it" />
          <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
            Signs a fresh challenge with the private half and asks the contract to
            check it through the precompile. This is a read: it costs no gas and
            writes nothing.
          </p>
          <Button className="mt-4" onClick={prove} disabled={!pair || !registered || Boolean(busy)}>
            Sign a challenge and verify
          </Button>
          {proof ? (
            <div className={cn("mt-4 border px-4 py-3", proof.ok ? "border-go bg-go-dim" : "border-reject bg-reject-dim")}>
              <p className={cn("font-mono text-[13px] uppercase tracking-[0.12em]", proof.ok ? "text-go" : "text-reject")}>
                {proof.ok ? "The contract accepted the signature" : "The contract rejected the signature"}
              </p>
              <p className="mt-1 truncate font-mono text-[12px] text-scribe-3">digest {proof.digest}</p>
            </div>
          ) : null}
        </>
      )}

      {busy ? <p className="mt-6 font-mono text-[13px] text-scribe-3">{busy}</p> : null}
      {error ? (
        <p className="mt-6 border border-reject bg-reject-dim px-4 py-3 font-mono text-[13px] text-reject">{error}</p>
      ) : null}
      {tx ? (
        <p className="mt-3 font-mono text-[12px] text-scribe-3">
          <a href={txUrl(tx)} target="_blank" rel="noreferrer" className="hover:text-probe">
            {shortHash(tx)} &rarr;
          </a>
        </p>
      ) : null}
    </div>
  );
}
