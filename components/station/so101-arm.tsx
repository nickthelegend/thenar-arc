"use client";

import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { click } from "@/lib/click";
import { sceneColor } from "@/lib/theme-color";
import { JAW_MM_PER_DEG, SO101, So101Chain, solveSo101 } from "@/lib/so101";
import { mirrorJoints } from "@/components/station/arm-link";
import { leaderJoints } from "@/components/station/leader";

export const SO101_URL = "/models/so101-mg996r.glb";
useGLTF.preload(SO101_URL);

const D2R = Math.PI / 180;

/** What the rig needs back from an SO-101 each frame, in the shape it already
 *  reads from the THENAR-6 plus the two columns that differ between the arms. */
export type So101Joints = {
  j1: number;
  j2: number;
  j3: number;
  j5: number;
  clamped: boolean;
  /** All six joints, radians, as a sample records them. */
  q: [number, number, number, number, number, number];
  /** The gripping point, metres, arm frame: forward kinematics of the CAD chain. */
  tool: [number, number, number];
};

/** Degrees → the record's radians, jaw included (its opening, in degrees). */
const toQ = (deg: number[]): So101Joints["q"] => deg.map((d) => d * D2R) as So101Joints["q"];

/**
 * The SO-101, as built with MG996R servos, standing at the station's origin.
 *
 * Solved on a bare copy of the CAD's chain (lib/so101.ts) and the answer
 * written onto the GLB's own joint nodes: same names, same local-Z rotation, so
 * the drawn arm is the solved arm. The jaw opens to what the operator asked in
 * millimetres, at the R3 jaw's nominal 0.9 mm a degree.
 */
export function So101Arm({
  target,
  grip,
  held,
  onJoints,
}: {
  target: React.RefObject<[number, number, number]>;
  grip: React.RefObject<number>;
  held?: React.RefObject<boolean>;
  onJoints: (j: So101Joints) => void;
}) {
  const { scene } = useGLTF(SO101_URL);
  const model = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        // Clone the material too: the jaw lights up while holding, and a
        // shared material would light every SO-101 on the page with it.
        if (m.material) m.material = (m.material as THREE.Material).clone();
      }
    });
    return c;
  }, [scene]);

  const nodes = useRef<(THREE.Object3D | undefined)[]>([]);
  const jaw = useRef<THREE.Object3D | undefined>(undefined);
  useEffect(() => {
    nodes.current = SO101.joints.map((id) => model.getObjectByName(id) ?? undefined);
    jaw.current = nodes.current[5];
  }, [model]);

  const chain = useRef<So101Chain | null>(null);
  const last = useRef<{ at: [number, number, number]; out: So101Joints } | null>(null);
  const wasHolding = useRef(false);

  // useFrame runs once per frame, outside render, and `target` and `grip` are refs the
  // station hands in precisely to be written here: the leader moves them.
  // eslint-disable-next-line react-hooks/immutability
  useFrame(() => {
    chain.current ??= new So101Chain();
    const c = chain.current;
    const t = target.current;

    // A physical leader, when one is streaming, drives the arm joint for joint.
    // Its pose is what the operator's hand did; the tool is wherever the chain
    // puts it, and the target and the jaws follow so that letting go of the
    // leader hands the keyboard an arm that is already where it was left.
    const lead = leaderJoints();
    let out: So101Joints | undefined;
    let jawDeg: number;
    if (lead) {
      c.set(lead);
      jawDeg = Math.min(SO101.limitsDeg[5][1], Math.max(SO101.limitsDeg[5][0], lead[5]));
      // eslint-disable-next-line react-hooks/immutability -- a ref meant to be written per frame
      grip.current = jawDeg * JAW_MM_PER_DEG;
      const tcp = new THREE.Vector3().setFromMatrixPosition(c.tcpPose());
      out = {
        j1: c.q[0] * D2R, j2: c.q[1] * D2R, j3: c.q[2] * D2R, j5: c.q[3] * D2R,
        clamped: false,
        q: toQ([...c.q.slice(0, 5), jawDeg]),
        tool: [tcp.x / 1000, tcp.y / 1000, tcp.z / 1000],
      };
      // eslint-disable-next-line react-hooks/immutability -- a ref meant to be written per frame
      t[0] = out.tool[0]; t[1] = out.tool[1]; t[2] = out.tool[2];
      last.current = { at: [t[0], t[1], t[2]], out };
    } else {
      jawDeg = Math.min(SO101.limitsDeg[5][1], Math.max(SO101.limitsDeg[5][0], grip.current / JAW_MM_PER_DEG));
    }

    // The solve is a few hundred matrix updates; skip it when the target has
    // not moved, which is most frames of a run.
    out ??= last.current?.out;
    const at = last.current?.at;
    if (!lead && (!out || !at || at[0] !== t[0] || at[1] !== t[1] || at[2] !== t[2])) {
      const err = solveSo101(c, t);
      const tcp = new THREE.Vector3().setFromMatrixPosition(c.tcpPose());
      out = {
        j1: c.q[0] * D2R,
        j2: c.q[1] * D2R,
        j3: c.q[2] * D2R,
        j5: c.q[3] * D2R,
        // The tool is where the chain actually put it; "clamped" says it could
        // not get within a centimetre of where it was asked, as the THENAR-6's does.
        clamped: err > 8,
        q: toQ([...c.q.slice(0, 5), jawDeg]),
        tool: [tcp.x / 1000, tcp.y / 1000, tcp.z / 1000],
      };
      last.current = { at: [t[0], t[1], t[2]], out };
    } else if (!lead && out) {
      out.q[5] = jawDeg * D2R;
    }
    if (!out) return;

    const n = nodes.current;
    for (let i = 0; i < 5; i++) if (n[i]) n[i]!.rotation.z = c.q[i] * D2R;
    // A real SO-101 on this desk, when the operator has asked for one.
    mirrorJoints([...c.q.slice(0, 5), jawDeg]);
    if (jaw.current) jaw.current.rotation.z = jawDeg * D2R;

    const holding = held?.current === true;
    if (holding !== wasHolding.current) {
      wasHolding.current = holding;
      click(holding ? "grasp" : "release");
      jaw.current?.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!m || !("emissive" in m)) return;
        m.emissive?.set(holding ? sceneColor.signal() : "#000000");
        m.emissiveIntensity = holding ? 0.55 : 0;
      });
    }

    onJoints(out);
  });

  // Millimetres, Z up, into the scene's metres, Y up.
  return <primitive object={model} scale={0.001} rotation={[-Math.PI / 2, 0, 0]} />;
}

/**
 * An SO-101 posed from a recording (radians, as samples carry them), for the
 * replay viewer. Posed on every animation frame from the scrubbed sample, the
 * way the replay's THENAR-6 is, so a dragged scrubber tracks.
 */
export function So101Pose({ frame }: { frame: React.RefObject<{ q?: readonly number[] } | null> }) {
  const { scene } = useGLTF(SO101_URL);
  const model = useMemo(() => scene.clone(true), [scene]);
  useEffect(() => {
    const nodes = SO101.joints.map((id) => model.getObjectByName(id) ?? undefined);
    let raf = 0;
    const apply = () => {
      const v = frame.current?.q;
      if (v) {
        for (let i = 0; i < 6; i++) {
          const [lo, hi] = SO101.limitsDeg[i];
          if (nodes[i]) nodes[i]!.rotation.z = Math.min(hi, Math.max(lo, (v[i] ?? 0) / D2R)) * D2R;
        }
      }
      raf = requestAnimationFrame(apply);
    };
    raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [model, frame]);
  return <primitive object={model} scale={0.001} rotation={[-Math.PI / 2, 0, 0]} />;
}
