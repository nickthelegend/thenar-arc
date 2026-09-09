import { propById, sceneForTask, type Prop } from "@/lib/props";
import { skillForTask } from "@/lib/skills";

/**
 * Instructions a funder can pick from, written from the objects they chose.
 *
 * "AI-generated task descriptions" was rejected for fabricating content in a
 * product whose claim is verifiability, and that objection was aimed at the
 * wrong thing. A funder drafting their own instruction with help is ordinary
 * authoring — they still edit it, sign it and fund it, and it is theirs. The
 * thing that would actually be a fabrication is a description of what a task
 * *contains*, and nothing here writes one of those.
 *
 * This is not a language model, and saying so matters more than it sounds:
 * every suggestion is composed from the props and scenario already selected,
 * so it is inspectable, reproducible, costs nothing to run, and cannot invent
 * an object that is not in the scene. A model could phrase these more
 * naturally. It could also quietly name a jar that was never there.
 *
 * The property that makes this worth shipping is the last step. An instruction
 * here is not merely generated — it is round-tripped through `sceneForTask`,
 * the same parser the station uses to decide what to render, and discarded
 * unless it resolves back to exactly the props it was written from. A
 * suggestion that would give the operator a different scene from the one
 * funded never reaches the funder.
 */

export type Suggestion = {
  text: string;
  /** What manipulation this phrasing asks for, as the app's own vocabulary
   *  reads it back. Shown so a funder can see they are choosing a task and not
   *  just a sentence. */
  skill: string;
};

/** Landmarks you put something *into* rather than *on*. */
const CONTAINERS = new Set(["drawer", "crate", "pen_cup", "air_fryer", "bin", "basket", "sink"]);

/**
 * Phrasings that fit the landmark, rather than every phrasing that parses.
 *
 * The round trip below proves a suggestion renders the intended scene. It says
 * nothing about whether the sentence means anything, and the first version of
 * this offered "Insert the pen into the laptop" — which parses perfectly,
 * draws the right two objects, and is not a task anybody could perform. That
 * is the same fabrication the original rejection was aimed at, arrived at
 * compositionally instead of neurally, so the shapes are chosen by what the
 * landmark actually is.
 */
function shapes(payload: string, target: string, targetId: string): string[] {
  const container = CONTAINERS.has(targetId);
  const inOn = container ? "into" : "on";

  const common = [
    `Put the ${payload} ${inOn} the ${target}`,
    `Place the ${payload} ${inOn} the ${target}`,
    `Move the ${payload} ${inOn} the ${target}`,
    // "to", never "on": you transfer something *to* a place.
    `Transfer the ${payload} to the ${target}`,
    `Pick up the ${payload} and put it ${inOn} the ${target}`,
    `Reach the ${target} and place the ${payload}`,
    // Spatial relations, which read sensibly against anything on a bench.
    `Put the ${payload} to the left of the ${target}`,
  ];

  return container
    ? [...common, `Insert the ${payload} into the ${target}`]
    : [
        ...common,
        `Set the ${payload} down on the ${target}`,
        // Stacking is only meaningful against something you could stack
        // against, which a container is not.
        `Stack the ${payload} behind the ${target}`,
      ];
}

/**
 * Suggestions for one pair of props, in the scenario they belong to.
 *
 * Only phrasings that survive the round trip are returned, so this can be
 * empty — which is the correct answer for a pair the parser cannot read back,
 * and better than offering a sentence that would mis-render the scene.
 */
export function suggestInstructions(
  payloadId: string,
  targetId: string,
  scenario: string,
  extra: Prop[] = [],
): Suggestion[] {
  const find = (id: string) => propById(id) ?? extra.find((e) => e.id === id);
  const p = find(payloadId);
  const t = find(targetId);
  if (!p || !t) return [];

  const out: Suggestion[] = [];
  const seen = new Set<string>();

  for (const text of shapes(p.label.toLowerCase(), t.label.toLowerCase(), targetId)) {
    if (seen.has(text)) continue;
    seen.add(text);

    // The round trip. `sceneForTask` is what the station calls to decide what
    // to draw, so agreeing with it is the whole of what makes a suggestion
    // safe to offer.
    const scene = sceneForTask(text, scenario);
    const resolvedPayload = scene.payloads[0]?.id;
    if (scene.varies) continue;
    if (resolvedPayload !== payloadId || scene.target.id !== targetId) continue;

    out.push({ text, skill: skillForTask(text) });
  }

  // Distinct manipulations first, so the list reads as a set of choices rather
  // than ten ways of saying the same thing.
  const bySkill = new Map<string, Suggestion>();
  const rest: Suggestion[] = [];
  for (const s of out) {
    if (bySkill.has(s.skill)) rest.push(s);
    else bySkill.set(s.skill, s);
  }
  return [...bySkill.values(), ...rest].slice(0, 6);
}
