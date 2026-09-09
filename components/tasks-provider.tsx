"use client";

import { createContext, useContext, useMemo } from "react";
import { useTasks, type ChainTask } from "@/lib/hooks";
import { sceneForTask, type Prop } from "@/lib/props";
import { environmentForScenario, type Environment } from "@/lib/environments";
import { skillForTask, armsForTask, type Skill } from "@/lib/skills";

/**
 * A task and everything it takes to draw it.
 *
 * The contract stores a task's instruction, its scenario index and its
 * economics. What it looks like — which payload, which landmark, which room —
 * is derived from those, and until now every surface derived it separately:
 * the hub, the floor, the task page and the station each ran their own
 * resolution, so a task could plausibly be drawn one way in a list and another
 * way in the scene it was actually recorded in.
 *
 * Deriving it once, here, is what makes that impossible. Nothing is stored: the
 * scene is a pure function of chain state, so it survives this provider being
 * deleted and can be recomputed by anyone reading the contract.
 */
export type Scene = {
  /** The first payload. Every surface that shows one object per task reads
   *  this; the station reads `payloads`, which may hold two. */
  payload: Prop;
  /** Every payload the instruction names, in the order it names them. */
  payloads: Prop[];
  target: Prop;
  room: Environment;
  /** How many arms the instruction asks for. Two only where it says so. */
  arms: 1 | 2;
  /** The instruction named no object we model, so the station draws one from
   *  the scenario's pool per run and the card says so rather than implying a
   *  fixed object it does not have. */
  varies: boolean;
};
export type TaskWithScene = ChainTask & { scene: Scene; skill: Skill };

type Ctx = {
  tasks: TaskWithScene[];
  byId: (id: number) => TaskWithScene | undefined;
  open: TaskWithScene[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

const TasksContext = createContext<Ctx | null>(null);

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError, error, refetch } = useTasks();

  const value = useMemo<Ctx>(() => {
    const tasks: TaskWithScene[] = (data ?? []).map((t) => {
      const { payloads, target, varies } = sceneForTask(t.name, t.scenario);
      return {
        ...t,
        scene: {
          payload: payloads[0],
          payloads,
          target,
          room: environmentForScenario(t.scenario),
          arms: armsForTask(t.name),
          varies,
        },
        // The manipulation the instruction asks for. Derived, like the scene, so
        // it stays recoverable from chain state rather than kept in a side table.
        skill: skillForTask(t.name),
      };
    });
    const index = new Map(tasks.map((t) => [t.id, t]));
    return {
      tasks,
      byId: (id: number) => index.get(id),
      open: tasks.filter((t) => t.slotsTotal - t.slotsFilled > 0),
      isLoading,
      isError,
      error,
      refetch: () => void refetch(),
    };
  }, [data, isLoading, isError, error, refetch]);

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

/** Throws rather than returning empty: a surface reading tasks outside the
 *  provider would silently render "no tasks", which reads as an empty protocol
 *  rather than as the wiring mistake it is. */
export function useTaskCatalogue(): Ctx {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTaskCatalogue must be used inside <TasksProvider>.");
  return ctx;
}

/** One task with its scene, or undefined while the catalogue is loading. */
export function useCatalogueTask(id: number | undefined): TaskWithScene | undefined {
  const { byId } = useTaskCatalogue();
  return id === undefined || !Number.isInteger(id) ? undefined : byId(id);
}
