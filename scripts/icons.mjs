/**
 * Draw the mark at the sizes an installable app is required to have.
 *
 * The manifest listed one SVG, which no platform accepts as a launcher icon:
 * Android wants a 192 and a 512 PNG, and it wants a maskable variant or it
 * crops the mark into whatever silhouette the launcher uses. So the same
 * geometry is redrawn at each size rather than scaled from a bitmap.
 *
 * The maskable version is the same mark inside the safe zone — 80% of the
 * canvas — because a launcher may clip anything outside a circle inscribed in
 * it, and the arm's base rail runs right to the edge of the 32px original.
 *
 *   node scripts/icons.mjs
 */
import { ImageResponse } from "next/og.js";
import React from "react";
import { writeFileSync } from "node:fs";

const h = React.createElement;

/** The mark, as SVG, at a nominal 32 units — scaled by the wrapper. */
const mark = (inset) =>
  h("svg", {
    width: `${100 - inset * 2}%`, height: `${100 - inset * 2}%`,
    viewBox: "0 0 32 32", xmlns: "http://www.w3.org/2000/svg",
  }, [
    h("g", { key: "g", fill: "none", stroke: "#FF6A00", strokeLinecap: "butt", strokeLinejoin: "miter" }, [
      h("path", { key: "a", d: "M4 28.5h24", strokeWidth: 2 }),
      h("path", { key: "b", d: "M8.4 28.5 14.7 10.6M23.6 28.5 17.3 10.6", strokeWidth: 2.6 }),
      h("path", { key: "c", d: "M11.3 21.2h9.4", strokeWidth: 2 }),
      h("circle", { key: "d", cx: 16, cy: 7.8, r: 4.4, fill: "#000000", strokeWidth: 2.6 }),
      h("circle", { key: "e", cx: 16, cy: 7.8, r: 0.9, fill: "#FF6A00", stroke: "none" }),
    ]),
  ]);

const tile = (size, inset) =>
  h("div", {
    style: {
      display: "flex", width: "100%", height: "100%", background: "#000000",
      alignItems: "center", justifyContent: "center",
    },
  }, mark(inset));

const WANTED = [
  { file: "icon-192.png", size: 192, inset: 4 },
  { file: "icon-512.png", size: 512, inset: 4 },
  // 10% inset each side leaves the mark inside the 80% safe zone every
  // maskable launcher guarantees it will not clip.
  { file: "icon-maskable-512.png", size: 512, inset: 12 },
  { file: "apple-touch-icon.png", size: 180, inset: 6 },
];

for (const { file, size, inset } of WANTED) {
  const res = new ImageResponse(tile(size, inset), { width: size, height: size });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`public/${file}`, buf);
  console.log(`public/${file} — ${size}x${size}, ${buf.length} bytes`);
}
