"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { IDKitRequestWidget, selfieCheckLegacy, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { Button } from "@/components/primitives";
import { ATS } from "@/lib/ats";
import { bindingMessage, worldErrorMessage } from "@/lib/world";

type Human = { credential: string; protocol: string; environment: string; verifiedAt: number };

type HumanRequest = {
  app_id: `app_${string}`;
  action: string;
  environment: "production" | "staging" | "sandbox";
  signal: string;
  rp_context: RpContext;
};

type Admission = { admitted: boolean; already?: boolean; tx?: string | null; error?: string };

const CREDENTIAL: Record<string, string> = {
  selfie: "Selfie Check",
  proof_of_human: "Orb",
};

/**
 * Tell the server about a World ID failure the browser saw.
 *
 * The widget reaches World App through World's bridge, so a Selfie Check can
 * fail without a single request reaching this server. Reported, it is in the
 * logs as well as on the operator's screen.
 */
function reportWorldError(address: string, code: string) {
  return fetch("/api/world/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, code }),
    keepalive: true,
  }).catch((e) => console.error("Could not report the World ID error to the server", e));
}

/**
 * The World ID check between an operator and the payroll.
 *
 * Done once per address: the operator's wallet signs that it wants the proof,
 * then they take a Selfie Check on their phone. After that the verifier will
 * sign their runs, and the corpus security on Hedera will hold their shares.
 * Nothing about who they are reaches Thenar — only that a live human made the
 * proof.
 *
 * The wallet signs first, on purpose. The action allows one verification per
 * person, so the proof should never exist without the binding it will be
 * checked against already in hand: a wallet prompt that fails or is dismissed
 * after the selfie would spend the operator's only verification on nothing.
 */
export function HumanGate({ onVerified }: { onVerified?: () => void }) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  // Keyed by address, so a wallet switch reads as "checking" for the new
  // address rather than showing the previous one's answer.
  const [status, setStatus] = useState<{ address: string; human: Human | null } | null>(null);
  const [pending, setPending] = useState<{ request: HumanRequest; signature: `0x${string}` } | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"asking" | "signing" | "checking" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [admission, setAdmission] = useState<Admission | null>(null);

  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch(`/api/world/request?address=${address}`)
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Could not read your World ID status.");
        if (live) setStatus({ address, human: b.human });
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Could not read your World ID status."));
    return () => {
      live = false;
    };
  }, [address]);

  const human = address && status?.address === address ? status.human : undefined;

  const begin = useCallback(async () => {
    if (!address) return;
    setError(null);
    try {
      setBusy("asking");
      const r = await fetch("/api/world/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const request = (await r.json()) as HumanRequest & { error?: string };
      if (!r.ok) throw new Error(request.error ?? "World ID is not available right now.");

      setBusy("signing");
      const signature = await signMessageAsync({ message: bindingMessage(address, request.rp_context.nonce) });
      setPending({ request, signature });
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "World ID is not available right now.");
    } finally {
      setBusy(null);
    }
  }, [address, signMessageAsync]);

  const finish = useCallback(
    async (result: IDKitResult) => {
      if (!address || !pending) return;
      setError(null);
      setBusy("checking");
      try {
        const r = await fetch("/api/world/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address, result, signature: pending.signature }),
        });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "The proof was not accepted.");
        setStatus({ address, human: b.human });
        setAdmission(b.security);
        onVerified?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "The proof was not accepted.");
      } finally {
        setBusy(null);
        setPending(null);
      }
    },
    [address, pending, onVerified],
  );

  if (!address) return null;

  if (human) {
    return (
      <div className="flex flex-col gap-1.5 border border-rule p-3">
        <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-signal">
          Live human &middot; World ID {CREDENTIAL[human.credential] ?? human.credential}
        </span>
        <span className="text-[13px] leading-relaxed text-scribe-3">
          A person stands behind this address. Its runs are signed, and each paid run issues its
          share of the corpus on Hedera.
        </span>
        {admission?.tx ? (
          <a
            href={`${ATS.hashscan}/transaction/${admission.tx}`}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-scribe-2 underline underline-offset-4 hover:text-scribe"
          >
            Added to the corpus security&rsquo;s whitelist on Hedera &#8599;
          </a>
        ) : null}
        {admission && !admission.admitted ? (
          <span className="text-[12px] leading-relaxed text-scribe-2">
            The proof stands, but the Hedera whitelist step did not happen: {admission.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border border-rule p-4">
      <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-scribe">
        Prove a person is driving
      </span>
      <p className="text-[13px] leading-relaxed text-scribe-3">
        Thenar pays for demonstrations a human made. Your wallet confirms the request, then you take
        a World ID Selfie Check on your phone once: it binds a live human to this address without
        telling us who you are.
      </p>
      <Button variant="primary" onClick={begin} disabled={(human === undefined && !error) || busy !== null}>
        {busy === "asking"
          ? "Preparing the request…"
          : busy === "signing"
            ? "Confirm in your wallet…"
            : busy === "checking"
              ? "Checking the proof…"
              : human === undefined && !error
                ? "Checking your World ID…"
                : "Verify with World ID"}
      </Button>
      {error ? <p className="text-[13px] leading-relaxed text-scribe-2">{error}</p> : null}
      {pending ? (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={pending.request.app_id}
          action={pending.request.action}
          rp_context={pending.request.rp_context}
          environment={pending.request.environment}
          allow_legacy_proofs
          preset={selfieCheckLegacy({ signal: pending.request.signal })}
          onSuccess={finish}
          onError={(code) => {
            setError(worldErrorMessage(code));
            void reportWorldError(address, code);
          }}
        />
      ) : null}
    </div>
  );
}
