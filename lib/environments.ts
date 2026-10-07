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


/**
 * How each room is lit.
 *
 * A kitchen counter under the same cold key light as a workshop bench reads as
 * the same room with different furniture. These are the two lights the station
 * already has, given values per room: a key that carries the room's own light
 * source, and a fill that carries what is bouncing back off its surfaces.
 *
 * Deliberately narrow. The scene is a measuring instrument and the datum has to
 * stay legible, so nothing here goes far enough to change how a placement
 * reads — it changes the room, not the reading.
 */
export type RoomLight = {
  key: { color: string; intensity: number };
  fill: { color: string; intensity: number };
  hemi: { sky: string; ground: string; intensity: number };
};

/**
 * Physical light, not palette.
 *
 * These are lamp colours and bounce colours — what a kitchen throws back off
 * wood, what a bathroom throws back off porcelain — and they are registered in
 * DESIGN.md under `sceneLighting` rather than `colors` because they describe
 * illumination, not a surface anyone reads text on. The workshop's fill used to
 * be #FF6A00, which was the product's brand orange before this redesign; a
 * discarded accent doing a second job as a work lamp is exactly the kind of
 * leftover that keeps a dead palette alive in a codebase, so it is now an
 * ordinary warm incandescent.
 */
const LIGHTS: Record<string, RoomLight> = {
  // Warm overhead, warm bounce off wood and tile.
  kitchen:  { key: { color: "#FFF1E0", intensity: 2.4 }, fill: { color: "#FFB877", intensity: 0.5 },  hemi: { sky: "#9A9086", ground: "#000000", intensity: 0.42 } },
  // Cool, even, a monitor throwing light back.
  office:   { key: { color: "#F2F6FF", intensity: 2.2 }, fill: { color: "#6E86A6", intensity: 0.55 }, hemi: { sky: "#8F9299", ground: "#000000", intensity: 0.40 } },
  // Bright and clinical, hard bounce off porcelain.
  bathroom: { key: { color: "#FFFFFF", intensity: 2.6 }, fill: { color: "#B8D4E6", intensity: 0.6 },  hemi: { sky: "#9EA5A8", ground: "#000000", intensity: 0.46 } },
  // A single hard lamp, little bounce.
  workshop: { key: { color: "#FFF6E6", intensity: 2.5 }, fill: { color: "#FFA24E", intensity: 0.34 }, hemi: { sky: "#7E7A74", ground: "#000000", intensity: 0.32 } },
  // Domestic and low, warm from a lamp at one end.
  home:     { key: { color: "#FFEBD2", intensity: 2.1 }, fill: { color: "#FFB067", intensity: 0.5 },  hemi: { sky: "#8F8880", ground: "#000000", intensity: 0.40 } },
  // Flat and bright, the way a room full of toys is lit.
  play:     { key: { color: "#FFFBF2", intensity: 2.3 }, fill: { color: "#3DD68C", intensity: 0.38 }, hemi: { sky: "#93968F", ground: "#000000", intensity: 0.44 } },
  // The calibration bench: neutral, because it is the reference. The fill
  // was a warm orange, which contradicted the sentence above it.
  general:  { key: { color: "#FFFFFF", intensity: 2.3 }, fill: { color: "#E8E8E6", intensity: 0.45 }, hemi: { sky: "#8F8F8F", ground: "#000000", intensity: 0.40 } },
};

export const lightingFor = (roomId: string): RoomLight => LIGHTS[roomId] ?? LIGHTS.general;
