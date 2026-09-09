/**
 * Which manipulation a task is asking for.
 *
 * PRODUCT.md fixes the vocabulary — pick, place, stack, rotate, transfer,
 * arrange, insert, separate, reach — and says it has to survive into the
 * interface. The contract has no field for it, so rather than invent an
 * off-chain table it is read out of the instruction the contract does store,
 * the same way the payload and the landmark are. That keeps it derivable from
 * chain state by anyone.
 *
 * Specific cues beat generic ones. Almost every instruction starts with "put",
 * so matching on position alone made every task a `place` and the vocabulary
 * carried no information: "put the shrimp to the left of the honey jar" is an
 * arrange and "put the apricot into the air fryer" is an insert. Only when a
 * sentence names no manipulation more specific than putting something down does
 * it fall through to `place`.
 */

export const SKILLS = [
  "pick", "place", "stack", "rotate", "transfer",
  "arrange", "insert", "separate", "reach",
] as const;

export type Skill = (typeof SKILLS)[number];

/** Cues that name a manipulation. Earliest in the sentence wins among these. */
const SPECIFIC: [string, Skill][] = [
  ["rotate", "rotate"], ["turn ", "rotate"], ["spin ", "rotate"], ["show ", "rotate"],
  ["stack", "stack"], ["on top of", "stack"],
  ["insert", "insert"], ["into", "insert"], ["inside", "insert"],
  ["transfer", "transfer"], ["carry", "transfer"],
  ["to the left of", "arrange"], ["to the right of", "arrange"],
  ["behind", "arrange"], ["in front of", "arrange"], ["beside", "arrange"],
  ["next to", "arrange"], ["arrange", "arrange"], ["align", "arrange"],
  ["separate", "separate"], ["apart", "separate"], ["away from", "separate"],
  ["reach", "reach"],
  ["pick up", "pick"], ["lift", "pick"], ["grasp", "pick"],
];

/** How the skill reads as a label. */
export const SKILL_LABEL: Record<Skill, string> = {
  pick: "Pick", place: "Place", stack: "Stack", rotate: "Rotate",
  transfer: "Transfer", arrange: "Arrange", insert: "Insert",
  separate: "Separate", reach: "Reach",
};

/**
 * The skill a task asks for. Falls back to `place`, which is what a task that
 * names no manipulation at all is in practice — never to a blank.
 */
export function skillForTask(instruction: string): Skill {
  const text = ` ${instruction.toLowerCase()} `;
  let best: { at: number; skill: Skill } | null = null;

  for (const [cue, skill] of SPECIFIC) {
    const at = text.indexOf(cue);
    if (at < 0) continue;
    if (!best || at < best.at) best = { at, skill };
  }

  return best?.skill ?? "place";
}

/**
 * Whether a task wants two arms.
 *
 * Read from the instruction, like the scene and the skill are, so it stays a
 * pure function of chain state and cannot drift into a side table nobody
 * updates. Only where the sentence actually says so: "with both arms",
 * "two-handed", "hold it while". A task that merely names two objects is not
 * bimanual — one arm can place two things in sequence, and that is the
 * ordinary case #25 already covers.
 */
export function armsForTask(instruction: string): 1 | 2 {
  return /\b(both arms|two arms|two-handed|bimanual|hold(ing)? it while|while holding)\b/i.test(instruction)
    ? 2
    : 1;
}
