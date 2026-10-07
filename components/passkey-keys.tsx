"use client";

import { useCallback, useState } from "react";
import { useReadContract } from "wagmi";
import { ed25519 } from "@noble/curves/ed25519.js";
import { isMeraError } from "@category-labs/mera";
import { Button, DimRule } from "@/components/primitives";
import { PASSKEY_ADDRESS } from "@/lib/chain";
import { PASSKEY_ABI } from "@/lib/passkey-abi";
import { storedPasskey } from "@/lib/passkey";
import { commandMessage, toHex } from "@/lib/robot-command";
import { shortHash } from "@/lib/format";

/** The SO-101 at home (base 0°, shoulder −25°, elbow +35°, wrist 0°, roll 0°, jaw 20°), in radians. */
const HOME = [0, -0.436, 0.611, 0, 0, 0.349];

type Derived = { key: string; message: string; signature: string; verified: boolean; at: number };

/**
 * One passkey, more than one key.
 *
 * The passkey's own P-256 key is the operator's identity, registered on Monad.
 * Its PRF, asked with a salt that names one purpose, gives 32 bytes nothing
 * else can reproduce; the robot key is made from the "so101-commands" salt and
 * signs every command to the operator's physical arm. This panel derives it on
 * demand, signs a command the way the station does, checks the signature here
 * with the public key alone, and ends the session, which zeroes the key. The
 * same passkey on another device gives the same public key.
 */
export function PasskeyKeys({ address }: { address: `0x${string}` }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [derived, setDerived] = useState<Derived | null>(null);
  const local = storedPasskey(address);

  const { data: identity } = useReadContract({
    address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "passkeyOf", args: [address],
  });
  const x = (identity as { x?: `0x${string}` } | undefined)?.x;

  const derive = useCallback(async () => {
    setError(null); setBusy(true); setDerived(null);
    try {
      const { robotSession } = await import("@/lib/robot-key");
      const session = await robotSession(address);
      try {
        const publicKey = new Uint8Array(session.publicKey);
        const ts = Date.now();
        const msg = commandMessage(1, ts, HOME);
        const sig = await session.signMessage(msg);
        setDerived({
          key: toHex(publicKey),
          message: new TextDecoder().decode(msg),
          signature: toHex(sig),
          verified: ed25519.verify(sig, msg, publicKey),
          at: ts,
        });
      } finally {
        session.end();
      }
    } catch (e) {
      setError(
        isMeraError(e) && e.code === "PRF_UNAVAILABLE"
          ? "This passkey cannot make keys: its provider does not support PRF. iCloud Keychain, Google Password Manager and 1Password do; a passkey kept in a desktop Chrome profile does not."
          : isMeraError(e) && e.code === "PASSKEY_OPERATION_FAILED"
            ? "The passkey did not answer. Nothing was derived."
            : e instanceof Error ? e.message.split("\n")[0] : "The key could not be derived.",
      );
    } finally {
      setBusy(false);
    }
  }, [address]);

  return (
    <section aria-labelledby="keys-title">
      <DimRule className="mt-10" note="Keys from this passkey" />
      <h2 id="keys-title" className="sr-only">Keys from this passkey</h2>
      <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">
        Your passkey is one secret, and it gives Thenar more than one key. Each comes from the passkey&rsquo;s PRF with
        a salt that names a single purpose, so one key says nothing about another. None of them is stored: the passkey
        makes them again when asked, on any device it has synced to.
      </p>

      <dl className="mt-5 divide-y divide-rule border-y border-rule text-[13px]">
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
          <dt>
            <span className="block font-medium text-scribe">Identity</span>
            <span className="font-mono text-[12px] text-scribe-3">P-256 · the passkey itself</span>
          </dt>
          <dd className="text-scribe-2">
            Proves a run came from a person. Its public key is registered in PasskeyRegistry and Monad checks it
            through the P-256 precompile.
            <span className="mt-1 block font-mono text-[12px] text-scribe-3">
              {x ? `on chain · x ${shortHash(x)}` : "not registered yet"}
            </span>
          </dd>
        </div>
        <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
          <dt>
            <span className="block font-medium text-scribe">Your SO-101</span>
            <span className="font-mono text-[12px] text-scribe-3">Ed25519 · from the PRF</span>
          </dt>
          <dd className="text-scribe-2">
            Signs every command the station sends to your own arm. Started with <code className="font-mono text-[12px]">--owner</code>,
            the arm relay moves the arm only for this key.
            <span className="mt-1 block font-mono text-[12px] text-scribe-3">
              salt SHA-256(&ldquo;thenar:so101-commands:v1&rdquo;) → HKDF-SHA-256 → seed · stored nowhere
            </span>
          </dd>
        </div>
      </dl>

      {local && !local.prf ? (
        <p className="mt-4 max-w-[62ch] text-[13px] text-scribe-3">
          The passkey this browser made has no PRF, so it proves who you are but cannot make keys. A passkey in iCloud
          Keychain, Google Password Manager or 1Password can.
        </p>
      ) : null}

      <Button className="mt-4" onClick={derive} disabled={busy}>
        {busy ? "Waiting for your passkey…" : derived ? "Derive it again" : "Derive my SO-101 key"}
      </Button>

      {derived ? (
        <div className="mt-4 space-y-3 font-mono text-[12px]" data-testid="robot-key">
          <div>
            <span className="label">Public key</span>
            <p className="mt-1 break-all text-[13px] leading-relaxed text-scribe">
              <span className="text-probe">{derived.key.slice(0, 8)}</span>
              {derived.key.slice(8)}
            </p>
          </div>
          <div>
            <span className="label">Signed a command to your arm</span>
            <p className="mt-1 break-all text-scribe-2">{derived.message}</p>
            <p className="mt-1 break-all text-scribe-3">signature {derived.signature}</p>
          </div>
          <p className={derived.verified ? "text-go" : "text-reject"} role="status">
            {derived.verified
              ? "Verified in this page with the public key alone, as the arm relay checks it. The session ended and the private key was zeroed."
              : "The signature did not verify against the public key."}
          </p>
          <div>
            <span className="label">Pair your arm with it</span>
            <p className="mt-1 break-all text-scribe-2">
              node scripts/arm-relay.mjs --follower /dev/cu.usbserial-… --arm --owner {derived.key}
            </p>
          </div>
          <p className="max-w-[62ch] font-sans text-[13px] leading-relaxed text-scribe-3">
            Open this page on another device your passkey has synced to, sign in and derive again: the key starts{" "}
            <span className="font-mono text-probe">{derived.key.slice(0, 8)}</span> there too. Nothing was sent or
            saved to make it.
          </p>
        </div>
      ) : null}
      {error ? <p className="mt-3 max-w-[62ch] text-[13px] text-reject" role="alert">{error}</p> : null}
    </section>
  );
}
