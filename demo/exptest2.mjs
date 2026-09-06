import { chromium } from "playwright";
const TX = "0x9092f67adf33c07d2767378e439818e8e2d0ccd407098f27e95257eda38d192e";
const ctx = await chromium.launchPersistentContext("/tmp/pw-profile", {
  headless: false,
  viewport: { width: 1280, height: 800 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  args: ["--disable-blink-features=AutomationControlled"],
});
const p = ctx.pages()[0] ?? await ctx.newPage();
for (const u of [`https://testnet.monadscan.com/tx/${TX}`]) {
  await p.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
  for (let i = 0; i < 12; i++) {
    await p.waitForTimeout(2500);
    const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    const blocked = /security verification|verify you are human|just a moment|are not a bot/i.test(t);
    if (!blocked) { console.log(`OK after ${(i+1)*2.5}s:\n${t.slice(0, 400)}`); break; }
    if (i === 11) console.log("STILL BLOCKED after 30s");
  }
}
await p.screenshot({ path: "demo/out/explorer-test.png" });
await ctx.close();
