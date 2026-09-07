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

export function propsForTask(instruction: string, scenario: string): { payload: Prop; target: Prop } {
  const text = instruction.toLowerCase();

  // Collect every prop the instruction names, with where it was named. Order in
  // the sentence is what disambiguates: "put the shrimp to the left of the
  // honey jar" names the thing being moved first and the landmark second, so
  // picking by label length instead would have moved the jar.
  const hits: { at: number; prop: Prop }[] = [];
  const claimed: [number, number][] = [];
  for (const { needle, id } of needles()) {
    const at = text.indexOf(needle);
    if (at < 0) continue;
    // A longer label already covering this span wins: "honey jar" beats "jar".
    if (claimed.some(([s, e]) => at >= s && at < e)) continue;
    const prop = propById(id);
    if (!prop) continue;
    claimed.push([at, at + needle.length]);
    hits.push({ at, prop });
  }
  hits.sort((a, b) => a.at - b.at);

  const payload = hits.find((h) => h.prop.role === "payload")?.prop;
  // A landmark is whatever is named after the payload — usually a target prop,
  // but "stack the honey jar behind the toast" makes a payload the reference.
  const target =
    hits.find((h) => h.prop.role === "target")?.prop ??
    hits.filter((h) => h.prop !== payload)[0]?.prop;

  const [dp, dt] = DEFAULTS[scenario] ?? DEFAULTS.general;
  return {
    payload: payload ?? propById(dp)!,
    target: target ?? propById(dt)!,
  };
}
