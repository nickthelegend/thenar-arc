"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const TOPICS: { id: string; label: string }[] = [
  { id: "task-filled", label: "A task I worked on fills" },
  { id: "policy-minted", label: "A policy is minted from it" },
  { id: "licence-sold", label: "That policy is licensed" },
];

/**
 * Be told when something happens, without handing over a way to be contacted.
 *
 * Email was rejected because there are no accounts and no addresses here, and
 * that is still true. Web push needs neither: the browser issues the
 * subscription, the keys are ours and were generated locally, and what the
 * server stores identifies a subscription the reader can revoke rather than a
 * person.
 *
 * Permission is requested on the click that asks for it and never on load. A
 * page that demands notification permission before you have decided you want
 * notifications is the reason browsers made that prompt so easy to refuse
 * permanently.
 */
export function Notify() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [topic, setTopic] = useState(TOPICS[0].id);
  const [state, setState] = useState<"off" | "on" | "working">("off");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const ok = typeof window !== "undefined"
        && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setSupported(ok);
      if (!ok) return;
      try {
        const cfg = await (await fetch("/api/notify")).json();
        setPublicKey(cfg.publicKey ?? null);
        const reg = await navigator.serviceWorker.ready;
        setState((await reg.pushManager.getSubscription()) ? "on" : "off");
      } catch { /* leave it off */ }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const b64ToBytes = (b64: string) => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  };

  const enable = useCallback(async () => {
    setError(null);
    if (!publicKey) { setError("Push is not configured on this deployment."); return; }
    setState("working");
    try {
      // Asked for here, on the click, and nowhere else.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("The browser did not grant notification permission.");
        setState("off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(publicKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, topic }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "The server refused the subscription.");
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not subscribe.");
      setState("off");
    }
  }, [publicKey, topic]);

  const disable = useCallback(async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/notify", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("off");
    }
  }, []);

  if (supported === false) {
    return (
      <p className="font-mono text-[12px] text-scribe-3">
        This browser has no push support, so there is nothing to switch on.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTopic(t.id)}
            disabled={state === "on"}
            className={cn(
              "border px-2 py-1 text-[12px] transition-colors",
              topic === t.id
                ? "border-signal text-signal"
                : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe",
              state === "on" && "opacity-60",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <span className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={state === "on" ? disable : enable}
          disabled={state === "working"}
          className={cn(
            "border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors",
            state === "on"
              ? "border-signal text-signal"
              : "border-rule-strong text-scribe hover:border-signal hover:text-signal",
          )}
        >
          {state === "working" ? "…" : state === "on" ? "Notifications on" : "Notify me"}
        </button>
        {error ? <span className="font-mono text-[12px] text-reject">{error}</span> : null}
      </span>

      <p className="max-w-[62ch] text-[12px] leading-relaxed text-scribe-3">
        No email and no account. The subscription is issued by your browser and
        what is stored is that subscription and a topic &mdash; no address, no
        name. Turning it off here removes it, and your browser can revoke it
        without asking us.
      </p>
    </div>
  );
}
