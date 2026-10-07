/**
 * The SO-101, as built with MG996R servos (thenar-arms follower R3).
 *
 * The second embodiment a task can ask for. Its kinematics are the CAD's own
 * node tree, not a hand-written model: lib/so101-spec.ts is the chain exported
 * from thenar-arms' assembly manifest, the same one the GLB in
 * public/models/so101-mg996r.glb was built from, so the arm drawn, the arm
 * solved and the arm the firmware drives share every datum.
 *
 * Every joint turns about its node's local Z, in degrees, clamped to the
 * manifest's limits. Five joints reach; the sixth is the moving jaw.
 *
 * The arm frame is the station's: metres, Z up, base at the origin, +X the
 * direction the arm reaches. The chain is in millimetres, so the boundary
 * converts.
 */
import * as THREE from "three";
import { SO101_SPEC } from "./so101-spec";

export const SO101 = SO101_SPEC as unknown as {
  embodiment: string;
  jointNames: string[];
  homeDeg: number[];
  limitsDeg: [number, number][];
  joints: string[];
  tcp: string;
  chain: { id: string; parent: string | null; position: number[]; rotation: number[]; joint: number | null }[];
};

/** Jaw opening per degree of the moving jaw, nominal for the R3 geometry. */
export const JAW_MM_PER_DEG = 0.9;
/** Furthest the SO-101's gripping point reaches from its base axis, metres. */
export const SO101_REACH = 0.4;

const D2R = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The bare kinematic chain (no meshes), so solving never touches the scene graph. */
export class So101Chain {
  root = new THREE.Object3D();
  nodes: Record<string, THREE.Object3D> = {};
  joints: THREE.Object3D[];
  tcp: THREE.Object3D;
  q: number[] = [...SO101.homeDeg];

  constructor() {
    for (const n of SO101.chain) {
      const o = new THREE.Object3D();
      o.name = n.id;
      o.position.fromArray(n.position);
      o.rotation.set(n.rotation[0] * D2R, n.rotation[1] * D2R, n.rotation[2] * D2R);
      this.nodes[n.id] = o;
      (n.parent ? this.nodes[n.parent] : this.root).add(o);
    }
    this.joints = SO101.joints.map((id) => this.nodes[id]);
    this.tcp = this.nodes[SO101.tcp];
    this.set(SO101.homeDeg);
  }

  /** Set the joints, degrees, clamped to the limits. Returns what was set. */
  set(qDeg: number[]): number[] {
    for (let i = 0; i < this.joints.length; i++) {
      this.q[i] = clamp(qDeg[i] ?? 0, ...SO101.limitsDeg[i]);
      this.joints[i].rotation.z = this.q[i] * D2R;
    }
    return this.q;
  }

  /** The gripping point's pose in the arm frame, millimetres. */
  tcpPose(out = new THREE.Matrix4()): THREE.Matrix4 {
    this.root.updateMatrixWorld(true);
    return out.copy(this.tcp.matrixWorld);
  }
}

/** Where the gripping point is for these joints (radians, as samples record them), in metres. */
export function so101Tool(qRad: readonly number[], chain = new So101Chain()): [number, number, number] {
  chain.set([...qRad.slice(0, 5).map((v) => v / D2R), SO101.homeDeg[5]]);
  const p = new THREE.Vector3().setFromMatrixPosition(chain.tcpPose());
  return [p.x / 1000, p.y / 1000, p.z / 1000];
}

// ---- inverse kinematics: damped least squares over the five reaching joints ----------

const _cur = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _tp = new THREE.Vector3(), _tq = new THREE.Quaternion(), _dq = new THREE.Quaternion();

/** Pose error: position (mm), then orientation as a rotation vector scaled to mm. */
function poseError(target: THREE.Matrix4, current: THREE.Matrix4, orientWeight: number, out: Float64Array) {
  target.decompose(_tp, _tq, _s);
  current.decompose(_p, _q, _s);
  out[0] = _tp.x - _p.x;
  out[1] = _tp.y - _p.y;
  out[2] = _tp.z - _p.z;
  _dq.copy(_tq).multiply(_q.invert());
  if (_dq.w < 0) _dq.set(-_dq.x, -_dq.y, -_dq.z, -_dq.w);
  const s = Math.sqrt(1 - Math.min(1, _dq.w * _dq.w));
  const k = s < 1e-6 ? 2 : (2 * Math.acos(Math.min(1, _dq.w))) / s;
  out[3] = _dq.x * k * orientWeight;
  out[4] = _dq.y * k * orientWeight;
  out[5] = _dq.z * k * orientWeight;
  return out;
}

function solveLinear(A: Float64Array, b: Float64Array, n: number) {
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (p !== c) {
      for (let k = 0; k < n; k++) [A[c * n + k], A[p * n + k]] = [A[p * n + k], A[c * n + k]];
      [b[c], b[p]] = [b[p], b[c]];
    }
    const d = A[c * n + c];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / d;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * b[k];
    const d = A[r * n + r];
    b[r] = Math.abs(d) < 1e-12 ? 0 : s / d;
  }
}

function descend(chain: So101Chain, target: THREE.Matrix4, iterations: number, orientWeight: number): number {
  const n = 5, lambda = 1.5, h = 0.25, maxStep = 6;
  const e = new Float64Array(6), e2 = new Float64Array(6), J = new Float64Array(6 * n), A = new Float64Array(36), y = new Float64Array(6);
  for (let it = 0; it < iterations; it++) {
    poseError(target, chain.tcpPose(_cur), orientWeight, e);
    if (Math.hypot(e[0], e[1], e[2]) < 0.5 && Math.hypot(e[3], e[4], e[5]) < 0.5) break;
    const q0 = chain.q.slice();
    for (let j = 0; j < n; j++) {
      const q = q0.slice();
      q[j] += h;
      chain.set(q);
      poseError(target, chain.tcpPose(_cur), orientWeight, e2);
      for (let r = 0; r < 6; r++) J[r * n + j] = (e[r] - e2[r]) / h;
    }
    chain.set(q0);
    // A joint pinned at a limit that the step would push further is left out
    // and the step solved again without it, so the others do the work.
    const dq = new Float64Array(n), locked = new Array(n).fill(false);
    for (let pass = 0; pass < 3; pass++) {
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++) {
          let s = r === c ? lambda * lambda : 0;
          for (let k = 0; k < n; k++) if (!locked[k]) s += J[r * n + k] * J[c * n + k];
          A[r * 6 + c] = s;
        }
      y.set(e);
      solveLinear(A, y, 6);
      let changed = false;
      for (let j = 0; j < n; j++) {
        dq[j] = 0;
        if (locked[j]) continue;
        for (let r = 0; r < 6; r++) dq[j] += J[r * n + j] * y[r];
        const [lo, hi] = SO101.limitsDeg[j];
        if ((q0[j] <= lo + 1e-6 && dq[j] < 0) || (q0[j] >= hi - 1e-6 && dq[j] > 0)) {
          locked[j] = true;
          changed = true;
        }
      }
      if (!changed) break;
    }
    const big = Math.max(...Array.from(dq, Math.abs));
    const scale = big > maxStep ? maxStep / big : 1;
    chain.set(q0.map((v, j) => (j < n ? v + dq[j] * scale : v)));
  }
  poseError(target, chain.tcpPose(_cur), orientWeight, e);
  return Math.hypot(e[0], e[1], e[2]);
}

/** The gripper pointing straight down, turned to face along the reach to (x, y). */
function downAt(xMm: number, yMm: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
    .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(yMm, xMm)));
}

/**
 * Put the gripping point at `target` (metres, arm frame), gripper down, from
 * wherever the chain is. When that stalls against a joint limit — the arm
 * reached over itself — try again from home and keep the closer answer.
 * Returns the position error in millimetres.
 */
export function solveSo101(chain: So101Chain, target: readonly [number, number, number]): number {
  const t = [target[0] * 1000, target[1] * 1000, target[2] * 1000] as const;
  const goal = new THREE.Matrix4().compose(new THREE.Vector3(...t), downAt(t[0], t[1]), new THREE.Vector3(1, 1, 1));
  const err = descend(chain, goal, 16, 25);
  if (err <= 8) return err;
  const here = chain.q.slice();
  chain.set([...SO101.homeDeg.slice(0, 5), here[5]]);
  let alt = Infinity;
  for (let i = 0; i < 4 && alt > 8; i++) alt = descend(chain, goal, 16, 25);
  if (alt < err / 2) return alt;
  chain.set(here);
  return err;
}
