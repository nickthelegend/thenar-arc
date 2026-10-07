export type Scenario = "kitchen" | "office" | "bathroom" | "workshop" | "home" | "play";

export type Skill =
  | "pick" | "place" | "stack" | "rotate"
  | "transfer" | "arrange" | "insert" | "separate" | "reach";

export type Stage = "pre" | "training" | "post";

export type Task = {
  id: string;
  name: string;
  object: string;
  scenario: Scenario;
  skills: Skill[];
  /** 1..5 */
  difficulty: number;
  stage: Stage;
  slotsFilled: number;
  slotsTotal: number;
  /** Native token paid per accepted trajectory, at full score */
  rewardPerTrajectory: number;
  /** Share of submitted runs that passed evaluation, 0..1 */
  passRate: number;
  /** Median completion, seconds */
  medianSeconds: number;
  steps: string[];
};

export type Sample = {
  /** Seconds since the run started */
  t: number;
  /** Six joint angles, radians */
  q: [number, number, number, number, number, number];
  /** Jaw opening, mm */
  grip: number;
  /** Payload pose, metres */
  object: [number, number, number];
  /** The second payload's pose, on the scenes that have one. Absent — not
   *  zeroed — on a single-object run, because a zero is a position and the
   *  hash would then claim an object was sitting at the origin. */
  object2?: [number, number, number];
  /** The second arm's joint angles, on the scenes that have two arms. Absent
   *  for the same reason: a column of zeroes is a pose, and it would claim the
   *  arm was folded flat rather than absent. */
  q2?: [number, number, number, number, number, number];
  /** The second arm's jaw opening, mm. */
  grip2?: number;
};

export type Trajectory = {
  taskId: string;
  samples: Sample[];
  durationSeconds: number;
  success: boolean;
  /** Distance from the goal datum at rest, millimetres */
  deviationMm: number;
};

export type Verdict = {
  /** 0..10000, the on-chain score */
  score: number;
  success: boolean;
  deviationMm: number;
  /** Component scores, each 0..1 */
  parts: { placement: number; efficiency: number; smoothness: number };
  /** The raw measurements the components were derived from. */
  raw: {
    meanJerk: number; seconds: number; parSeconds: number;
    /** Times the payload was taken. One is a clean run. */
    grasps: number;
    /** Fraction deducted for re-grasping and for placing a two-payload scene
     *  out of order, combined. */
    penalty: number;
    /** The payloads were placed in the wrong order. Always false on a scene
     *  with one payload, which is every task recorded so far. */
    outOfOrder: boolean;
    /** The deviation the submitter reported, against which `deviationMm` is
     *  the one measured from the samples. Kept so the two can be compared;
     *  only the measured one is scored or signed. */
    claimedDeviationMm: number;
    /** The duration the submitter reported. `seconds` is the one measured from
     *  the samples' own timestamps, and is the one scored. */
    claimedSeconds: number;
  };
  payoutMon: number;
};

export type Run = {
  id: string;
  taskId: string;
  taskName: string;
  score: number;
  seconds: number;
  deviationMm: number;
  signed: boolean;
  txHash?: string;
  payoutMon: number;
  at: string;
};
