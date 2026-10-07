"use client";

import { useCallback, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { Button, DimRule } from "@/components/primitives";
import { useSession } from "@/components/session";
import { OperatorGate } from "@/components/operator-gate";
import { PasskeyKeys } from "@/components/passkey-keys";
import { CHAIN_SHORT, PASSKEY_ADDRESS, addressUrl } from "@/lib/chain";
import { PASSKEY_ABI } from "@/lib/passkey-abi";
import { b64url, fromB64url, signChallenge, storedPasskey } from "@/lib/passkey";
import { assertionDigest, derToRs } from "@/lib/webauthn";
import { shortHash } from "@/lib/format";

type Proof = { ok: boolean; digest: string; at: number } | null;

/**
 * Your passkey, and what Monad knows about it.
 *
 * The passkey is made by your device (Face ID, a fingerprint, a PIN) through
 * Mera, Monad's passkey library. Its P-256 public key is registered in
 * PasskeyRegistry, and Monad verifies its signatures directly with the P-256
 * precompile at 0x0100 — the curve passkeys sign on, which Ethereum's own
 * signature check does not cover.
 */
export default function PasskeyPage() {
  const s = useSession();
  const client = usePublicClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<Proof>(null);

  const { data: registered, refetch } = useReadContract({
    address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "hasPasskey",
    args: s.address ? [s.address] : undefined, query: { enabled: Boolean(s.address) },
  });

  // Sign a fresh message with the passkey and ask the registry, on Monad, to check it.
  const prove = useCallback(async () => {
    if (!s.address) return;
    setError(null); setBusy(true); setProof(null);
    try {
      const challenge = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const a = await signChallenge(s.address, challenge);
      const digest = await assertionDigest(fromB64url(a.authenticatorData), fromB64url(a.clientDataJSON));
      const { r, s: sv } = derToRs(fromB64url(a.signature));
      const ok = (await client?.readContract({
        address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "verify", args: [s.address, digest, r, sv],
      })) as boolean;
      setProof({ ok, digest, at: Date.now() });
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "The registry would not verify it.");
    } finally {
      setBusy(false);
    }
  }, [s.address, client]);

  const local = s.address ? storedPasskey(s.address) : null;

  return (
    <div className="mx-auto max-w-[760px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Your passkey</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        A paid run has to come from a person. On Thenar that person is a passkey: your device makes it,
        unlocked with Face ID, a fingerprint or a PIN, and Monad checks its signature directly. There is no
        seed phrase, and nothing about you leaves your device.
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
          <span className={local ? "text-go" : "text-scribe-3"}>{local ? "holds your passkey" : "no passkey"}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="label">On {CHAIN_SHORT}</span>
          <span className={registered ? "text-go" : "text-scribe-3"}>
            {s.connected ? (registered ? "registered" : "not registered") : "connect to read"}
          </span>
        </span>
      </div>

      {!s.connected ? (
        <div className="mt-8">
          <p className="text-[15px] text-scribe-2">Sign in first. The passkey is bound to your Thenar wallet.</p>
          <Button variant="primary" className="mt-4" onClick={s.connect} disabled={s.connecting}>
            {s.connecting ? "Connecting…" : "Sign in"}
          </Button>
        </div>
      ) : (
        <>
          {/* Setting up registers the key, so the registry's answer above is stale the moment it succeeds. */}
          <div className="mt-8"><OperatorGate onAdmitted={() => void refetch()} /></div>

          {registered ? (
            <>
              <DimRule className="mt-10" note={`Check it on ${CHAIN_SHORT} yourself`} />
              <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
                Your passkey signs a fresh random message, and the registry on Monad verifies that signature
                against the key registered to your address, through the P-256 precompile. Nothing is sent and
                nothing costs gas: it is a read.
              </p>
              <Button className="mt-4" onClick={prove} disabled={busy}>
                {busy ? "Waiting for your passkey…" : `Prove it on ${CHAIN_SHORT}`}
              </Button>
              {proof ? (
                <p className={`mt-3 font-mono text-[13px] ${proof.ok ? "text-go" : "text-reject"}`}>
                  {proof.ok ? `Verified on ${CHAIN_SHORT}` : "Rejected by the registry"} · digest {shortHash(proof.digest)}
                </p>
              ) : null}
              {error ? <p className="mt-3 text-[13px] text-reject">{error}</p> : null}
              {s.address ? <PasskeyKeys address={s.address} /> : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
