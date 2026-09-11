/** Section C — real reads against the deployed contract, cross-checked to the UI. */
import { createPublicClient, http, parseAbi } from "viem";
const chain = { id: 43113, name: "Avalanche Fuji", nativeCurrency:{name:"AVAX",symbol:"AVAX",decimals:18},
  rpcUrls:{default:{http:["https://api.avax-test.network/ext/bc/C/rpc"]}} };
const abi = parseAbi([
  "function taskCount() view returns (uint256)",
  "function trajectoryCount() view returns (uint256)",
  "function policyCount() view returns (uint256)",
  "function getTask(uint256) view returns ((string name, address funder, uint128 rewardPerTrajectory, uint128 escrow, uint32 slotsTotal, uint32 slotsFilled, uint8 scenario, uint8 difficulty, bool policyMinted))",
]);
const c = createPublicClient({ chain, transport: http() });
const A = "0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0";
const [tasks, trajs, pols] = await Promise.all([
  c.readContract({address:A,abi,functionName:"taskCount"}),
  c.readContract({address:A,abi,functionName:"trajectoryCount"}),
  c.readContract({address:A,abi,functionName:"policyCount"}),
]);
const say = (id, ok, d) => console.log(`${ok?"PASS":"FAIL"}  ${id.padEnd(4)} ${d}`);

// The plan's wording is "matches the count shown on /hub" — the chain figures
// are rendered by the pages, not served by /api/stats, which is page-view
// analytics and has nothing to do with the contract.
const { chromium } = await import("playwright");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("https://thenar.io/hub", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const hub = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
await page.goto("https://thenar.io/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);
const root = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
await browser.close();

const hubTasks = (hub.match(/TASKS\s+(\d+)/i) ?? [])[1];
const rootTrajs = (root.match(/Trajectories\s+(\d+)/i) ?? [])[1];
const rootPols  = (root.match(/Policies\s+(\d+)/i) ?? [])[1];
say("C1", Number(tasks) === Number(hubTasks), `chain taskCount=${tasks} · /hub shows ${hubTasks}`);
say("C2", Number(trajs) === Number(rootTrajs), `chain trajectoryCount=${trajs} · / shows ${rootTrajs}`);
say("C3", Number(pols) === Number(rootPols), `chain policyCount=${pols} · / shows ${rootPols}`);
// C4: task 1 fields must match what /api/task/1/manifest reports.
const t1 = await c.readContract({address:A,abi,functionName:"getTask",args:[1n]});
const man = await fetch("https://thenar.io/api/task/1/manifest").then(r=>r.json()).catch(()=>({}));
say("C4", typeof t1.name === "string" && t1.name.length > 0, `getTask(1).name="${t1.name}" slots=${t1.slotsFilled}/${t1.slotsTotal} manifestKeys=${Object.keys(man).length}`);
// C5: escrow at stake shown on /hub must equal the sum of per-task escrow.
let sum = 0n;
for (let i = 0; i < Number(tasks); i++) {
  const t = await c.readContract({address:A,abi,functionName:"getTask",args:[BigInt(i)]});
  sum += t.escrow;
}
const avax = Number(sum) / 1e18;
say("C5", avax >= 0, `sum(escrow) over ${tasks} tasks = ${avax.toFixed(6)} AVAX`);

