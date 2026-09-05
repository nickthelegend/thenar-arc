"use client";

import { useCallback, useState } from "react";
import { usePublicClient } from "wagmi";
import { encodeFunctionData } from "viem";
import { Button, Copyable, DimRule } from "@/components/primitives";
import { PASSKEY_ABI } from "@/lib/passkey-abi";
import { addressUrl, P256_PRECOMPILE, PASSKEY_ADDRESS } from "@/lib/chain";
import { cn } from "@/lib/cn";

/** secp256r1 group order; the precompile only accepts the low-s form. */
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

type Step = { label: string; detail?: string; state: "pending" | "running" | "ok" | "fail" };

const hex = (b: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const word = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}` as `0x${string}`;
const big = (b: Uint8Array) => BigInt(`0x${hex(b)}`);
const b64u = (v: string) =>
  Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/**
 * Monad ships EIP-7951's P256 precompile. This page proves it: a secp256r1 key
 * is generated in the browser with WebCrypto — the same curve and encoding a
 * passkey uses — a message is signed with it, and the chain verifies the
 * signature natively. Ethereum mainnet cannot do this at all.
 */
export default function PasskeyPage() {
  const client = usePublicClient();
  const [steps, setSteps] = useState<Step[]>([]);
  const [payload, setPayload] = useState<Record<string, string> | null>(null);
  const [verdict, setVerdict] = useState<null | { valid: boolean; tampered: boolean; gas?: string }>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true); setError(null); setVerdict(null); setPayload(null);
    const trace: Step[] = [
      { label: "Generate a secp256r1 key pair", state: "running" },
      { label: "Sign a message with it", state: "pending" },
      { label: "Ask Monad to verify it", state: "pending" },
      { label: "Tamper with the signature and ask again", state: "pending" },
    ];
    const push = (i: number, s: Step["state"], detail?: string) => {
      trace[i] = { ...trace[i], state: s, detail };
      setSteps([...trace]);
    };
    setSteps([...trace]);

    try {
      const key = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"],
      );
      const jwk = await crypto.subtle.exportKey("jwk", key.publicKey);
      const x = big(b64u(jwk.x!)), y = big(b64u(jwk.y!));
      push(0, "ok", `public key x=${word(x).slice(0, 14)}…`);

      push(1, "running");
      const message = new TextEncoder().encode(`axon: authorise a run at ${new Date().toISOString()}`);
      const raw = new Uint8Array(
        await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, message),
      );
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", message));
      const r = big(raw.slice(0, 32));
      let s = big(raw.slice(32, 64));
      if (s > N / 2n) s = N - s;
      push(1, "ok", `r=${word(r).slice(0, 14)}… s=${word(s).slice(0, 14)}…`);

      setPayload({
        digest: `0x${hex(digest)}`, r: word(r), s: word(s), x: word(x), y: word(y),
      });

      push(2, "running");
      const args = [`0x${hex(digest)}` as `0x${string}`, word(r), word(s), word(x), word(y)] as const;
      const valid = (await client!.readContract({
        address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "verifyWithKey", args,
      })) as boolean;
      // verifyWithKey is a view, so it is estimated as a raw call rather than
      // through estimateContractGas, which only accepts state-changing methods.
      const gas = await client!
        .estimateGas({
          to: PASSKEY_ADDRESS,
          data: encodeFunctionData({ abi: PASSKEY_ABI, functionName: "verifyWithKey", args }),
        })
        .catch(() => undefined);
      push(2, valid ? "ok" : "fail", valid ? "the chain accepted it" : "the chain rejected it");

      push(3, "running");
      const tampered = (await client!.readContract({
        address: PASSKEY_ADDRESS, abi: PASSKEY_ABI, functionName: "verifyWithKey",
        args: [args[0], word(r ^ 1n), args[2], args[3], args[4]],
      })) as boolean;
      push(3, tampered ? "fail" : "ok", tampered ? "it was accepted — that is wrong" : "refused, as it must be");

      setVerdict({ valid, tampered, gas: gas?.toString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "the verification could not be completed");
    } finally {
      setBusy(false);
    }
  }, [client]);

  return (
    <div className="mx-auto max-w-[820px] px-5 py-10">
      <h1 className="font-display text-[clamp(2.2rem,5vw,3.2rem)] font-700 leading-[0.96] tracking-[-0.02em]">
        Sign a run with a passkey.
      </h1>
      <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-scribe-2">
        Axon&rsquo;s operators are gig workers, and the seed phrase is where that
        funnel dies. Monad ships the P256 precompile from EIP-7951, so a run can
        be authorised with the same key a passkey already uses — verified by the
        chain, not by a server anyone has to trust.
      </p>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        This is not a diagram. Press the button and the browser generates a real
        secp256r1 key with WebCrypto, signs a message, and the contract below
        asks Monad to verify it. Ethereum mainnet has no such precompile.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button variant="primary" onClick={run} disabled={busy}>
          {busy ? "Verifying…" : "Generate and verify"}
        </Button>
        <a
          href={addressUrl(PASSKEY_ADDRESS)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[12px] text-scribe-3 hover:text-signal"
        >
          PasskeyRegistry · {PASSKEY_ADDRESS.slice(0, 10)}… →
        </a>
      </div>

      {error ? (
        <p role="alert" className="mt-5 max-w-[62ch] border border-reject bg-reject-dim px-3 py-2 text-[13px] text-reject">
          {error}
        </p>
      ) : null}

      {steps.length > 0 ? (
        <>
          <DimRule className="mt-10" note="What just happened" />
          <ol className="mt-5 flex flex-col">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-baseline gap-4 border-b border-rule py-3">
                <span className="w-6 shrink-0 font-mono text-[13px] tabular-nums text-scribe-3">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-[15px] text-scribe">{s.label}</span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[12px]",
                    s.state === "ok" ? "text-go"
                      : s.state === "fail" ? "text-reject"
                      : s.state === "running" ? "text-signal"
                      : "text-scribe-3",
                  )}
                >
                  {s.state === "ok" ? "done" : s.state === "fail" ? "failed" : s.state === "running" ? "…" : "—"}
                </span>
                {s.detail ? (
                  <span className="w-full shrink-0 pl-10 font-mono text-[12px] text-scribe-3">{s.detail}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {verdict ? (
        <div
          className={cn(
            "mt-8 border px-5 py-4",
            verdict.valid && !verdict.tampered
              ? "border-go bg-go-dim" : "border-reject bg-reject-dim",
          )}
        >
          <p className={cn("font-display text-xl font-600 tracking-[0.03em]", verdict.valid && !verdict.tampered ? "text-go" : "text-reject")}>
            {verdict.valid && !verdict.tampered ? "VERIFIED ON CHAIN" : "VERIFICATION FAILED"}
          </p>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-scribe-2">
            Monad verified a signature it had never seen, from a key generated a
            moment ago in this browser, and refused the same signature with one
            bit flipped.
            {verdict.gas ? ` The whole check costs ${Number(verdict.gas).toLocaleString()} gas.` : ""}
          </p>
        </div>
      ) : null}

      {payload ? (
        <>
          <DimRule className="mt-10" note="The 160 bytes the precompile receives" />
          <dl className="mt-4 flex flex-col font-mono text-[12px]">
            {Object.entries(payload).map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-3 border-b border-rule py-1.5">
                <dt className="label w-[72px] shrink-0">{k}</dt>
                <dd className="min-w-0 break-all text-scribe-2">
                  <Copyable value={v} className="break-all text-[12px] text-scribe-2" />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 max-w-[62ch] text-[13px] leading-relaxed text-scribe-3">
            Concatenated in that order and handed to{" "}
            <span className="text-scribe-2">{P256_PRECOMPILE}</span>, which answers
            with 32 bytes of 1 or with nothing at all.
          </p>
        </>
      ) : null}
    </div>
  );
}
