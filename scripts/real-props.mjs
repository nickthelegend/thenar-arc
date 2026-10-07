/**
 * A Poly Haven photoscan (CC0) → a Thenar prop, in the convention cad/props.py
 * writes: metres, Z up, standing on z = 0, centred on its footprint. The scan
 * is simplified and its textures cut to 512 px JPEG so a prop stays a few
 * hundred kilobytes. JPEG, not WebP: drei's GLTFLoader races its
 * EXT_texture_webp support check and, when it loses, fails the whole model.
 *
 *   node scripts/real-props.mjs <src.gltf> <out.glb> [maxTriangles] [flat]
 *
 * Source: the 1k glTF from https://api.polyhaven.com/files/<asset>. Prints the
 * footprint width in millimetres, which is the prop's widthMm in
 * public/props/index.json; the entry's `source` names the asset, and marks it
 * as one cad/props.py must leave alone.
 *
 * Needs @gltf-transform/core, /functions, /extensions, meshoptimizer and sharp
 * (not app dependencies: install them next to wherever this runs).
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, getBounds, join, prune, simplify, textureCompress, weld, quantize } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const [src, out, maxTriArg, pose] = process.argv.slice(2);
const maxTri = Number(maxTriArg ?? 12000);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const scene = doc.getRoot().listScenes()[0];

// One root that turns glTF's Y-up into the station's Z-up.
// "flat" leaves a scan that stands on end lying along the table instead.
const root = doc.createNode("root").setRotation(pose === "flat" ? [0, 0, 0, 1] : [Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
for (const n of scene.listChildren()) { scene.removeChild(n); root.addChild(n); }
scene.addChild(root);

await doc.transform(flatten(), dedup(), weld({ tolerance: 0.0001 }));
const tris = () => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);
const before = tris();
if (before > maxTri) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: maxTri / before, error: 0.002 }));

// Stand it on the table and centre its footprint. The rotation lives on root,
// so the bounds below are already in the Z-up frame.
let b = getBounds(scene);
const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, z0 = b.min[2];
// flatten() baked root's rotation into the meshes and lifted them to the top
// of the scene, so every top-level node is wrapped, not root alone.
const wrap = doc.createNode("thenar").setTranslation([-cx, -cy, -z0]);
for (const n of scene.listChildren()) { scene.removeChild(n); wrap.addChild(n); }
scene.addChild(wrap);
b = getBounds(scene);

await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [512, 512], quality: 84 }),
  prune(), dedup(), quantize(),
);
await io.write(out, doc);
const w = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) * 1000;
console.log(JSON.stringify({ out: out.split("/").pop(), tris: [Math.round(before), Math.round(tris())], widthMm: Math.round(w), heightMm: Math.round((b.max[2] - b.min[2]) * 1000), x: Math.round((b.max[0]-b.min[0])*1000), y: Math.round((b.max[1]-b.min[1])*1000) }));
