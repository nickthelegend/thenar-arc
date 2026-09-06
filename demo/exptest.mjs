import { chromium } from "playwright";
const TX = "0x9092f67adf33c07d2767378e439818e8e2d0ccd407098f27e95257eda38d192e";
const urls = [
  `https://testnet.monadexplorer.com/tx/${TX}`,
  `https://monad-testnet.socialscan.io/tx/${TX}`,
  `https://testnet.monadscan.com/tx/${TX}`,
];
const b = await chromium.launch();
for (const u of urls) {
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await p.goto(u, { waitUntil: "domcontentloaded", timeout: 35000 });
    await p.waitForTimeout(6000);
    const t = (await p.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 260);
    const blocked = /security verification|verify you are human|just a moment|cloudflare|are not a bot/i.test(t);
    console.log(`${blocked ? "BLOCKED " : "OK      "} ${u}\n         ${t.slice(0,190)}\n`);
  } catch (e) { console.log(`ERROR   ${u} — ${e.message.split("\n")[0]}\n`); }
  await p.close();
}
await b.close();
