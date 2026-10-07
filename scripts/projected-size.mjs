/**
 * Is the scene actually visible?
 *
 * Everything inside a WebGL canvas is drawn on an animation frame, and a browser
 * that has backgrounded the tab stops handing those out — so no automated
 * screenshot of this scene can be taken, and for a long time nothing here was
 * checked against pixels at all. Two props were being drawn at 0.1 x 0.1 px and
 * the room at 1 x 1 px, and every test still passed: the assets loaded, the
 * console was clean, the scene graph was correct.
 *
 * "Can you see it" reduces to arithmetic. This projects each model's real vertex
 * bounds through the station's own camera and reports the pixel footprint, with
 * no browser and no GL context in the loop.
 *
 *     node scripts/projected-size.mjs
 */
// own camera and report its pixel footprint. No browser, no GL context — pure
// maths, which is exactly what "is it visible" reduces to.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

const W = 960, H = 560;
const cam = new THREE.PerspectiveCamera(34, W / H, 0.02, 12);
cam.position.set(0.92, 0.74, 0.9);
cam.lookAt(0.06, 0.12, 0.02);
cam.updateMatrixWorld(true);
cam.updateProjectionMatrix();

function glbSize(p) {
  const b = readFileSync(p);
  const jlen = b.readUInt32LE(12);
  const j = JSON.parse(b.slice(20, 20 + jlen).toString());
  let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9];
  for (const m of j.meshes || []) for (const pr of m.primitives) {
    const a = j.accessors[pr.attributes.POSITION];
    if (a.min && a.max) for (let i=0;i<3;i++){ mn[i]=Math.min(mn[i],a.min[i]); mx[i]=Math.max(mx[i],a.max[i]); }
  }
  return { min: mn, max: mx };
}

/** Pixel footprint of an axis-aligned box placed at `at`, scaled by k, with the
 *  CAD frame's -90° X rotation applied, as the scene does. */
function footprint(file, k, at) {
  const { min, max } = glbSize(file);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2, 0, 0));
  let xmin=1e9,xmax=-1e9,ymin=1e9,ymax=-1e9, anyInFront=false;
  for (const cx of [min[0],max[0]]) for (const cy of [min[1],max[1]]) for (const cz of [min[2],max[2]]) {
    const v = new THREE.Vector3(cx*k, cy*k, cz*k).applyQuaternion(q).add(new THREE.Vector3(...at));
    const p = v.clone().project(cam);
    if (p.z < 1) anyInFront = true;
    const sx = (p.x*0.5+0.5)*W, sy = (-p.y*0.5+0.5)*H;
    xmin=Math.min(xmin,sx); xmax=Math.max(xmax,sx); ymin=Math.min(ymin,sy); ymax=Math.max(ymax,sy);
  }
  return { wpx: +(xmax-xmin).toFixed(1), hpx: +(ymax-ymin).toFixed(1), onScreen: anyInFront && xmax>0 && xmin<W && ymax>0 && ymin<H };
}

const GOAL_R = 0.075, PAYLOAD_R = 0.028;
const goal = [0.16, -0.18];

const cases = [
  ['payload dice',   'public/props/dice.glb',   42,  PAYLOAD_R*2, [0.22, 0.028, -0.14]],
  ['target crate',   'public/props/crate.glb',  150, GOAL_R*1.7,  [goal[0], 0, -goal[1]]],
  ['payload toothpaste','public/props/toothpaste.glb',34, PAYLOAD_R*2,[0.18,0.028,-0.15]],
  ['target drawer',  'public/props/drawer.glb', 190, GOAL_R*1.7,  [goal[0], 0, -goal[1]]],
];

console.log(`  camera fov 34, ${W}x${H}, pos(0.92,0.74,0.90) -> (0.06,0.12,0.02)\n`);
console.log('  object                 BEFORE (k=t/mm)      AFTER (k=t/(mm/1000))   verdict');
for (const [name, file, mm, t, at] of cases) {
  const before = footprint(file, t/mm, at);
  const after  = footprint(file, t/(mm/1000), at);
  const ok = after.wpx > 8 && after.onScreen;
  console.log(`  ${name.padEnd(22)} ${(before.wpx+'x'+before.hpx+' px').padEnd(20)} ${(after.wpx+'x'+after.hpx+' px').padEnd(23)} ${ok?'VISIBLE':'still invisible'}`);
}

// The room, which was scaled by 0.001
const roomBefore = footprint('public/environments/play.glb', 0.001, [0,-0.0025,0]);
const roomAfter  = footprint('public/environments/play.glb', 1,     [0,-0.0025,0]);
console.log(`  ${'room play table'.padEnd(22)} ${(roomBefore.wpx+'x'+roomBefore.hpx+' px').padEnd(20)} ${(roomAfter.wpx+'x'+roomAfter.hpx+' px').padEnd(23)} ${roomAfter.wpx>200?'VISIBLE':'still invisible'}`);
