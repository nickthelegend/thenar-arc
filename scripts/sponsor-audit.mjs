#!/usr/bin/env node
/**
 * Audit whether a sponsor's technology is actually used in this project.
 *
 *   node scripts/sponsor-audit.mjs <name> [--pkg <substr>] [--host <substr>] [--sym <substr>]
 *
 * Written because the honest answer to "is X used here" is almost never what a
 * grep for the name suggests. A package can be a dependency and never called; a
 * name can appear thirty times and all of them be page copy. This separates
 * those cases mechanically, so the judgement left over is the part that needs a
 * person.
 *
 * Classifications match the ones a sponsor-track judge cares about:
 *   GENUINELY USED     a real call in a real flow
 *   IMPORTED BUT UNUSED  the package is installed, nothing calls it
 *   PROSE ONLY         the name appears, but only in copy
 *   ABSENT             nothing at all
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const argv = process.argv.slice(2);
const name = argv.find((a) => !a.startsWith("--"));
if (!name) {
  console.error("usage: node scripts/sponsor-audit.mjs <sponsor> [--pkg s] [--host s] [--sym s]");
  process.exit(1);
}
const opt = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const needles = [name.toLowerCase(), opt("--pkg"), opt("--host"), opt("--sym")]
  .filter(Boolean).map((s) => s.toLowerCase());

const SRC = ["app", "components", "lib", "contracts/src", "scripts", "cad"];
// Config carries the deployment wiring — a backend origin, a chain URL — and
// leaving it out once made a service that the whole API proxies to look absent.
const CONFIG = ["package.json", "next.config.ts", "vercel.json", "railway.json", "foundry.toml"];
const CODE = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".sol", ".py"]);

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (/node_modules|\.next|out|cache|__pycache__/.test(e)) continue;
    const p = join(dir, e);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

// 1. is it a dependency?
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const matchedDeps = Object.keys(deps).filter((d) => needles.some((n) => d.toLowerCase().includes(n)));

// 2. where does the name appear, and is that line code or copy?
const files = [...SRC.flatMap((d) => walk(d)), ...CONFIG.filter((f) => existsSync(f))];
const hits = [];
// Symbols imported from a matching package. Real usage calls these, not the
// sponsor's name — nothing that uses viem writes "viem" on the call line — so
// counting name matches alone reports every deeply-used library as unused.
const symbols = new Set();

for (const f of files) {
  const ext = extname(f);
  if (!CODE.has(ext) && !CONFIG.includes(f)) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    const low = line.toLowerCase();
    if (!needles.some((n) => low.includes(n))) return;
    const isImport = /^\s*(import|from|require\()/.test(line);
    if (isImport) {
      const braces = line.match(/\{([^}]*)\}/);
      if (braces) for (const part of braces[1].split(",")) {
        const sym = part.split(/\s+as\s+/).pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(sym)) symbols.add(sym);
      }
      const dflt = line.match(/import\s+([A-Za-z_$][\w$]*)\s+from/);
      if (dflt) symbols.add(dflt[1]);
    }
    const isProse = /^\s*(\/\/|\*|#)/.test(line) || /^[^"'`]*["'`][^"'`]{20,}["'`]/.test(line);
    hits.push({ file: f, line: i + 1, kind: isImport ? "import" : isProse ? "prose" : "other",
                text: line.trim().slice(0, 100) });
  });
}

// 3. now find where those symbols are actually called
const calls = [];
if (symbols.size) {
  const re = new RegExp(`\\b(${[...symbols].join("|")})\\s*[\\(<]`);
  for (const f of files) {
    if (!CODE.has(extname(f))) continue;
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(import|from|\/\/|\*)/.test(line)) return;
      const m = line.match(re);
      if (m) calls.push({ file: f, line: i + 1, kind: "call", text: line.trim().slice(0, 100), sym: m[1] });
    });
  }
}

const by = (k) => hits.filter((h) => h.kind === k);
const imports = by("import"), prose = by("prose");

let verdict;
if (calls.length > 0 && matchedDeps.length > 0) verdict = "GENUINELY USED — a dependency with real call sites";
else if (calls.length > 0) verdict = "GENUINELY USED — real call sites, no package (likely an HTTP API)";
else if (matchedDeps.length > 0 && imports.length > 0) verdict = "IMPORTED BUT UNUSED — installed and imported, nothing calls it";
else if (matchedDeps.length > 0) verdict = "IMPORTED BUT UNUSED — installed, never imported";
else if (prose.length > 0) verdict = "PROSE ONLY — the name appears, but only in copy";
else verdict = "ABSENT — nothing in the codebase touches it";

console.log(`\n  sponsor        ${name}`);
console.log(`  needles        ${needles.join(", ")}`);
console.log(`  dependencies   ${matchedDeps.length ? matchedDeps.join(", ") : "none"}`);
console.log(`  call sites     ${calls.length}${symbols.size ? `  (via ${[...symbols].slice(0,6).join(", ")}${symbols.size>6?"…":""})` : ""}`);
console.log(`  imports        ${imports.length}`);
console.log(`  prose mentions ${prose.length}`);
console.log(`\n  VERDICT: ${verdict}\n`);

for (const [label, group] of [["calls", calls], ["imports", imports], ["prose", prose]]) {
  if (!group.length) continue;
  console.log(`  ${label}:`);
  for (const h of group.slice(0, 8)) console.log(`    ${h.file}:${h.line}  ${h.text}`);
  if (group.length > 8) console.log(`    … and ${group.length - 8} more`);
  console.log();
}
console.log("  Still to check by hand: run the flow in a browser and confirm a real");
console.log("  request goes out. A call site is not proof the flow reaches it.\n");
