/**
 * Render the hero's cut-out subject from the arm the product actually is.
 *
 * The design this page is built to calls for a photoreal studio shot keyed off
 * a chroma-green backdrop. That machinery — normalise greenness by brightness,
 * despill, keep the largest blob, trim to the alpha box — exists to recover an
 * alpha channel a generative image model cannot give you directly. We do not
 * need any of it: THENAR-6 is real geometry, exported by cad/arm.py to a GLB,
 * and a renderer hands back a true alpha channel for free. No key threshold, no
 * ragged matte where a shadowed backdrop lands mid-grey, no despill flattening
 * the specular, and no risk of the subject being a plausible robot arm rather
 * than THIS one. The page claims the arm is generated from a parametric kernel;
 * the picture of it should be too.
 *
 * The one rule kept verbatim is the trim: the alpha bounding box is cropped in
 * the browser before export, because a PNG padded with transparent margin makes
 * CSS position the empty frame instead of the object, and the type and subject
 * then silently never overlap — which is the whole signature of the hero.
 *
 *   node scripts/hero-subject.mjs
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { extname, join } from "node:path";

const TMP = "/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-monad-blitz/c4afa5c0-ea5d-456c-bee5-d383c3d34809/scratchpad/subj";
const OUT = "public/hero-arm.png";

rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
cpSync("node_modules/three/build", join(TMP, "build"), { recursive: true });
cpSync("node_modules/three/examples/jsm", join(TMP, "jsm"), { recursive: true });
cpSync("public/models/thenar-6.glb", join(TMP, "arm.glb"));

writeFileSync(join(TMP, "index.html"), `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#000}canvas{display:block}</style>
<script type="importmap">{"imports":{"three":"./build/three.module.js","three/addons/":"./jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const W = 2400, H = 1500;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearAlpha(0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = null;

// A room environment gives the shell its smooth tonal gradient and the crisp
// specular along the longest edge. Described as a result, not as equipment.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
// The room is bright enough to dominate the albedo: darkening the base colour
// alone moved the shell barely at all, because most of what reaches the camera
// is reflected environment rather than diffuse. Turned down, it goes back to
// supplying the specular and the gradient while the material decides the tone.
scene.environmentIntensity = 0.38;

// Soft directional light from the upper left.
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(-5, 6, 3.5);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(4, 2, 4);
scene.add(fill);
scene.add(new THREE.AmbientLight(0xffffff, 0.22));

const DEG = Math.PI / 180;
// Extended low and wide: the arm reaches out so its lower body runs across the
// frame instead of standing tall in the middle of it.
// Axes are the kernel's own, read off lib/arm-spec.json rather than guessed:
// yaw and roll turn about Z, every pitch about Y. Guessing them put the shoulder
// and elbow on axes the arm does not have and produced a limb that sagged
// sideways instead of reaching.
const AXIS = { J1_yaw: "z", J2_pitch: "y", J3_pitch: "y", J4_roll: "z", J5_pitch: "y", J6_roll: "z" };
const POSE = {
  // Reaching, not standing. The arm is 694 mm tall and reaches 512 mm, so at
  // rest it is taller than it is wide and cannot cross the word it is supposed
  // to pass through. Pitched over at the shoulder with the elbow nearly
  // straight, the same geometry lies down along its own reach.
  J1_yaw:   -30 * DEG,
  J2_pitch:  86 * DEG,
  J3_pitch:  -6 * DEG,
  J4_roll:    0 * DEG,
  J5_pitch:  14 * DEG,
  J6_roll:    0 * DEG,
};

new GLTFLoader().load("./arm.glb", (gltf) => {
  const root = gltf.scene;

  root.traverse((o) => {
    if (POSE[o.name] !== undefined) {
      // Every joint in this kernel turns about its own local axis; the export
      // keeps them as named nodes, so the pose is applied where the real one is.
      o.rotation[AXIS[o.name]] += POSE[o.name];
    }
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        // The design commits to two colours plus one accent, and the accent may
        // never be a fill. A brass collar would put a fourth colour across the
        // largest object on the page, so every material is taken to its own
        // luminance: the tonal separation between shell, joint and collar
        // survives, the hue does not.
        if (m.color) {
          const l = 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
          // Luminance alone leaves the shell at about 0.87, and the ground it
          // sits on is #E4E4E2 — a nine per cent separation, which is a white
          // object on a white field with a shadow doing all the work. Remapped
          // into the lower half of the range it reads as a graphite instrument
          // against a pale ground, keeps its tonal gradient, and still takes the
          // specular along its longest edge.
          const t = 0.05 + l * 0.34;
          m.color.setRGB(t, t, t);
        }
        if (m.emissive) m.emissive.setRGB(0, 0, 0);
      }
    }
  });

  // The kernel builds in Z-up — the plinth sits at -PLINTH_H in Z. Framed as if
  // it were Y-up, the camera looks straight down the base axis and the granite
  // pad fills the frame as a huge disc with the arm hanging off it sideways.
  root.rotation.x = -Math.PI / 2;

  scene.add(root);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());

  const camera = new THREE.PerspectiveCamera(26, W / H, 0.01, 100);
  const radius = Math.max(size.x, size.y, size.z);
  camera.position.set(centre.x + radius * 0.62, centre.y + radius * 0.34, centre.z + radius * 2.30);
  camera.lookAt(centre.x, centre.y - radius * 0.06, centre.z);
  renderer.render(scene, camera);

  // Trim to the alpha bounding box here, before anything downstream can
  // position a transparent margin instead of the object.
  const src = renderer.domElement;
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.canvas.width = W; ctx.canvas.height = H;
  ctx.drawImage(src, 0, 0);
  const { data } = ctx.getImageData(0, 0, W, H);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = document.createElement("canvas");
  out.width = cw; out.height = ch;
  out.getContext("2d").drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);

  window.__result = { png: out.toDataURL("image/png"), w: cw, h: ch };
}, undefined, (e) => { window.__result = { error: String(e) }; });
</script>`);

const types = { ".html": "text/html", ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = createServer((req, res) => {
  const p = join(TMP, decodeURIComponent(req.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]));
  // Read before writing the header, or a miss tries to send a 404 after the
  // 200 has already gone out and the server throws instead of answering.
  let body;
  try { body = readFileSync(p); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" });
  res.end(body);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on("pageerror", (e) => console.error("  page error:", String(e)));
page.on("console", (m) => { if (m.type() === "error") console.error("  console:", m.text()); });
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__result, null, { timeout: 90_000 });
const result = await page.evaluate(() => window.__result);
await browser.close();
server.close();

if (result.error) { console.error(result.error); process.exit(1); }
writeFileSync(OUT, Buffer.from(result.png.split(",")[1], "base64"));
console.log(`  ${OUT}  ${result.w}x${result.h}  ${(Buffer.from(result.png.split(",")[1], "base64").length / 1024).toFixed(0)} KB`);
console.log(`  aspect ${(result.w / result.h).toFixed(3)} — wider than tall: ${result.w > result.h}`);
