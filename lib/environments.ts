import index from "@/public/environments/index.json";
import { SCENARIOS, scenarioName } from "@/lib/chain";

export type Environment = {
  id: string;
  label: string;
  blurb: string;
  surfaceWidthMm: number;
  surfaceDepthMm: number;
  url: string;
  bytes: number;
};

export const ENVIRONMENTS = index.environments as Environment[];

export const environmentById = (id: string) => ENVIRONMENTS.find((e) => e.id === id);

/**
 * Which room a task happens in.
 *
 * Deliberately a function of the task's `scenario`, which is a uint8 on the
 * contract — so the room is derivable from chain state by anyone, with no
 * off-chain table to trust or lose. Choosing a room in /post is choosing that
 * index; there is nowhere else the choice is kept.
 *
 * The vocabulary is SCENARIOS in lib/chain.ts and the ids here are the same
 * strings, so the two cannot drift apart without this failing loudly.
 */
export function environmentForScenario(scenario: number | string): Environment {
  const name = typeof scenario === "number" ? scenarioName(scenario) : scenario;
  const found = environmentById(name);
  if (found) return found;
  // `general` is generated unconditionally, so this is a real fallback and not
  // a silent blank room.
  return environmentById("general")!;
}

/** Every scenario has a room, checked here rather than discovered in a demo. */
export const SCENARIOS_WITH_ROOMS = SCENARIOS.map((s) => ({
  scenario: s,
  index: SCENARIOS.indexOf(s),
  environment: environmentById(s),
}));
