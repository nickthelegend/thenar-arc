"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { SO101 } from "@/lib/so101";
import { commandMessage, toHex } from "@/lib/robot-command";
import { useSession } from "@/components/session";
import type { Ed25519SigningSession } from "@category-labs/mera";
import { leaderFromRelay, relayLeaderGone } from "@/components/station/leader";

/**
 * Mirror the station's SO-101 onto a real one, through the arm relay on this
 * machine (scripts/arm-relay.mjs).
 *
 * The page only proposes joint angles. Whether a servo moves is the relay's
 * decision: it arms only when started with --arm and only from the home pose,
 * checks every target against the limits and the table, and stops the arm the
 * moment this stream goes quiet — a closed tab, a hidden one, a lost socket.
 *
 * To arm from home, a mirror begins by holding the home pose for a second,
 * then eases from home to wherever the arm on screen is, and only then follows
 * it live. The real arm never jumps.
 */
export const RELAY_URL = "ws://127.0.0.1:8787";
const RELAY_KEY = "thenar:relay-url";

/**
 * Where this browser finds the relay: ws://127.0.0.1:8787 unless told otherwise.
 * A relay started with --port elsewhere (8787 already taken on the machine) is
 * reached by opening the page once with ?relay=ws://127.0.0.1:PORT; this
 * browser then remembers it. Only a loopback address is accepted, because the
 * relay drives hardware and is never reached over the network.
 */
export function relayUrl(): string {
  const loopback = (u: string | null) => (u && /^ws:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/.test(u) ? u : null);
  try {
    const asked = loopback(new URL(location.href).searchParams.get("relay"));
    if (asked) localStorage.setItem(RELAY_KEY, asked);
    return asked ?? loopback(localStorage.getItem(RELAY_KEY)) ?? RELAY_URL;
  } catch {
    return RELAY_URL;
  }
}
const HZ = 30;
const HOLD_S = 1.2;
const EASE_S = 1.5;

type Phase = "off" | "connecting" | "home" | "ease" | "live";
export type RelayStatus = {
  phase: Phase;
  error: string | null;
  follower: { port: string; armed: boolean; canArm: boolean; reason: string } | null;
  leader: { port: string; streaming: boolean } | null;
  /** The arm's owner key, when the relay was started with --owner. */
  owner: string | null;
  /** Whether this page holds the owner's signing key for this session. */
  unlocked: boolean;
};

const link = {
  ws: null as WebSocket | null,
  phase: "off" as Phase,
  phaseAt: 0,
  sentAt: 0,
  status: { phase: "off", error: null, follower: null, leader: null, owner: null, unlocked: false } as RelayStatus,
  /** The owner's command key, held only while mirroring; zeroed on disconnect. */
  signer: null as Ed25519SigningSession | null,
  seq: 0,
  listeners: new Set<(s: RelayStatus) => void>(),
};

function publish(patch: Partial<RelayStatus>) {
  link.status = { ...link.status, ...patch, phase: link.phase };
  for (const l of link.listeners) l(link.status);
}
function setPhase(p: Phase) {
  link.phase = p;
  link.phaseAt = performance.now();
  publish({});
}

export function connectRelay() {
  if (link.ws) return;
  setPhase("connecting");
  publish({ error: null });
  const ws = new WebSocket(relayUrl());
  link.ws = ws;
  ws.onopen = () => setPhase("home");
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(String(e.data));
      if (m.type === "status") {
        publish({ follower: m.follower, leader: m.leader, owner: m.owner ?? null });
        if (!m.leader?.streaming) relayLeaderGone();
      }
      // A leader plugged into the relay drives the arm on screen as well as the follower.
      if (m.type === "leader") leaderFromRelay(m.q);
    } catch {
      /* not ours */
    }
  };
  ws.onerror = () => publish({ error: "The arm relay isn't running. Start it: node scripts/arm-relay.mjs" });
  ws.onclose = () => {
    link.ws = null;
    relayLeaderGone();
    endSigner();
    setPhase("off");
  };
}

export function disconnectRelay() {
  const ws = link.ws;
  if (!ws) return;
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
  ws.close();
}

function endSigner() {
  link.signer?.end();
  link.signer = null;
  publish({ unlocked: false });
}

/**
 * Hold the owner's command key for this session, derived from their passkey.
 * Refused, and the key discarded, when it is not the key the arm belongs to.
 */
export async function unlockWithPasskey(address: string): Promise<void> {
  const { robotSession } = await import("@/lib/robot-key");
  const session = await robotSession(address);
  const key = toHex(session.publicKey);
  if (link.status.owner && key !== link.status.owner) {
    session.end();
    throw new Error("This arm is paired with a different passkey.");
  }
  link.signer?.end();
  link.signer = session;
  link.seq = 0;
  publish({ unlocked: true });
}

/** The public half of this passkey's arm key, to start a relay with. */
export async function armKeyFor(address: string): Promise<string> {
  const { robotSession } = await import("@/lib/robot-key");
  const session = await robotSession(address);
  try {
    return toHex(session.publicKey);
  } finally {
    session.end();
  }
}

/** Start again from home: used after the relay stopped the arm. */
export function rehome() {
  if (link.ws) setPhase("home");
}

/**
 * Called by the drawn SO-101 every frame with its joints, in degrees (the
 * five reaching joints and the jaw). Sends at most 30 times a second.
 */
export function mirrorJoints(liveDeg: readonly number[]) {
  const ws = link.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - link.sentAt < 1000 / HZ) return;
  link.sentAt = now;
  const t = (now - link.phaseAt) / 1000;
  let q: number[];
  if (link.phase === "home") {
    q = [...SO101.homeDeg];
    if (t >= HOLD_S) setPhase("ease");
  } else if (link.phase === "ease") {
    const k = Math.min(1, t / EASE_S);
    const s = k * k * (3 - 2 * k);
    q = SO101.homeDeg.map((h, i) => h + (liveDeg[i] - h) * s);
    if (k >= 1) setPhase("live");
  } else if (link.phase === "live") {
    q = [...liveDeg];
  } else return;
  const qr = q.map((v) => Number(v.toFixed(2)));
  if (!link.status.owner) {
    ws.send(JSON.stringify({ type: "state", q: qr }));
    return;
  }
  // An owned arm: every frame signed with the owner's key, or not sent at all.
  const signer = link.signer;
  if (!signer) return;
  const seq = ++link.seq, ts = Date.now();
  void signer.signMessage(commandMessage(seq, ts, qr)).then(
    (sig) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "state", q: qr, seq, ts, sig: toHex(sig) })); },
    () => undefined,
  );
}

function useRelayStatus(): RelayStatus {
  const [s, set] = useState(link.status);
  useEffect(() => {
    link.listeners.add(set);
    return () => void link.listeners.delete(set);
  }, []);
  return s;
}

/** The sidebar control. Only rendered on an SO-101 task. */
export function MirrorPanel() {
  const s = useRelayStatus();
  const session = useSession();
  const [key, setKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const withPasskey = async (fn: (address: string) => Promise<void>) => {
    if (!session.address) return setKeyError("Sign in first: the arm key comes from your passkey.");
    setKeyError(null); setKeyBusy(true);
    try { await fn(session.address); } catch (e) {
      const m = e instanceof Error ? e.message : "The passkey did not answer.";
      setKeyError(/NotAllowedError|timed out|not allowed/i.test(m) ? "The passkey prompt was closed. Try again." : m);
    } finally { setKeyBusy(false); }
  };
  // Leaving the station stops the arm, rather than leaving it holding the last pose.
  useEffect(() => () => disconnectRelay(), []);
  const on = s.phase !== "off";
  const f = s.follower;
  const line = !on
    ? null
    : s.phase === "connecting"
      ? "Connecting to the relay…"
      : !f
        ? "Relay connected, but no follower on it: start it with --follower /dev/cu.… to drive the arm."
        : f.armed
          ? s.phase === "live" ? "Armed. The arm on your desk follows the one on screen." : "Armed. Easing from home to the pose on screen…"
          : f.canArm
            ? s.phase === "home" || s.phase === "ease" ? "Holding home so the follower can arm…" : `Stopped${f.reason ? `: ${f.reason}` : ""}. Send it home to arm again.`
            : "Streaming, not armed: the relay was started without --arm, so nothing moves.";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => (on ? disconnectRelay() : connectRelay())}
          className={cn(
            "border px-3 py-1.5 text-[12px] transition-colors",
            on ? "border-signal text-signal hover:bg-signal hover:text-ink-0" : "border-rule-strong text-scribe hover:border-scribe",
          )}
        >
          {on ? "Stop mirroring" : "Mirror to my SO-101"}
        </button>
        {on && f && !f.armed && f.canArm && s.phase === "live" ? (
          <button type="button" onClick={rehome} className="border border-rule-strong px-3 py-1.5 text-[12px] text-scribe hover:border-scribe">
            Send home
          </button>
        ) : null}
      </div>
      {line ? <p className={cn("text-[13px] leading-relaxed", f?.armed ? "text-go" : "text-scribe-3")}>{line}</p> : null}
      {on && s.owner && !s.unlocked ? (
        <div className="flex flex-col gap-1.5 border border-rule p-2.5">
          <p className="text-[13px] leading-relaxed text-scribe-2">
            This arm only moves for its owner&rsquo;s passkey. Unlock it to send signed commands.
          </p>
          <button type="button" disabled={keyBusy} onClick={() => withPasskey((a) => unlockWithPasskey(a))}
            className="self-start border border-signal px-3 py-1.5 text-[12px] text-signal hover:bg-signal hover:text-ink-0 disabled:opacity-60">
            {keyBusy ? "Waiting for your passkey…" : "Unlock with your passkey"}
          </button>
        </div>
      ) : null}
      {on && s.owner && s.unlocked ? (
        <p className="text-[13px] leading-relaxed text-go">Unlocked: every command is signed by your passkey&rsquo;s arm key.</p>
      ) : null}
      {s.error ? <p className="text-[13px] leading-relaxed text-reject">{s.error}</p> : null}
      {!on ? (
        <p className="text-xs text-scribe-3">
          Through <code className="font-mono">scripts/arm-relay.mjs</code> on this computer. It arms only from home and stops when this tab does.
        </p>
      ) : null}
      {!on ? (
        <div className="flex flex-col gap-1.5">
          <button type="button" disabled={keyBusy} onClick={() => withPasskey(async (a) => setKey(await armKeyFor(a)))}
            className="self-start text-[12px] text-scribe-3 hover:text-signal disabled:opacity-60">
            {keyBusy ? "Waiting for your passkey…" : "Pair the arm with my passkey"}
          </button>
          {key ? (
            <div className="flex flex-col gap-1 text-[12px] text-scribe-3">
              <span>Your passkey&rsquo;s arm key. Start the relay with it, and the arm moves only for you:</span>
              <code className="break-all border border-rule px-2 py-1 font-mono text-[11px] text-scribe">
                node scripts/arm-relay.mjs --follower /dev/cu.usbserial-… --arm --owner {key}
              </code>
            </div>
          ) : null}
        </div>
      ) : null}
      {keyError ? <p className="text-[13px] text-reject">{keyError}</p> : null}
    </div>
  );
}
