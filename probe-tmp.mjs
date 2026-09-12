import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle","--use-angle=metal"] });
for (const [label, url] of [
  ["local, store up, hash absent", "http://127.0.0.1:3111/run/0x363e2b555356e4f82e2fc9e26f2a81697c07f43c35415a9f9a311fd0d7c28485"],
  ["local, store unreachable",     "http://127.0.0.1:3112/run/0x363e2b555356e4f82e2fc9e26f2a81697c07f43c35415a9f9a311fd0d7c28485"],
]) {
  const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    const t = await page.evaluate(()=>document.querySelector("main")?.innerText ?? "");
    console.log("=== " + label + " ===", t.slice(0, 260).replace(/\n+/g," | "));
  } catch (e) { console.log("=== " + label + " ===", "nav failed:", String(e.message).slice(0,60)); }
  await page.close();
}
await b.close();
