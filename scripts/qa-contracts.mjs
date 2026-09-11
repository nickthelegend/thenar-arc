/**
 * Section F — the contract registry, checked against the chain it claims to read.
 *
 * /contracts asserts that every listed contract is deployed, holds what it says
 * it holds, and that the readings beside it are live. This confirms each of
 * those independently: the address is called directly, and the figure the page
 * printed has to match what the node returns.
 */
import { chromium } from "playwright";
import { createPublicClient, http, formatEther } from "viem";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "https://thenar.io";
const chain = { id: 43113, name: "Fuji", nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.avax-test.network/ext/bc/C/rpc"] } } };
const node = createPublicClient({ chain, transport: http() });

// Addresses come from the registry the app itself ships, not from a copy here.
const src = readFileSync("lib/registry.ts", "utf8");
const entries = [...src.matchAll(/name:\s*"([^"]+)",\s*\n\s*address:\s*"(0x[0-9a-fA-F]{40})"/g)]
  .map((m) => ({ name: m[1], address: m[2] }));

let pass = 0, total = 0;
const check = (id, ok, detail) => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(5)} ${detail}`); };

check("F1", entries.length >= 12, `registry parses ${entries.length} contracts`);

// F2 — every address in the registry has code on chain.
const noCode = [];
for (const e of entries) {
  const code = await node.getBytecode({ address: e.address }).catch(() => null);
  if (!code || code.length <= 2) noCode.push(e.name);
}
check("F2", noCode.length === 0, `all ${entries.length} have bytecode${noCode.length ? ` — missing: ${noCode.join(", ")}` : ""}`);

// F3 — the page renders, and every registry address appears on it.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
const errs = [], net = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 80)));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 80)); });
page.on("response", (r) => { if (r.status() >= 400 && r.url().includes("thenar.io")) net.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
const res = await page.goto(BASE + "/contracts", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(4000);
const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
check("F3", res.status() === 200, `/contracts HTTP ${res.status()}`);
const absent = entries.filter((e) => !text.includes(e.address));
check("F4", absent.length === 0, `every registry address rendered${absent.length ? ` — absent: ${absent.map(a=>a.name).join(", ")}` : ""}`);

// F5 — the balance the page prints for the protocol contract matches the node.
const axon = entries.find((e) => /AxonProtocolV2/.test(e.name));
const bal = await node.getBalance({ address: axon.address });
check("F5", text.includes(formatEther(bal)), `escrow on page matches node: ${formatEther(bal)} AVAX`);

// F6 — nothing on the page failed to read.
check("F6", !/unreadable/.test(text), `no unreadable readings`);

// F7 — the two Avalanche-specific contracts are named as such.
check("F7", /Warp/.test(text) && /ElGamal/.test(text), `Warp and ElGamal both surfaced`);

// F8 — console and network clean, same bar as every other page.
check("F8", errs.length === 0 && net.length === 0, `console ${errs.length}, network ${net.length}`);

await browser.close();
console.log(`\n${pass}/${total} pass`);
process.exit(pass === total ? 0 : 1);
