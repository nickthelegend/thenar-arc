/**
 * Drive a real run, end to end, and check what the station says about it.
 *
 * Everything else in the QA set reads a page. This one operates the machine:
 * it opens the station, begins a run, drives the arm with the same key events
 * an operator's keyboard produces, grasps each payload, places it on its seat,
 * and waits for the station to take its own measurement.
 *
 * Which is the only way to check the panels that exist after a run. They are
 * behind a completed, accepted run by design — a cost line on an unsubmittable
 * run would be quoting a price for nothing — so a runner that only navigates
 * can never see them, and the parts of this product an operator actually spends
 * their time in were the parts nothing tested.
 *
 * The arm is driven closed-loop off the station's own telemetry strip rather
 * than by a fixed script of key presses: read where the tool is, press towards
 * where it should be, read again. A fixed script would pass or fail on frame
 * timing rather than on whether the station works.
 *
 *   node scripts/qa-run.mjs [baseUrl] [taskId]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";
const TASK = process.argv[3] ?? "1";

/** From lib/bench.ts and the station's own start pose — the geometry under test. */
const GOAL = [0.16, -0.18];
const SEAT_OFFSET = 0.038;
const START = [0.22, 0.14];
/** Tool speed in scene units per second, from the viewport's `dt * 0.42`. */
const SPEED = 0.42;
/** Below this the jaws are on the payload rather than above it. */
const GRASP_Z = 0.1;

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(4)} ${detail}`);
};

/**
 * The GPU matters here in a way it does not for the other runners.
 *
 * They navigate and read; this one operates a machine in real time, and the
 * arm moves at `dt * 0.42` per frame off a render loop. Under SwiftShader that
 * loop runs at eight frames a second, so a key held for a fifth of a second
 * covers one frame or none and the tool arrives somewhere different every run —
 * the runner would be measuring the software rasteriser, not the station.
 * Through the platform's own backend it is sixty, and a press means what an
 * operator's press means. SwiftShader stays as the fallback so this runs at all
 * where there is no GPU to ask for.
 */
const GPU_FIRST = ["--use-gl=angle", "--use-angle=metal"];
const GPU_FALLBACK = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

const browser = await chromium
  .launch({ args: GPU_FIRST })
  .catch(() => chromium.launch({ args: GPU_FALLBACK }));
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });

/** The station's own telemetry strip, which is what an operator reads too. */
async function tool() {
  return page.evaluate(() => {
    const t = document.body.innerText;
    const m = t.match(/X\s+([-\d.]+)\s+Y\s+([-\d.]+)\s+Z\s+([-\d.]+)\s+JAW\s+(\d+)/);
    if (!m) return null;
    return {
      x: +m[1], y: +m[2], z: +m[3], jaw: +m[4],
      held: /PAYLOAD HELD/.test(t),
    };
  });
}

async function hold(key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/** Drive the tool to a height, then hold it there. */
async function toHeight(z) {
  for (let i = 0; i < 40; i += 1) {
    const t = await tool();
    if (!t) return false;
    const dz = z - t.z;
    if (Math.abs(dz) < 0.006) return true;
    await hold(dz > 0 ? "e" : "q", Math.min(400, Math.max(30, (Math.abs(dz) / SPEED) * 1000)));
  }
  return false;
}

/**
 * Drive the tool to a point on the table plane, and report how close it got.
 *
 * Both axes at once while both are far, one axis to finish. The first version
 * moved the longest axis alone each iteration, which arrives along a staircase
 * — the worst possible path for a score that is a quarter mean jerk. Driving
 * the diagonal is quicker and smoother, which is what the scoring says about a
 * human operator too.
 *
 * It reports the distance rather than a boolean, because "arrived" is not a
 * thing the controls can promise. One frame of movement is 0.42 × dt ≈ 7 mm and
 * the shortest press spans at least one frame, so no loop can settle inside a
 * few millimetres; asking it to just spent sixty presses oscillating. The
 * caller asserts against the tolerance that actually matters — the scorer's
 * 25 mm — instead of against the control loop's own precision.
 */
async function moveTo(x, y, tol = 0.006) {
  let last = Infinity;
  let stalled = 0;
  for (let i = 0; i < 40; i += 1) {
    const t = await tool();
    if (!t) return null;
    const dx = x - t.x;
    const dy = y - t.y;
    const d = Math.hypot(dx, dy);
    if (d < tol) return { t, d };

    // One frame of movement is about 7 mm and the shortest press spans at
    // least one, so the last few millimetres are found by alternating axes and
    // overshooting less each time rather than by converging. Bailing at the
    // first non-improvement stops that search at 19 mm; six gives it room to
    // finish, and still terminates.
    if (d >= last - 0.0005) stalled += 1; else stalled = 0;
    if (stalled >= 6) return { t, d };
    last = d;

    const kx = dx > 0 ? "w" : "s";
    const ky = dy > 0 ? "a" : "d";
    const both = Math.min(Math.abs(dx), Math.abs(dy));
    // Capped high so a long leg is one press rather than four: every gap
    // between presses is a stop and a start, and a quarter of the score is
    // mean jerk.
    const ms = (v) => Math.min(900, Math.max(25, (v / SPEED) * 1000));

    if (both > tol) {
      // The shared leg of the diagonal, both keys down together.
      await page.keyboard.down(kx);
      await page.keyboard.down(ky);
      await page.waitForTimeout(ms(both));
      await page.keyboard.up(kx);
      await page.keyboard.up(ky);
    } else {
      const [rest, key] = Math.abs(dx) >= Math.abs(dy) ? [Math.abs(dx), kx] : [Math.abs(dy), ky];
      await hold(key, ms(rest));
    }
  }
  const t = await tool();
  return t ? { t, d: Math.hypot(x - t.x, y - t.y) } : null;
}

const seat = (i, n) => (n < 2 ? GOAL : [GOAL[0] + (i === 0 ? -SEAT_OFFSET : SEAT_OFFSET), GOAL[1]]);

try {
  await page.goto(`${BASE}/station/${TASK}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: /begin run/i }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: /begin run/i }).click();
  await page.waitForTimeout(1500);

  const t0 = await tool();
  check("R1", Boolean(t0), `run began, telemetry live ${t0 ? `at x=${t0.x} y=${t0.y} z=${t0.z}` : "— no readout"}`);
  if (!t0) throw new Error("no telemetry");

  // Two payloads on this bench, spread from the shared start pose by the
  // viewport's own offsets. Spoon first: doing it in the other order still
  // records and still pays, and costs 8% of the score.
  const payloads = [
    [START[0] - 0.03, START[1] + 0.03],
    [START[0] + 0.06, START[1] - 0.05],
  ];

  /** One attempt at the whole task, driven end to end. */
  async function drive(attempt) {
    await toHeight(GRASP_Z);

    for (let i = 0; i < payloads.length; i += 1) {
      const [px, py] = payloads[i];
      const at = await moveTo(px, py);
      // CAPTURE_R is 90 mm; anywhere well inside it is over the payload.
      if (attempt === 1) check(`R2.${i}`, Boolean(at) && at.d < 0.03,
            `over payload ${i} ${at ? `— ${(at.d * 1000).toFixed(0)} mm from its centre` : "— no reading"}`);

      await toHeight(GRASP_Z);
      await page.keyboard.press("Space");
      await page.waitForTimeout(400);
      const grabbed = await tool();
      if (attempt === 1) check(`R3.${i}`, Boolean(grabbed?.held), `payload ${i} in the jaws (jaw ${grabbed?.jaw} mm)`);
      if (!grabbed?.held) break;

      const [sx, sy] = seat(i, payloads.length);
      const placed = await moveTo(sx, sy);
      // The scorer's own band. A release inside it is a placement in tolerance,
      // which is the only sense in which the tool arrived.
      if (attempt === 1) check(`R4.${i}`, Boolean(placed) && placed.d <= 0.025,
            `payload ${i} over its seat ${placed ? `— ${(placed.d * 1000).toFixed(1)} mm out, inside the 25 mm band` : "— no reading"}`);

      await page.keyboard.press("Space");
      await page.waitForTimeout(900);
      const let_go = await tool();
      if (attempt === 1) check(`R5.${i}`, !let_go?.held, `payload ${i} released`);
    }

    // The station measures on its own once everything is down; there is nothing
    // to press, which is the behaviour under test as much as the score is.
    await page.waitForFunction(() => /IN TOLERANCE|OUT OF TOLERANCE/.test(document.body.innerText), null, { timeout: 30000 })
      .catch(() => {});

    return page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/(IN TOLERANCE|OUT OF TOLERANCE)[\s\S]{0,40}?([\d.]+)\s*\/\s*100\.00/);
      return { measured: Boolean(m), accepted: m?.[1] === "IN TOLERANCE", score: m ? Number(m[2]) : null };
    });
  }

  /**
   * Up to three attempts, taken through the station's own Run again.
   *
   * Not to flatter the result. A keyboard-driven run lands between the high
   * thirties and the low eighties, and most of that spread is mean jerk — a
   * quarter of the score, and the part a loop of discrete key presses is worst
   * at. What is under test is the panel an accepted run puts up, and an
   * operator whose run misses the floor is told by this very product to run it
   * again. So the runner does what the product tells them, and reports how many
   * attempts it took rather than hiding them.
   *
   * The per-step checks fire on the first attempt only. They are about whether
   * the controls work, and they did or did not the first time.
   */
  let outcome = await drive(1);
  let attempts = 1;
  while (outcome.measured && !outcome.accepted && attempts < 3) {
    await page.getByRole("button", { name: /run again/i }).click();
    await page.waitForTimeout(1500);
    attempts += 1;
    outcome = await drive(attempts);
  }

  // The cost line reads the chain when the panel mounts — a log scan and a
  // receipt for each recent submit — so it arrives a moment after the score.
  // Waited for rather than slept past, and its absence is a failure rather than
  // a timeout to be forgiven.
  await page
    .waitForFunction(() => /Gas on submit|nothing measured to quote|No recent submit/.test(document.body.innerText), null, { timeout: 30000 })
    .catch(() => {});

  const snap = await page.evaluate(() => {
    const t = document.body.innerText;
    const score = (t.match(/([\d.]+)\s*\/\s*100\.00/) || [])[1];
    return {
      measured: /IN TOLERANCE|OUT OF TOLERANCE/.test(t),
      accepted: /IN TOLERANCE/.test(t),
      score: score ? Number(score) : null,
      // What this run will cost to submit — measured, not estimated.
      costLine: (t.match(/Gas on submit, about\s+([^\n]+)/) || [])[1] ?? null,
      gasLine: (t.match(/([\d,]+) gas[^\n]*measured submits?[^\n]*/) || [])[0] ?? null,
      limitNote: /charged at least half the gas limit/.test(t),
      // innerText carries the CSS text-transform, so this label arrives uppercased.
      payable: /payable on submit/i.test(t),
    };
  });

  check("R6", snap.measured, `station measured the run on its own${snap.score !== null ? ` — ${snap.score}/100.00` : ""}`);
  check("R7", snap.accepted,
        snap.accepted
          ? `run is in tolerance${attempts > 1 ? ` on attempt ${attempts} of 3` : ""}`
          : `still out of tolerance after ${attempts} attempts, so the submit panels cannot be checked`);
  if (snap.accepted) {
    check("R8", Boolean(snap.costLine), `cost stated before submitting: ${snap.costLine ?? "absent"}`);
    check("R9", Boolean(snap.gasLine), `and what it is measured from: ${snap.gasLine ?? "absent"}`);
    check("R10", snap.limitNote, "the gas-limit finding is stated");
    check("R11", snap.payable, "payout still shown beside it");
  }

  // The sitting: what this stretch at the bench came to, and whether it
  // survives leaving the station — which is the moment an operator wants it.
  const sitting = await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.search(/THIS SITTING/i);
    const block = i < 0 ? "" : t.slice(i, i + 300);
    return {
      here: i >= 0,
      best: (block.match(/BEST SCORE\s*\n?\s*([\d.]+)/) || [])[1] ?? null,
      measured: (block.match(/RUNS MEASURED\s*\n?\s*(\d+)/) || [])[1] ?? null,
    };
  });
  check("R13", sitting.here && sitting.best !== null,
        `sitting shows a best score: ${sitting.best ?? "absent"} over ${sitting.measured ?? "?"} measured`);

  await page.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const carried = await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.search(/THIS SITTING/i);
    const block = i < 0 ? "" : t.slice(i, i + 400);
    return {
      here: i >= 0,
      best: (block.match(/BEST\s*\n?\s*([\d.]+)/) || [])[1] ?? null,
      measured: (block.match(/MEASURED\s*\n?\s*(\d+)/) || [])[1] ?? null,
      // Uppercased by CSS, and innerText carries the transform.
      backTo: /back to #\d/i.test(block),
    };
  });
  check("R14", carried.here && carried.best === sitting.best && carried.measured === sitting.measured,
        `sitting survives leaving the station: best ${carried.best ?? "absent"}, ${carried.measured ?? "?"} measured`);
  check("R15", carried.backTo, "and links back to the task it was worked on");

  check("R12", consoleErrors.length === 0, consoleErrors.length ? `console: ${consoleErrors[0]}` : "no console errors through the whole run");
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} pass`);
process.exit(passed === results.length ? 0 : 1);
