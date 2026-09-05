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
  /** MON paid per accepted trajectory, at full score */
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
  raw: { meanJerk: number; seconds: number; parSeconds: number };
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
