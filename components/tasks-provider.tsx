"use client";

import { createContext, useContext, useMemo } from "react";
import { useTasks, type ChainTask } from "@/lib/hooks";
import { propsForTask, type Prop } from "@/lib/props";
import { environmentForScenario, type Environment } from "@/lib/environments";

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
export type Scene = { payload: Prop; target: Prop; room: Environment };
export type TaskWithScene = ChainTask & { scene: Scene };

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
      const { payload, target } = propsForTask(t.name, t.scenario);
      return { ...t, scene: { payload, target, room: environmentForScenario(t.scenario) } };
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
