"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { LEADER_HOME, LEADER_JOINTS } from "@/lib/leader-protocol";
import { connectRelay } from "@/components/station/arm-link";
import {
  connectLeaderSerial, disconnectLeaderSerial, flipLeaderJoint, forgetLeader, serialAvailable,
  setLeaderDrive, useLeader, zeroLeader,
} from "@/components/station/leader";

const SIGNS_KEY = "thenar:leader:signs";
const readSigns = (): (1 | -1)[] => {
  try {
    const v = JSON.parse(localStorage.getItem(SIGNS_KEY) ?? "null");
    if (Array.isArray(v) && v.length === 6 && v.every((x) => x === 1 || x === -1)) return v;
  } catch { /* no storage */ }
  return [1, 1, 1, 1, 1, 1];
};
const writeSigns = (s: (1 | -1)[]) => {
  try { localStorage.setItem(SIGNS_KEY, JSON.stringify(s)); } catch { /* no storage */ }
};

/**
 * The station's control for a physical SO-101 leader (six AS5600 encoders on
 * an ESP32; thenar-arms' firmware). Plug it in, connect, and the arm on screen
 * follows your hand. Only rendered on an SO-101 task.
 */
export function LeaderPanel() {
  const s = useLeader();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [signs, setSigns] = useState<(1 | -1)[]>(readSigns);
  const usb = s.source === "serial";
  const on = s.source !== null;

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true); setNote(null);
    try { await fn(); if (done) setNote(done); } catch (e) {
      setNote(e instanceof Error ? e.message : "The leader did not answer.");
    } finally { setBusy(false); }
  };

  const flip = (j: number) => {
    const next = [...signs] as (1 | -1)[];
    next[j] = next[j] === 1 ? -1 : 1;
    void run(async () => {
      await flipLeaderJoint(j, next[j]);
      setSigns(next);
      writeSigns(next);
    }, `${LEADER_JOINTS[j]} now turns the other way.`);
  };

  const btn = "border px-3 py-1.5 text-[12px] transition-colors disabled:opacity-60";

  if (!on) {
    return (
      <div className="flex flex-col gap-2">
        {serialAvailable() ? (
          <button type="button" disabled={s.connecting} onClick={() => void connectLeaderSerial()}
            className={cn(btn, "self-start border-signal text-signal hover:bg-signal hover:text-ink-0")}>
            {s.connecting ? "Choose the leader's port…" : "Drive with my leader arm"}
          </button>
        ) : null}
        <button type="button" onClick={connectRelay}
          className="self-start text-[12px] text-scribe-3 hover:text-signal">
          My leader is on the arm relay
        </button>
        <p className="text-xs text-scribe-3">
          {serialAvailable()
            ? "Plug your SO-101 leader in by USB. The arm on screen follows your hand."
            : "Needs Chrome or Edge on a computer, or the arm relay with --leader."}
        </p>
        {s.error ? <p className="text-[13px] text-reject">{s.error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="leader-panel">
      <p className={cn("text-[13px] leading-relaxed", s.calibrated && s.drive ? "text-go" : "text-scribe-2")}>
        {s.calibrated === false
          ? "Leader connected, not calibrated yet."
          : !s.calibrated
            ? `Leader connected over ${usb ? "USB" : "the relay"}. Waiting for its first pose…`
            : s.drive
              ? `Your leader is driving the arm${usb ? "" : ", and your follower through the relay"}. ${s.hz ? `${s.hz} Hz.` : ""}`
              : "Leader connected. The keyboard has the arm."}
      </p>

      {s.calibrated === false && usb ? (
        <div className="flex flex-col gap-1.5 border border-rule p-2.5">
          <p className="text-[13px] leading-relaxed text-scribe-2">
            Hold the leader in its home pose, then set it: base {LEADER_HOME[0]}°, shoulder {LEADER_HOME[1]}°,
            elbow +{LEADER_HOME[2]}°, wrist {LEADER_HOME[3]}°, roll {LEADER_HOME[4]}°, jaw {LEADER_HOME[5]}° open.
            The leader remembers it.
          </p>
          <button type="button" disabled={busy} onClick={() => void run(zeroLeader)}
            className={cn(btn, "self-start border-signal text-signal hover:bg-signal hover:text-ink-0")}>
            {busy ? "Setting…" : "This is home"}
          </button>
          {s.raw ? <p className="font-mono text-[11px] text-scribe-3">raw {s.raw.join(" ")}</p> : null}
        </div>
      ) : null}

      {s.calibrated && s.q ? (
        <table className="w-full font-mono text-[12px] tabular-nums" data-testid="leader-joints">
          <tbody>
            {LEADER_JOINTS.map((name, j) => (
              <tr key={name} className="border-b border-rule last:border-0">
                <td className="py-0.5 text-scribe-3">{name}</td>
                <td className="py-0.5 text-right text-scribe">{s.q![j].toFixed(1)}°</td>
                {usb ? (
                  <td className="py-0.5 pl-2 text-right">
                    <button type="button" disabled={busy} onClick={() => flip(j)} title="This joint turns the wrong way"
                      className="text-[11px] text-scribe-3 hover:text-signal disabled:opacity-60">
                      reverse
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {s.fault ? <p className="text-[13px] text-reject">The leader reports: {s.fault}</p> : null}
      {note ? <p className="text-[13px] text-scribe-2">{note}</p> : null}

      <div className="flex flex-wrap gap-2">
        {s.calibrated ? (
          <button type="button" onClick={() => setLeaderDrive(!s.drive)}
            className={cn(btn, "border-rule-strong text-scribe hover:border-scribe")}>
            {s.drive ? "Hand back to the keyboard" : "Drive with the leader"}
          </button>
        ) : null}
        {usb && s.calibrated ? (
          <button type="button" disabled={busy} onClick={() => void run(forgetLeader)}
            className={cn(btn, "border-rule-strong text-scribe-3 hover:border-scribe")}>
            Recalibrate
          </button>
        ) : null}
        {usb ? (
          <button type="button" onClick={() => void disconnectLeaderSerial()}
            className={cn(btn, "border-rule-strong text-scribe-3 hover:border-scribe")}>
            Disconnect
          </button>
        ) : null}
      </div>
    </div>
  );
}
