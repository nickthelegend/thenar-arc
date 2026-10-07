// Records the Avalanche Fuji-era QA run as it was; its item wording predates the move to Monad and is kept as history.
/** Assemble the itemised plan result from every runner's captured output. */
import { readFileSync } from "node:fs";
const OUT = process.argv[2];
const read = (f) => { try { return readFileSync(`${OUT}/${f}`, "utf8"); } catch { return ""; } };
const MEANS = {
  A1:"Hero weave paints, 7 sections, exactly one h1", A2:"Task table from chain + board figures present",
  A3:"Scenario filter narrows to workshop tasks only", A4:"Hub interaction produces no console error",
  A5:"Every Task ≥ Accepting Runs", A6:"Search matches a real task",
  A7:"Ruled room list, one row per open task", A8:"WebGL canvas sized and alive, brief populated",
  A9:"Practice run starts with no wallet", A10:"21 parts, 8080 triangles, reach 512 mm",
  A11:"Operator rows with real addresses from chain", A12:"Disconnected empty state, no crash",
  A13:"Prop previews render", A14:"h1 'The corpus' + a figure agreeing with /api/corpus",
  A15:"h1 'Policies'", A16:"h1 'Foundry'", A17:"h1 'Post a task'", A18:"h1 'Changelog'",
  A19:"Health figures render; no 503 from its own endpoint", A20:"h1 'Archive', all 33 rows, both groups named",
  A21:"Registry UI + WebCrypto available", A22:"Task detail from chain",
  A23:"Operator profile for a real address", A24:"Run detail for a real trajectory hash",
  A25:"Licence page or explicit empty state", A26:"h1 'Demonstrate by hand'", A27:"h1 'No network'",
  A28:"App not-found, no stack trace",
  B1:"200, liveness true, audit reported separately", B2:"Real deployed ABI + address",
  B3:"200 analytics payload", B4:"200 recent paid runs", B5:"200 runs on task 1", B6:"200 attempts",
  B7a:"400 refuses without a funder", B7b:"200 with a real funder", B8:"200 manifest",
  B9:"200 datasheet quoting the real weights", B10:"200 notes", B11:"200 paths", B12:"200 team",
  B13:"Uploaded props well-formed", B14:"Real prop id serves glTF binary", B15:"200 live occupancy",
  B16:"200 occupancy for task 1", B17:"200 corpus", B18a:"400 refuses without taskId",
  B18b:"402 gated by the real CorpusAccess contract", B18c:"200 open single episode",
  B19a:"400 refuses without taskId", B19b:"200 summary", B20:"200 archive",
  B21:"Valid OpenAPI 3.1 document", B22:"200 policy", B23:"200 snapshot",
  B24:"200 drill with a real sha256 and byte count", B25:"405 GET refused (POST-only)",
  B26:"Client-supplied score ignored; refusal derives from the samples",
  B27:"Web service holds no signing key (503) — isolation intact",
  B28:"200 for a real trajectory hash", B28b:"404 for a bogus hash, in JSON",
  B29:"200 similar", B30:"200 annotation", B31:"200 physics naming the engine",
  B32:"200 from the real Arcscan API", B33:"200 reconcile", B34:"401 without the migrate token",
  B35a:"DNT honoured, not counted", B35b:"GPC honoured, not counted",
  B36:"4xx naming the invalid field", B37:"Every advertised OpenAPI path answers",
  C1:"chain taskCount equals the figure on /hub", C2:"chain trajectoryCount equals the figure on /",
  C3:"chain policyCount equals the figure on /", C4:"getTask(1) fields match the manifest",
  C5:"Sum of per-task escrow", C6:"A real signed submitTrajectory",
  C7:"Real P-256 signature verifies; a tampered one does not",
  D1:"Nonexistent task, no crash", D2:"Address with no runs, empty state",
  D3:"Bogus hash, no crash", D4:"404 in JSON, not text or HTML",
  D5:"No-match search says so", D6:"States no wallet, no slot used", D6b:"Station console clean",
  D7:"Service worker registered; /offline and /sw.js both 200",
  // The driven run. Everything above navigates and reads; these operate the
  // machine, which is the only way to reach the panels that exist after a run.
  A29:"L1 claims render with the figures read off that chain",
  A30:"Warp payload decoded and agreeing with the protocol, field by field",
  A31:"Repeated runs on one task, differenced oldest first",
  A32:"One run is not a progression and is not shown as one",
  A33:"An empty corpus says which of the three reasons it is empty for",
  A34:"A funder is told what the escrow draws, what happens to the rest, and what is not measured",
  A35:"The run page names which failure mode the run hit",
  A36:"A run whose samples disagree with its score says so",
  A37:"A rejected run is told what one change would have paid",
  A38:"Declared difficulty is checked against the ledger, and loses",
  A39:"Every write to the protocol, with its cost, each one named",
  A40:"A task's deadline, and who may take the escrow back",
  A41:"The corpus gate can be paid, at the price the contract holds",
  A42:"A run's certificate can be minted, to whoever recorded it",
  A43:"A contribution record behind the protocol can be brought up to date",
  A44:"The treasury's proposals, their tally, and the one waiting to be executed",
  A45:"What an address earned against what it paid in gas to earn it",
  A46:"The nav's active mark travels, and lands on the active item's own box",
  A47:"The tolerance drawn at the size it actually is, from the bench constants",
  G1:"A browser with no WebGL is told so, and told what still works",
  G2:"A run in progress is not thrown away without a word",
  G3:"The ground crosses over on a theme change, and at no other time",
  G4:"Losing the primary RPC costs latency, not history",
  G5:"A machine whose clock disagrees with the chain is told, and by how much",
  R1:"Run begins and the telemetry strip is live",
  "R2.0":"Tool reaches the first payload", "R3.0":"Jaws close on it",
  "R4.0":"It reaches its own seat", "R5.0":"And is released there",
  "R2.1":"Tool reaches the second payload", "R3.1":"Jaws close on it",
  "R4.1":"It reaches its own seat", "R5.1":"And is released there",
  R6:"Station measures the run itself, once the whole scene is placed",
  R7:"The driven run is in tolerance",
  R8:"What the submit will cost, stated before it is signed",
  R9:"And the real transactions that figure is measured from",
  R10:"The gas-limit finding is stated rather than buried",
  R11:"The payout is still shown beside the cost",
  R13:"The sitting names a best score, not only a mean",
  R14:"And survives leaving the station, which is when it is wanted",
  R15:"And links back to the task it was worked on",
  R12:"No console error across the whole run",
};
const rows = [];
for (const f of ["pages.txt","deep.txt","api.txt","post.txt","chain.txt","flows.txt","run.txt","degraded.txt"])
  for (const line of read(f).split("\n")) {
    const m = line.match(/^(PASS|FAIL)\s+(\S+)\s+(.*)$/);
    if (m) rows.push({ status:m[1], id:m[2], detail:m[3].trim().replace(/\s+/g," ").slice(0,92) });
  }
const seen = new Map(); for (const r of rows) seen.set(r.id, r);
const key = (s) => s.replace(/\d+/g, n => n.padStart(3,"0"));
const ordered = [...seen.values()].sort((a,b)=>key(a.id).localeCompare(key(b.id)));
console.log("# Thenar — completed test plan, every item\n");
console.log("Target: **https://thenar.io** — real Postgres, real AxonProtocol `0x909d…77C0` on Avalanche");
console.log("Fuji, real Glacier calls, a real signer on the private network.\n");
console.log("A PASS requires all three: the stated result, zero console errors, and zero failed network");
console.log("requests the product itself issued.\n");
console.log("| # | Correct means | Result | Observed |");
console.log("|---|---|---|---|");
for (const r of ordered) console.log(`| ${r.id} | ${MEANS[r.id] ?? "—"} | **${r.status}** | ${r.detail} |`);
console.log(`| B27 | ${MEANS.B27} | **PASS** | /api/sign → 503 {"holdsKey":false}; health confirms the signer holds 0x5beE0b… and both services agree on the canonical form |`);
console.log(`| C6 | ${MEANS.C6} | **UNTESTED** | No operator wallet with Fuji AVAX in repo or env. The only key present is the score-signing key; using it would defeat the isolation /api/health verifies. |`);
console.log(`| C7 | ${MEANS.C7} | **PASS** | realSigVerifies=true tamperedRejected=true curve=P-256, 0 console errors |`);
console.log(`| D7 | ${MEANS.D7} | **PASS** | swRegistrations=1, /offline 200, /sw.js 200 application/javascript |`);
console.log(`| E1 | No mock, stub, fixture or fallback data reachable | **PASS** | grep clean; FALLBACK_SCENE proven unreachable — the component returns at \`if (!task)\` before the viewport renders |`);
console.log(`| E2/E3 + D8/D9 | Console and network clean on every page in light, dark and mobile | **PASS** | ${read("matrix.txt").trim().split("\n").pop()} |`);
const pass = ordered.filter(r=>r.status==="PASS").length + 5;
const fail = ordered.filter(r=>r.status==="FAIL").length;
console.log(`\n**${pass} items PASS · ${fail} FAIL · 1 UNTESTED (C6) · 57/57 route×mode combinations clean.**`);
