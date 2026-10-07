/**
 * Section F — the contract registry, checked against the chain it claims to read.
 *
 * /contracts asserts that every listed contract is deployed, holds what it says
 * it holds, and that the readings beside it are live. This confirms each of
 * those independently: the address is called directly, and the figure the page
 * printed has to match what the node returns.
 *
 *   node --import ./test/register.mjs scripts/qa-contracts.mjs [base]
 *
 * Ported from Fuji to Monad. The registry is imported rather than scraped: it
 * used to hold literal addresses a regex could lift out of the source, and now
 * reads them from lib/deployment.ts, so importing it is the only way to see the
 * addresses the page sees.
 */
import { chromium } from "playwright";
import { createPublicClient, formatEther } from "viem";
import { DEPLOYED } from "../lib/registry.ts";
import { DEPLOYMENT } from "../lib/deployment.ts";
import { appChain, transport } from "./monad.mjs";

const BASE = process.argv[2] ?? "https://thenar.io";
const node = createPublicClient({ chain: appChain, transport: transport() });
const SYMBOL = appChain.nativeCurrency.symbol;

// Addresses come from the registry the app itself ships, not from a copy here.
const entries = DEPLOYED.map((d) => ({ name: d.name, address: d.address, monad: d.monad }));

let pass = 0, total = 0;
const check = (id, ok, detail) => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(5)} ${detail}`); };

// The registry drops any contract without an address, so a partial deploy
// would shrink the list silently. It has to list every contract the deployment
// record says was created, and at least one.
const written = Object.values(DEPLOYMENT.contracts).filter(Boolean).length;
check("F1", entries.length > 0 && entries.length === written,
  `registry lists ${entries.length} contracts, deployment record has ${written}`);

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
const bal = axon ? await node.getBalance({ address: axon.address }) : 0n;
check("F5", Boolean(axon) && text.includes(`${formatEther(bal)} ${SYMBOL}`),
  `escrow on page matches node: ${formatEther(bal)} ${SYMBOL}`);

// F6 — nothing on the page failed to read.
check("F6", !/unreadable/.test(text), `no unreadable readings`);

// F7 — what each contract leans on Monad for is said beside it. This was the
// Avalanche check (Warp and ElGamal named); on Monad the registry carries the
// claim per contract, so each one is looked for on the page, whitespace and
// all collapsed the way the page text is.
const monadNotes = entries.filter((e) => e.monad);
const unsaid = monadNotes.filter((e) => !text.includes(e.monad.replace(/\s+/g, " ")));
check("F7", monadNotes.length > 0 && unsaid.length === 0,
  `${monadNotes.length} Monad-specific notes surfaced${unsaid.length ? ` — missing for: ${unsaid.map((e) => e.name).join(", ")}` : ""}`);

// F8 — console and network clean, same bar as every other page.
check("F8", errs.length === 0 && net.length === 0, `console ${errs.length}, network ${net.length}`);

await browser.close();
console.log(`\n${pass}/${total} pass`);
process.exit(pass === total ? 0 : 1);
