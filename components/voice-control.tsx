"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { parseCommand, VOICE_GRAMMAR } from "@/lib/voice";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/**
 * Drive the station by saying what to do.
 *
 * Every recognised command is dispatched as the keyboard event the station
 * already listens for, rather than reaching into the arm directly. That is
 * deliberate: one control path means a voice-driven run and a keyboard-driven
 * run cannot produce subtly different trajectories, and the recording stays a
 * recording of the same machine either way.
 *
 * Recognition is the browser's own. Nothing is recorded, nothing is uploaded,
 * and the last transcript is shown so the operator can see what was heard
 * rather than guess why the arm did or did not move.
 */
export function VoiceControl({ className }: { className?: string }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [on, setOn] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const rec = useRef<SpeechRecognitionLike | null>(null);
  // Read inside the recognition handler without making it a dependency, so
  // the session is not torn down and rebuilt every time the operator speaks.
  // Written in an effect rather than during render: a ref assigned while
  // rendering is a write React is allowed to discard.
  const onRef = useRef(false);
  useEffect(() => { onRef.current = on; }, [on]);

  useEffect(() => {
    const t = setTimeout(() => {
      const w = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const press = useCallback((key: string, times: number) => {
    for (let i = 0; i < times; i += 1) {
      // A held key and a tapped key move the tool by different amounts, so
      // each step is a full down-then-up, spaced far enough apart that the
      // station's own frame loop sees them as separate presses.
      //
      // cancelable, because the station calls preventDefault on these keys to
      // stop space activating whatever button has focus. An uncancelable event
      // would make that call a silent no-op and space would end the run
      // instead of closing the jaws.
      setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        setTimeout(() => {
          window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
        }, 90);
      }, i * 200);
    }
  }, []);

  const stop = useCallback(() => {
    setOn(false);
    try { rec.current?.stop(); } catch { /* already stopped */ }
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-GB";

    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const said = last?.[0]?.transcript?.trim() ?? "";
      setHeard(said);
      const cmd = parseCommand(said);
      if (!cmd) return;
      if (cmd.kind === "stop") { stop(); return; }
      if (cmd.kind === "grip") {
        // Space toggles the jaws, so it is only pressed when the state the
        // operator asked for is not the state they are already in — which the
        // station reports through the same attribute the readout uses.
        const closed = document.body.dataset.jaws === "closed";
        if (closed !== cmd.close) press(" ", 1);
        return;
      }
      press(cmd.key, cmd.times);
    };

    r.onerror = (e) => {
      setRefused(
        e.error === "not-allowed"
          ? "The browser refused the microphone."
          : e.error === "no-speech"
            ? null
            : `Recognition stopped: ${e.error}`,
      );
      if (e.error === "not-allowed") setOn(false);
    };

    // Browsers end a continuous session on their own after a pause. Restart it
    // while the operator still has it switched on, or voice control silently
    // stops working mid-run.
    r.onend = () => {
      if (!onRef.current) return;
      try { r.start(); } catch { /* already restarting */ }
    };

    rec.current = r;
    setRefused(null);
    try { r.start(); setOn(true); } catch { setRefused("Recognition would not start."); }
  }, [press, stop]);

  useEffect(() => () => { try { rec.current?.stop(); } catch { /* gone */ } }, []);

  if (supported === false) {
    return (
      <p className={cn("font-mono text-[12px] text-scribe-3", className)}>
        This browser has no speech recognition, so voice control is not offered.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => (on ? stop() : start())}
        aria-pressed={on}
        className={cn(
          "flex items-center justify-between gap-3 border px-3 py-2 text-left transition-colors",
          on ? "border-signal text-signal" : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe",
        )}
      >
        <span className="font-mono text-[12px] uppercase tracking-[0.14em]">
          {on ? "Listening" : "Drive by voice"}
        </span>
        <span aria-hidden className={cn("h-2 w-2 rounded-full", on ? "animate-pulse bg-signal" : "bg-rule-strong")} />
      </button>

      {refused ? (
        <p className="font-mono text-[12px] text-reject">{refused}</p>
      ) : null}

      {on ? (
        <>
          <p className="font-mono text-[12px] text-scribe-3" aria-live="polite">
            {heard ? `heard “${heard}”` : "say a direction"}
          </p>
          <dl className="flex flex-col gap-1">
            {VOICE_GRAMMAR.map((g) => (
              <div key={g.say} className="flex items-baseline justify-between gap-3">
                <dt className="font-mono text-[12px] text-scribe-2">{g.say}</dt>
                <dd className="text-right text-[12px] text-scribe-3">{g.does}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] leading-relaxed text-scribe-3">
            Recognition runs in this browser. Nothing is recorded and no audio
            leaves the page.
          </p>
        </>
      ) : null}
    </div>
  );
}
