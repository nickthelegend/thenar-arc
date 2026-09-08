import index from "@/public/props/index.json";

export type Prop = {
  id: string;
  label: string;
  scenario: string;
  role: "payload" | "target";
  /** Footprint width in millimetres, so the station can scale it into metres. */
  widthMm: number;
  url: string;
  bytes: number;
};

export const PROPS = index.props as Prop[];

export const propById = (id: string): Prop | undefined => PROPS.find((p) => p.id === id);

export const payloads = () => PROPS.filter((p) => p.role === "payload");
export const targets = () => PROPS.filter((p) => p.role === "target");

/**
 * Which props a task is about.
 *
 * A task carries its instruction as free text — "put the toothpaste into the
 * upper drawer" — and until now the station drew an anonymous cylinder for it,
 * so every recorded trajectory was a demonstration of moving a grey puck. The
 * instruction already names the objects; this reads them back out.
 *
 * Matching is on the longest label first, so "honey jar" wins over "jar" and
 * "pen cup" over "pen". A task that names nothing we model falls back to the
 * scenario's default pair rather than rendering nothing.
 */
const ALIASES: Record<string, string> = {
  "honey jar": "jar", "pen cup": "pen_cup", "air fryer": "air_fryer",
  "upper drawer": "drawer", "far shelf": "shelf", "closed laptop": "laptop",
};

const DEFAULTS: Record<string, [string, string]> = {
  kitchen:  ["mug", "shelf"],
  office:   ["pen", "pen_cup"],
  bathroom: ["toothpaste", "drawer"],
  workshop: ["eraser", "crate"],
  home:     ["mug", "drawer"],
  play:     ["dice", "crate"],
  general:  ["mug", "crate"],
};

const needles = (): { needle: string; id: string }[] => {
  const out = Object.entries(ALIASES).map(([needle, id]) => ({ needle, id }));
  for (const p of PROPS) out.push({ needle: p.label.toLowerCase(), id: p.id });
  return out.sort((a, b) => b.needle.length - a.needle.length);
};

export type TaskScene = {
  /** Every payload the instruction names, in the order it names them. A run
   *  places them in that order; one payload is the ordinary case. */
  payloads: Prop[];
  target: Prop;
  /** True when the instruction named no object we model, so the station draws
   *  one from the scenario's pool per run rather than the same object forever. */
  varies: boolean;
};

/**
 * The payloads a task may legitimately use.
 *
 * Only consulted when the instruction names nothing we model. "Put the
 * toothpaste into the upper drawer" is about the toothpaste and nothing else;
 * "practise a transfer in the kitchen" is about the transfer, and forty
 * recordings of the same mug are worth less as training data than forty
 * recordings of the same motion over different objects. Varying only in the
 * second case is what keeps the scene from ever contradicting the instruction.
 */
export function variantPool(scenario: string): Prop[] {
  const own = payloads().filter((p) => p.scenario === scenario);
  const pool = own.length >= 2 ? own : payloads();
  return [...pool].sort((a, b) => a.id.localeCompare(b.id));
}

/** How many payloads one scene may carry. The arm is single, so a third
 *  object would sit on the table for the whole run doing nothing. */
export const MAX_PAYLOADS = 2;

export function sceneForTask(
  instruction: string,
  scenario: string,
  /** Which pool entry this particular run drew. Ignored unless the instruction
   *  named nothing — a named object is never overridden. */
  variant?: number,
): TaskScene {
  const text = instruction.toLowerCase();

  // Collect every prop the instruction names, with where it was named. Order in
  // the sentence is what disambiguates: "put the shrimp to the left of the
  // honey jar" names the thing being moved first and the landmark second, so
  // picking by label length instead would have moved the jar.
  const hits: { at: number; end: number; prop: Prop }[] = [];
  const claimed: [number, number][] = [];
  for (const { needle, id } of needles()) {
    const at = text.indexOf(needle);
    if (at < 0) continue;
    // A longer label already covering this span wins: "honey jar" beats "jar".
    if (claimed.some(([s, e]) => at >= s && at < e)) continue;
    const prop = propById(id);
    if (!prop) continue;
    claimed.push([at, at + needle.length]);
    hits.push({ at, end: at + needle.length, prop });
  }
  hits.sort((a, b) => a.at - b.at);

  // Every payload the sentence names, not only the first — but only where the
  // sentence actually conjoins them. "Put the fork and the spoon into the
  // drawer" is two placements in the order written. "Put the shrimp to the
  // left of the honey jar" is one placement against a landmark that happens to
  // be a graspable object, and treating the jar as cargo moved the wrong
  // thing. The connector between the two names is what tells them apart.
  const CONJOINED = /^[,\s]*(and\s+|&\s+|,\s*)(the\s+|a\s+|an\s+)?$/;
  const carried = hits.filter((h) => h.prop.role === "payload");
  const named: Prop[] = [];
  for (const h of carried) {
    if (named.length === 0) { named.push(h.prop); continue; }
    const prev = carried[carried.indexOf(h) - 1];
    if (CONJOINED.test(text.slice(prev.end, h.at))) named.push(h.prop);
    else break;
  }

  // A landmark is whatever is named after the payload — usually a target prop,
  // but "stack the honey jar behind the toast" makes a payload the reference.
  const target =
    hits.find((h) => h.prop.role === "target")?.prop ??
    hits.filter((h) => !named.includes(h.prop))[0]?.prop;

  const [dp, dt] = DEFAULTS[scenario] ?? DEFAULTS.general;

  // Two payloads at most, and never the same object twice: "put the mug on the
  // other mug" would otherwise spawn two objects at one position.
  const unique = named.filter((p, i) => named.indexOf(p) === i).slice(0, MAX_PAYLOADS);

  if (unique.length > 0) {
    return { payloads: unique, target: target ?? propById(dt)!, varies: false };
  }

  // Nothing named: the scene is free to vary, and does, per run.
  const pool = variantPool(scenario);
  const drawn =
    variant === undefined
      ? (propById(dp) ?? pool[0])
      : pool[((variant % pool.length) + pool.length) % pool.length];

  return { payloads: [drawn], target: target ?? propById(dt)!, varies: true };
}

/**
 * The single-payload view, for surfaces that show one object per task.
 *
 * Kept as its own function rather than inlined at each call site: a card that
 * quietly picked `payloads[0]` would look identical whether the task had one
 * object or two, which is exactly the confusion the multi-object scene exists
 * to avoid. Callers that can show more use `sceneForTask` directly.
 */
export function propsForTask(instruction: string, scenario: string): { payload: Prop; target: Prop } {
  const { payloads: ps, target } = sceneForTask(instruction, scenario);
  return { payload: ps[0], target };
}

/**
 * What to call a task's payload on a card.
 *
 * Three cases, and conflating them is how a list starts lying: a task that
 * names one object, a task that names two and wants them in that order, and a
 * task that names none — where every run draws its own object, so printing any
 * single label would claim a fixture the task does not have.
 */
export function payloadLabel(scene: { payloads: Prop[]; varies: boolean }, scenario: string): string {
  if (scene.varies) {
    const n = variantPool(scenario).length;
    return `any of ${n} ${scenario === "general" ? "" : `${scenario} `}objects`.replace("  ", " ");
  }
  return scene.payloads.map((p) => p.label).join(" then ");
}
