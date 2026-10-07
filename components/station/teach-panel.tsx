"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { learn, type Skill } from "@/lib/teach";
import type { Sample } from "@/lib/types";
import type { ArmKind } from "@/lib/scan";

/**
 * Teach the arm from the best run a person was paid for on this task, then let
 * it do the task on its own. The lesson comes from this site's own dataset
 * export, so what the arm learns from is exactly what a buyer would download.
 * A repeat is practice: it is never submitted and never paid.
 */
export function TeachPanel({ taskId, arm, skill, onSkill, repeating, onRepeat }: {
  taskId: number;
  /** The arm the task is for, which is the arm its paid runs were recorded on. */
  arm: ArmKind;
  skill: Skill | null;
  onSkill: (s: Skill | null) => void;
  repeating: boolean;
  onRepeat: (on: boolean) => void;
}) {
  const [state, setState] = useState<{ text: string; bad?: boolean } | null>(null);

  const teach = async () => {
    setState({ text: "Reading the best paid run…" });
    try {
      const runs = await fetch(`/api/task/${taskId}/runs`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`the runs answered ${r.status}`))));
      const best = (runs.runs ?? [])[0];
      if (!best) return setState({ text: "No paid run on this task yet. Do it once yourself; the arm learns from the best paid run.", bad: true });
      const ep = await fetch(`/api/dataset?traj=${best.traj_hash}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`the dataset answered ${r.status}`))));
      const d = ep.data[0];
      const samples: Sample[] = d.timestamp.map((t: number, i: number) => ({ t, q: d.observation["state.joints"][i], grip: d.observation["state.gripper"][i], object: d.observation["state.object_pose"][i] }));
      const out = learn(samples, best.traj_hash, (ep.arm as ArmKind | undefined) ?? arm);
      if (!out.skill) return setState({ text: out.reason, bad: true });
      onSkill(out.skill);
      setState({ text: `Learned from run ${best.traj_hash.slice(0, 10)}… (score ${(best.score / 100).toFixed(0)}): grasp at ${out.skill.graspT.toFixed(1)} s, release at ${out.skill.releaseT.toFixed(1)} s.` });
    } catch (e) {
      setState({ text: `Could not teach: ${(e as Error).message}.`, bad: true });
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex gap-2">
        <button type="button" onClick={teach} className="flex-1 border border-rule px-3 py-2 text-left text-[12px] text-scribe-3 transition-colors hover:border-rule-strong hover:text-scribe">
          {skill ? "Teach again" : "Teach"}
        </button>
        <button
          type="button"
          disabled={!skill}
          onClick={() => onRepeat(!repeating)}
          aria-pressed={repeating}
          className={cn(
            "flex-1 border px-3 py-2 text-left text-[12px] transition-colors disabled:opacity-40",
            repeating ? "border-probe text-probe" : "border-rule text-scribe-3 hover:border-rule-strong hover:text-scribe",
          )}
        >
          {repeating ? "Repeating" : "Repeat alone"}
        </button>
      </div>
      {!state && !skill ? (
        <p className="text-[12px] leading-relaxed text-scribe-3">Teach learns from the best paid run on this task; Repeat then does it alone, as practice.</p>
      ) : null}
      {state ? <p className={cn("text-[12px] leading-relaxed", state.bad ? "text-reject" : "text-scribe-3")}>{state.text}</p> : null}
      {repeating ? (
        <p className="text-[12px] leading-relaxed text-scribe-3">
          Begin a run and the arm does the task by itself, bent to where this
          scene&rsquo;s payload and goal are. Practice only: the robot&rsquo;s own work is never submitted.
        </p>
      ) : null}
    </div>
  );
}
