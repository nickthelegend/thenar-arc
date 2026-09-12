/**
 * Phase 2 runner for the page items (A) — real browser, real deployment.
 *
 * Every item captures console errors and failed network requests as well as its
 * own assertion, because the plan's definition of PASS requires all three.
 * A page that renders correctly and logs an error is a FAIL.
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://thenar.io";
const ONLY = process.argv[3];

const ITEMS = [
  ["A1",  "/",                 async (p) => {
      const r = await p.evaluate(() => ({
        weave: !!document.querySelector(".word-back") && !!document.querySelector(".subject"),
        sections: document.querySelectorAll(".lp > section").length,
        h1: document.querySelectorAll("h1").length,
      }));
      return [r.weave && r.sections === 7 && r.h1 === 1, `weave=${r.weave} sections=${r.sections} h1=${r.h1}`];
  }],
  ["A2",  "/hub",              async (p) => {
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return { rows: document.querySelectorAll("tbody tr, li[data-task], a[href^='/station/']").length,
                 hasFigures: /TASKS\s*\d/i.test(t) && /ESCROW AT STAKE/i.test(t) };
      });
      return [r.rows > 0 && r.hasFigures, `taskLinks=${r.rows} figures=${r.hasFigures}`];
  }],
  ["A7",  "/space",            async (p) => {
      const n = await p.evaluate(() => document.querySelectorAll("a[href^='/station/']").length);
      return [n > 0, `roomLinks=${n}`];
  }],
  ["A8",  "/station/1",        async (p) => {
      await p.waitForTimeout(5000);
      const r = await p.evaluate(() => {
        const c = document.querySelector("canvas");
        if (!c) return { canvas: false };
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        return { canvas: true, w: c.width, h: c.height, alive: gl ? !gl.isContextLost() : false,
                 brief: /datum circle|payload/i.test(document.body.innerText) };
      });
      return [r.canvas && r.w > 300 && r.alive && r.brief, JSON.stringify(r)];
  }],
  ["A10", "/spec",             async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [/21/.test(t) && /8,?080/.test(t) && /512/.test(t), `parts21=${/21/.test(t)} tris=${/8,?080/.test(t)} reach=${/512/.test(t)}`];
  }],
  ["A11", "/leaderboard",      async (p) => {
      const n = await p.evaluate(() => (document.body.innerText.match(/0x[0-9a-fA-F]{4}/g) || []).length);
      return [n > 0, `addressesShown=${n}`];
  }],
  ["A12", "/portfolio",        async (p) => {
      const t = await p.evaluate(() => document.body.innerText.trim().length);
      return [t > 120, `textLen=${t}`];
  }],
  ["A13", "/inventory",        async (p) => {
      const n = await p.evaluate(() => document.querySelectorAll("canvas, img").length);
      return [n > 0, `previews=${n}`];
  }],
  ["A14", "/corpus",           async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 120, "renders" ]],
  ["A15", "/policies",         async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 80, "renders" ]],
  ["A16", "/foundry",          async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 80, "renders" ]],
  ["A17", "/post",             async (p) => {
      const n = await p.evaluate(() => document.querySelectorAll("input,select,textarea,button").length);
      return [n > 3, `controls=${n}`];
  }],
  ["A18", "/changelog",        async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 200, "entries" ]],
  ["A19", "/status",           async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 120, "renders" ]],
  ["A20", "/archive",          async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 80, "renders" ]],
  ["A21", "/passkey",          async (p) => {
      const r = await p.evaluate(() => ({ crypto: !!window.crypto?.subtle, len: document.body.innerText.trim().length }));
      return [r.crypto && r.len > 120, JSON.stringify(r)];
  }],
  ["A22", "/task/1",           async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 200, "renders" ]],
  ["A26", "/handheld",         async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 60, "renders" ]],
  ["A27", "/offline",          async (p) => [ (await p.evaluate(()=>document.body.innerText.trim().length)) > 30, "renders" ]],
  ["A31", "/operator/0x391a51f85e738188274df07c3dd9099dd6f2d42b", async (p) => {
      // The one address on this deployment that has driven the same task twice.
      // The figures below are its own — 93.40 then 95.60 on task 1 — so this
      // fails if the differencing, the ordering, or the source data changes.
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return {
          section: /RUN TO RUN/i.test(t),
          sentence: /2 runs, 93\.40 to 95\.60 — up 2\.20/.test(t),
          // Oldest first, so the delta is an improvement rather than a decline.
          delta: /\+2\.20/.test(t),
          // Exactly one run is marked best, and it is the later one. Counted
          // inside the section only — "BEST SCORE" in the readings above it is
          // a different label about the whole record.
          // "Accepted runs" is also a reading at the top of the page, so the
          // section ends at the next one after it starts, not at the first one.
          bests: (() => {
            const from = t.search(/RUN TO RUN/i);
            const rest = t.slice(from);
            const to = rest.search(/ACCEPTED RUNS/i);
            return ((to > 0 ? rest.slice(0, to) : rest).match(/\bBEST\b/g) || []).length;
          })(),
          bestOnLast: /95\.60\s*\n\s*\+2\.20/.test(t),
        };
      });
      return [r.section && r.sentence && r.delta && r.bests === 1 && r.bestOnLast, JSON.stringify(r)];
  }],
  ["A32", "/operator/0xd2503e970298d74eec363a8e547172ab9efecfe4", async (p) => {
      // One run, on one task. There is no progression, and a header over an
      // empty panel would claim a repeat that never happened.
      const t = await p.evaluate(() => document.body.innerText);
      return [!/RUN TO RUN/i.test(t) && t.trim().length > 200, `section=${/RUN TO RUN/i.test(t)}`];
  }],
  ["A30", "/licence/0",       async (p) => {
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        const rows = Array.from(document.querySelectorAll("dd")).map((d) => d.innerText);
        return {
          // The decoded payload, one row per field the receipt encodes.
          decoded: rows.filter((x) => /[✓✗·]/.test(x)).length,
          crosses: rows.filter((x) => x.includes("✗")).length,
          // The real Attested event, not the view that answers for any policy.
          signedOnChain: /block\s[\d,]+/.test(t) && /MESSAGE ID/i.test(t),
          allMatch: /all \d+ match what the protocol holds/.test(t),
          bytes: /320 bytes signed/.test(t),
          // Producing a message is not delivering one, and the page must not blur them.
          honest: /only the first happens here/.test(t),
        };
      });
      const ok = r.decoded === 10 && r.crosses === 0 && r.signedOnChain &&
                 r.allMatch && r.bytes && r.honest;
      return [ok, JSON.stringify(r)];
  }],
  ["A33", "/corpus",          async (p) => {
      // The buyer's most consequential screen is the empty one, and there are
      // three different reasons it can be empty. Task 5 has never been driven;
      // task 4 has two recordings and neither cleared the floor. Both are read
      // from the same endpoint the list uses.
      const chip = async (label) => {
        await p.getByRole("button", { name: label, exact: true }).click();
        await p.waitForTimeout(2500);
        return p.evaluate(() => document.body.innerText);
      };
      await p.waitForTimeout(2500);
      const unworked = await chip("#5");
      const noneCleared = (await chip("#4"), await chip("Paid"));
      const r = {
        unworked: /Nobody has driven task #5 yet\./i.test(unworked),
        slots: /slots unfilled at [\d.]+ AVAX a run/i.test(unworked),
        counted: /2 recordings on task #4/i.test(noneCleared),
        floor: /not one of them cleared the 40\.00 a run has to reach to be paid/i.test(noneCleared),
        breakdown: /0 paid · 2 below the floor · 0 never sent/.test(noneCleared),
      };
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A34", "/post",            async (p) => {
      // A funder is about to commit money. The escrow figure was the smallest
      // of the three things they needed; these are the other two, read off the
      // chain rather than worked as an example.
      await p.waitForTimeout(9000);
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return {
          here: /BEFORE YOU SIGN/i.test(t),
          // The deployment's own record, not an illustration.
          ceiling: /9 accepted runs on this deployment averaged 91\.\d\d/.test(t),
          drawn: /would draw about 0\.0364 AVAX of the 0\.0400 escrowed/.test(t),
          // With no deadline set — this form's default and, until now, its only
          // behaviour — the escrow can never come back, and the page says which
          // call is responsible and what to do about it.
          noRefund: /With no deadline, what is not drawn stays in the contract for good/.test(t)
                    && /Set a deadline above if you want it back/.test(t),
          // And no gas number invented for a call nobody has made.
          gasHonest: /no task has yet been created through the call this button makes/.test(t),
        };
      });
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A35", "/run/0x363e2b555356e4f82e2fc9e26f2a81697c07f43c35415a9f9a311fd0d7c28485", async (p) => {
      // A real run that was let go in the air. The taxonomy has shipped in the
      // dataset export since the corpus started keeping failures and appeared
      // nowhere a person could read it.
      await p.waitForTimeout(4000);
      const t = await p.evaluate(() => document.body.innerText);
      const r = {
        here: /WHERE IT WENT WRONG/i.test(t),
        kind: /\bDROPPED\b/.test(t),
        detail: /Let go 54 mm above the table/.test(t),
        seek: /go to sample 4885/i.test(t),
      };
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A36", "/run/0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2", async (p) => {
      // The run whose samples disagree with the figure it was scored against —
      // recorded before the verifier began measuring placement from them. The
      // disagreement is the finding, and the page says so rather than showing
      // two numbers and letting the reader decide which to believe.
      await p.waitForTimeout(4000);
      const t = await p.evaluate(() => document.body.innerText);
      const r = {
        disagrees: /These samples do not agree with the score/.test(t),
        both: /scored against 4\.3 mm and the recording ends 61\.7 mm/.test(t),
        kept: /left as recorded/.test(t),
      };
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A37", "/run/0x845188107d38410fa8adc7cabaad97ef574a380f065f261da0947e5f88935e1e", async (p) => {
      // A real run 4.90 points under the floor. The gap in points is a unit
      // nobody drives in; these are the same points named as things to do.
      await p.waitForTimeout(4000);
      const t = await p.evaluate(() => document.body.innerText);
      const r = {
        here: /WHAT WOULD HAVE PAID/i.test(t),
        gap: /4\.90 points short of 40\.00/.test(t),
        placement: /come to rest within 22\.8 mm of the seat/.test(t),
        time: /finish inside 135 s/.test(t),
        // Smoothness is a quarter of the score and cannot carry a 40% floor on
        // its own, so it must not be offered as a target.
        noJerk: !/mean jerk under/.test(t),
      };
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A38", "/hub",             async (p) => {
      // Difficulty is a claim a funder typed. Every other claim here is checked
      // against the ledger; this one never was, and it does not survive the
      // check — task #4 is declared easier than #0 and has paid none of two.
      await p.waitForTimeout(7000);
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return {
          note: /Declared difficulty is not predicting anything/.test(t),
          named: /Task #4 is declared easier than #0/.test(t),
          // Counts, not only a rate: 0 of 2 and 0 of 200 are the same rate.
          counts: /0\/2 paid/.test(t) && /2\/2 paid/.test(t),
          // A closed task is not offered as work. It used to be: the interface
          // decoded a nine-field Task against an eleven-field contract, so it
          // could not see `closed` and put a Run button on a task whose escrow
          // had already gone back to its funder.
          closedHidden: !/Lapsed calibration sweep/.test(t),
          // And the rate an operator is actually choosing between.
          perMinute: /\/ min/.test(t),
        };
      });
      // And with the filter off it is listed, saying why rather than "Filled".
      await p.getByRole("button", { name: "Every task", exact: true }).click();
      await p.waitForTimeout(1200);
      const every = await p.evaluate(() => document.body.innerText);
      const r2 = {
        listed: /Lapsed calibration sweep/.test(every),
        // Uppercased by CSS, and innerText carries the transform.
        why: /escrow returned/i.test(every),
        // A deadline is either ahead of the reader or behind them, and which
        // one is a fact about today rather than about the page. Pinning this
        // to "until" made it pass for three days and then fail on the fourth,
        // when task #4's deadline went by.
        deadline: /until \d|deadline passed|escrow returned/i.test(every),
      };
      return [
        Object.values(r).every(Boolean) && Object.values(r2).every(Boolean),
        JSON.stringify({ ...r, ...r2 }),
      ];
  }],
  ["A39", "/contracts",       async (p) => {
      // Every write this contract has taken, from Avalanche's index, named
      // against the deployed contract's own artifact rather than the pruned
      // ABI the interface calls.
      await p.waitForTimeout(3000);
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return {
          here: /EVERY WRITE, AND WHAT IT COST/i.test(t),
          totals: /Calls\s*\n?\s*\d+/.test(t) && /Spent\s*\n?\s*[\d.]+ nAVAX/.test(t),
          // The three functions the frontend never calls, which read as
          // unrecognised selectors against the interface's own ABI.
          named: /createTaskUntil/.test(t) && /closeTask/.test(t) && /submitTrajectoryFor/.test(t),
          noneUnknown: !/unrecognised \(0x/.test(t),
        };
      });
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A41", "/corpus",          async (p) => {
      // The gate answers 402 and pointed nowhere: CorpusAccess.subscribe was
      // deployed, verified, read by /api/dataset, and callable from no page.
      await p.waitForTimeout(5000);
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return {
          here: /BULK ACCESS/i.test(t),
          // Price and bounds read from the contract, not written into the page.
          price: /0\.0010 AVAX a day/.test(t),
          bounds: /1–365 days, enforced by the contract/.test(t),
          // Seven days at that price, computed rather than stated.
          total: /0\.0070 AVAX/.test(t),
          // What it is and is not.
          honest: /sells time, not rights/.test(t) && /readable one at a time by hash without paying/.test(t),
        };
      });
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A42", "/run/0x376839a052f9270206fb1ab7f4cfe11ad4b66582f0ac4fc33bc89c064d591a32", async (p) => {
      // Trajectory 1: recorded, unminted. Anyone may mint it and the contract
      // sends the token to the recorded contributor, so there is nothing to
      // gate — and it was reachable from nowhere.
      await p.waitForTimeout(7000);
      const t = await p.evaluate(() => document.body.innerText);
      const r = {
        panel: /CERTIFICATE/.test(t),
        state: /not minted for this run/.test(t),
        // The id is resolved from the ledger by matching the hash.
        button: /mint token #1/i.test(t),
        whose: /goes to whoever the protocol recorded as the contributor/i.test(t),
      };
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A43", "/operator/0x391a51f85e738188274df07c3dd9099dd6f2d42b", async (p) => {
      // ContributionRecord.sync is callable by anyone for anyone by design —
      // so the record of an operator who never comes back is not left
      // understated — and was callable from nowhere in this interface. This
      // address is 189.00 points of recorded work behind its own token.
      await p.waitForTimeout(5000);
      const t = await p.evaluate(() => document.body.innerText);
      const r = {
        panel: /CONTRIBUTION RECORD/i.test(t),
        behind: /18,900 behind/.test(t),
        button: /sync 189\.00 points of work/i.test(t),
        why: /anyone may call it for anyone/i.test(t),
      };
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A44", "/foundry",         async (p) => {
      // The treasury the contributors decide how to spend: deployed, funded
      // with 0.01 AVAX, and reachable from no page — so proposal 0 passed
      // 16,500 to nil, closed, and has sat unexecuted ever since.
      await p.waitForTimeout(8000);
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return {
          here: /TREASURY/.test(t),
          funded: /Treasury\s*\n?\s*0\.0100 AVAX/.test(t),
          floor: /To propose\s*\n?\s*40\.00/.test(t),
          proposal: /Put the bowl on the rack/.test(t),
          tally: /165\.00 for · 0\.00 against/.test(t),
          // The decision was made and never carried out.
          waiting: /passed, waiting to be executed/.test(t),
          // No vote button on a closed ballot: that is an offer to send a
          // transaction the contract would revert.
          noVote: !/vote for/i.test(t),
        };
      });
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A45", "/operator/0x391a51f85e738188274df07c3dd9099dd6f2d42b", async (p) => {
      // The page read gas from Avalanche's index and never put earnings beside
      // it, leaving the interesting figure unstated: on this chain the work is
      // worth about a million times what it costs to record.
      await p.waitForTimeout(8000);
      const t = await p.evaluate(() => document.body.innerText);
      const r = {
        earned: /EARNED ON CHAIN/i.test(t) && /0\.001512/.test(t),
        gas: /GAS PAID/i.test(t),
        // Read off the chain and the index, then divided — not written down.
        ratio: /the work is worth\s+[\d,]+×\s+what it cost to record/.test(t),
      };
      return [Object.values(r).every(Boolean), JSON.stringify(r)];
  }],
  ["A46", "/hub",             async (p) => {
      // One underline that travels, rather than a border that vanishes from
      // one item and reappears on another. Asserted against the active item's
      // own box, on two routes, so it is measured rather than laid out.
      const read = () => p.evaluate(() => {
        const nav = document.querySelector("nav[aria-label='Sections']");
        const mark = nav?.querySelector("span[aria-hidden]");
        const active = nav?.querySelector("[aria-current='page']");
        if (!mark || !active) return null;
        const x = (mark.style.transform.match(/translateX\(([-\d.]+)px\)/) || [])[1];
        return {
          left: Math.round(parseFloat(x)), width: Math.round(parseFloat(mark.style.width)),
          activeLeft: active.offsetLeft, activeWidth: active.offsetWidth,
          moves: /transform/.test(getComputedStyle(mark).transitionProperty),
        };
      });
      await p.waitForTimeout(2500);
      const a = await read();
      await p.getByRole("link", { name: "Contracts", exact: true }).click();
      await p.waitForTimeout(2500);
      const b = await read();
      const fits = (m) => m && m.left === m.activeLeft && m.width === m.activeWidth;
      return [
        fits(a) && fits(b) && a.left !== b.left && a.moves,
        JSON.stringify({ hub: a, contracts: b }),
      ];
  }],
  ["A47", "/task/1",          async (p) => {
      // The tolerance drawn at the size it actually is, from lib/bench.ts —
      // and on this task the object is wider than the band it aims at.
      await p.waitForTimeout(6000);
      const r = await p.evaluate(() => {
        const svg = document.querySelector("figure svg");
        if (!svg) return null;
        const c = Array.from(svg.querySelectorAll("circle")).map((x) => ({
          cx: +x.getAttribute("cx"), r: +x.getAttribute("r"),
        }));
        return {
          ring: c.some((x) => x.cx === 0 && x.r === 75),
          // Two payloads on this bench, seated either side of the datum.
          seats: c.filter((x) => x.r === 25).map((x) => x.cx).sort((a, b) => a - b),
          payload: c.some((x) => x.r === 66),
          caption: document.querySelector("figcaption")?.innerText ?? "",
        };
      });
      const ok = r && r.ring && r.payload &&
                 r.seats.length === 2 && r.seats[0] === -38 && r.seats[1] === 38 &&
                 /wider than the band it is aiming at/.test(r.caption);
      return [Boolean(ok), JSON.stringify(r)];
  }],
  ["A29", "/l1",              async (p) => {
      const r = await p.evaluate(() => {
        const t = document.body.innerText;
        return {
          blocks: document.querySelectorAll("pre").length,
          headings: Array.from(document.querySelectorAll("h2")).map((h) => h.innerText.trim()),
          verdict: /32:\s*shown\s*\|\s*33:\s*shown\s*\|\s*36:\s*shown/.test(t),
          // Figures that can only have come from the committed transcript, one
          // per claim: the mint, the fee floor, and the delivered policy.
          mint: /newcomer holds 25 THN/.test(t),
          fee: /0\.000000021 THN/.test(t),
          delivered: /the destination holds task 0n \| 2 trajectories \| fee 0\.5/.test(t),
          // The page must say plainly that the chain is not reachable from here.
          honest: /transcript, not a live panel/i.test(t),
        };
      });
      const ok = r.blocks === 3 && r.headings.length === 3 && r.verdict &&
                 r.mint && r.fee && r.delivered && r.honest;
      return [ok, JSON.stringify(r)];
  }],
  ["A28", "/no-such-page-xyz", async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [/not found|404/i.test(t) && !/stack|at Object|webpack/i.test(t), `notFound=${/not found|404/i.test(t)}`];
  }],
  ["D1",  "/task/99999",       async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [t.trim().length > 30 && !/stack|at Object/i.test(t), "no crash"];
  }],
  ["D2",  "/operator/0x000000000000000000000000000000000000dEaD", async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [t.trim().length > 60, "empty state present"];
  }],
  ["D3",  "/run/0xbogushashvalue", async (p) => {
      const t = await p.evaluate(() => document.body.innerText);
      return [t.trim().length > 30 && !/stack|at Object/i.test(t), "no crash"];
  }],
];

const browser = await chromium.launch({ args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const results = [];

for (const [id, route, assert] of ITEMS) {
  if (ONLY && !ONLY.split(",").includes(id)) continue;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const netFail = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 120)));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 120)); });
  page.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400 && (u.startsWith(BASE) || u.includes("thenar.io"))) netFail.push(`${r.status()} ${u.replace(BASE, "")}`);
  });

  let ok = false, detail = "";
  try {
    // domcontentloaded, not networkidle. The station holds a live occupancy
    // stream and an RPC watch subscription open for as long as it is on screen,
    // so network never goes idle and a networkidle wait times out on a page
    // that loaded correctly in 450ms.
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 60000 });
    // The leaderboard aggregates from a client-side scan of event logs over many
    // block ranges against a public RPC, so its first data lands around 14s.
    // That is a real latency finding, not a reason to measure it too early.
    await page.waitForTimeout(
      route.startsWith("/station") ? 6000 : route === "/leaderboard" ? 16000 : 1800,
    );
    // The 404 item is expected to be a 404 document; nothing else is.
    // A route that is meant not to exist is *expected* to 404, and a 404 is the
    // correct answer rather than a defect. Two requests carry that status on
    // these items and both are accounted for: the document itself, and one
    // re-fetch of the same URL by the bundled wallet connector, which reads the
    // current page's Cross-Origin-Opener-Policy header before it is allowed to
    // open a popup. Nothing else on the route is permitted to 4xx.
    if (id === "A28" || id === "D1" || id === "D3") {
      for (let k = netFail.length - 1; k >= 0; k--) {
        if (netFail[k].startsWith("404") && netFail[k].endsWith(route)) netFail.splice(k, 1);
      }
      for (let k = consoleErrors.length - 1; k >= 0; k--) {
        if (/status of 404|Cross-Origin-Opener-Policy: HTTP error! status: 404/.test(consoleErrors[k])) {
          consoleErrors.splice(k, 1);
        }
      }
    }
    [ok, detail] = await assert(page);
  } catch (e) { detail = "EXCEPTION " + String(e).slice(0, 100); }

  const pass = ok && consoleErrors.length === 0 && netFail.length === 0;
  results.push({ id, route, pass, detail, consoleErrors: [...new Set(consoleErrors)].slice(0,2), netFail: [...new Set(netFail)].slice(0,3) });
  await page.close();
}
await browser.close();

let passed = 0;
for (const r of results) {
  if (r.pass) passed++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(4)} ${r.route.padEnd(34)} ${r.detail}`);
  r.consoleErrors.forEach((e) => console.log(`         console: ${e}`));
  r.netFail.forEach((e) => console.log(`         network: ${e}`));
}
console.log(`\n${passed}/${results.length} pass`);
// Non-zero when anything failed, or CI reports green over a red run.
process.exit(passed === results.length ? 0 : 1);
