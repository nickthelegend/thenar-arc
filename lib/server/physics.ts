import "server-only";
import type { Sample } from "@/lib/types";

/**
 * What rigid-body physics says about a run the kinematic sim measured.
 *
 * The station is a kinematic simulator and the product has always said so: the
 * payload follows the tool exactly, falls at a fixed rate, and cannot topple,
 * roll or be nudged by the thing it lands on. That is a defensible choice for
 * a control surface driven at 60 fps — but it leaves a question a buyer of
 * this corpus is entitled to ask, which is how far those recordings are from
 * what the objects would actually have done.
 *
 * This answers it with a number rather than a claim. The release state of a
 * real recorded run — where the payload was and how fast it was moving on the
 * frame the jaws opened — is handed to MuJoCo, the same engine the robotics
 * field uses, and integrated to rest. The distance between where physics puts
 * it and where the recording says it stopped is the divergence.
 *
 * Nothing here scores anything. The payouts are derived from the recording,
 * and this does not touch them; it measures the recording against physics and
 * says what it finds.
 */

export type Settled = {
  /** Where the recording says the payload came to rest, metres. */
  recorded: [number, number, number];
  /** Where rigid-body dynamics puts it from the same release state. */
  physical: [number, number, number];
  /** Distance between the two in the table plane, millimetres. */
  divergenceMm: number;
  /** Height it settled at, which for an upright cylinder is half its own. */
  restHeightMm: number;
  /** Release state the integration started from. */
  release: { at: number; pos: [number, number, number]; vel: [number, number, number] };
  /** Simulated seconds to come to rest. */
  secondsToRest: number;
};

/** Jaw opening below which the jaws are holding something, in mm. Kept beside
 *  the scorer's own constant rather than imported, so a change there is a
 *  deliberate change here too. */
const GRIP_CLOSED_MM = 14;

/** The payload's own size, from the station's constants. */
const PAYLOAD_R = 0.028;
const PAYLOAD_H = 0.075;

/**
 * The moment the jaws opened for the last time, and the payload's state then.
 *
 * Velocity is differenced from the samples either side rather than taken from
 * anywhere — the recording stores position, not velocity, and the release
 * speed is what decides where the object ends up.
 */
export function releaseState(samples: Sample[]): Settled["release"] | null {
  let idx = -1;
  for (let i = 1; i < samples.length; i += 1) {
    const wasHeld = samples[i - 1].grip <= GRIP_CLOSED_MM;
    const isHeld = samples[i].grip <= GRIP_CLOSED_MM;
    if (wasHeld && !isHeld) idx = i;
  }
  // A run whose jaws never opened has no release to integrate from.
  if (idx < 1) return null;

  const a = samples[Math.max(0, idx - 2)];
  const b = samples[idx];
  const dt = Math.max(1e-3, b.t - a.t);
  return {
    at: b.t,
    pos: [b.object[0], b.object[1], b.object[2]],
    vel: [
      (b.object[0] - a.object[0]) / dt,
      (b.object[1] - a.object[1]) / dt,
      (b.object[2] - a.object[2]) / dt,
    ],
  };
}

/**
 * The scene, as MJCF.
 *
 * Deliberately the station's own numbers: the bench is the plane the payload
 * rests on at z = 0, and the payload is the cylinder the viewport draws, at
 * the radius and height the station scales every prop to. A physics comparison
 * against a differently-sized object would measure the difference in the
 * models rather than the difference in the dynamics.
 */
function scene(): string {
  return `<mujoco>
  <option timestep="0.002" gravity="0 0 -9.81" integrator="implicitfast"/>
  <worldbody>
    <geom name="bench" type="plane" size="2 2 0.1" pos="0 0 0" friction="0.9 0.02 0.001"/>
    <body name="payload" pos="0 0 1">
      <freejoint/>
      <geom name="payload" type="cylinder" size="${PAYLOAD_R} ${PAYLOAD_H / 2}"
            density="600" friction="0.9 0.02 0.001"/>
    </body>
  </worldbody>
</mujoco>`;
}

let engine: Awaited<ReturnType<typeof loadEngine>> | null = null;
async function loadEngine() {
  const factory = (await import("mujoco")).default;
  return factory();
}

/**
 * Integrate one run's release forward until it stops moving.
 *
 * Capped rather than run to a fixed horizon: an object that has come to rest
 * stays at rest, and continuing to integrate it would only spend time. The cap
 * exists for the object that has not — one still rolling when the clock runs
 * out is reported as such rather than silently treated as settled.
 */
export async function settleFrom(samples: Sample[]): Promise<Settled | null> {
  const release = releaseState(samples);
  if (!release) return null;

  engine ??= await loadEngine();
  const mj = engine;

  const path = `/scene-${PAYLOAD_R}-${PAYLOAD_H}.xml`;
  try { mj.FS.writeFile(path, scene()); } catch { /* already written */ }
  const model = mj.MjModel.mj_loadXML(path);
  const data = new mj.MjData(model);

  // qpos for a free joint is [x y z, quaternion]; qvel is [vx vy vz, wx wy wz].
  // The payload is placed at its own centre, which sits half its height above
  // the point the recording tracks.
  data.qpos[0] = release.pos[0];
  data.qpos[1] = release.pos[1];
  data.qpos[2] = release.pos[2] + PAYLOAD_H / 2;
  data.qpos[3] = 1; data.qpos[4] = 0; data.qpos[5] = 0; data.qpos[6] = 0;
  data.qvel[0] = release.vel[0];
  data.qvel[1] = release.vel[1];
  data.qvel[2] = release.vel[2];

  const dt = 0.002;
  const MAX_STEPS = 6000; // twelve seconds
  let steps = 0;
  let still = 0;
  for (; steps < MAX_STEPS; steps += 1) {
    mj.mj_step(model, data);
    const speed = Math.hypot(data.qvel[0], data.qvel[1], data.qvel[2]);
    // A millimetre a second, held for a quarter second, is at rest.
    still = speed < 0.001 ? still + 1 : 0;
    if (still > 125) break;
  }

  const physical: [number, number, number] = [
    data.qpos[0], data.qpos[1], data.qpos[2] - PAYLOAD_H / 2,
  ];
  const last = samples[samples.length - 1].object;
  const recorded: [number, number, number] = [last[0], last[1], last[2]];

  return {
    recorded,
    physical,
    divergenceMm: Math.hypot(physical[0] - recorded[0], physical[1] - recorded[1]) * 1000,
    restHeightMm: data.qpos[2] * 1000,
    release,
    secondsToRest: steps * dt,
  };
}
