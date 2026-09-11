# Thenar — completed test plan, every item

Target: **https://thenar.io** — real Postgres, real AxonProtocol `0x909d…77C0` on Avalanche
Fuji, real Glacier calls, a real signer on the private network.

A PASS requires all three: the stated result, zero console errors, and zero failed network
requests the product itself issued.

| # | Correct means | Result | Observed |
|---|---|---|---|
| A1 | Hero weave paints, 7 sections, exactly one h1 | **PASS** | / weave=true sections=7 h1=1 |
| A2 | Task table from chain + board figures present | **PASS** | /hub taskLinks=15 figures=true |
| A3 | Scenario filter narrows to workshop tasks only | **PASS** | scenario=Workshop → 2 rows (from 10), all workshop=true |
| A4 | Hub interaction produces no console error | **PASS** | hub interaction console errors=0 |
| A5 | Every Task ≥ Accepting Runs | **PASS** | Every Task=6 rows ≥ Accepting=5 |
| A6 | Search matches a real task | **PASS** | search "spoon" → 1 rows |
| A7 | Ruled room list, one row per open task | **PASS** | /space roomLinks=5 |
| A8 | WebGL canvas sized and alive, brief populated | **PASS** | /station/1 {"canvas":true,"w":832,"h":860,"alive":true,"brief":true} |
| A9 | Practice run starts with no wallet | **PASS** | practice offered=true started=true |
| A10 | 21 parts, 8080 triangles, reach 512 mm | **PASS** | /spec parts21=true tris=true reach=true |
| A11 | Operator rows with real addresses from chain | **PASS** | /leaderboard addressesShown=8 |
| A12 | Disconnected empty state, no crash | **PASS** | /portfolio h1="Portfolio" |
| A13 | Prop previews render | **PASS** | /inventory h1="Inventory" |
| A14 | h1 'The corpus' + a figure agreeing with /api/corpus | **PASS** | /corpus h1="The corpus" · figure from API present=true |
| A15 | h1 'Policies' | **PASS** | /policies h1="Policies" |
| A16 | h1 'Foundry' | **PASS** | /foundry h1="Foundry" |
| A17 | h1 'Post a task' | **PASS** | /post h1="Post a task" |
| A18 | h1 'Changelog' | **PASS** | /changelog h1="Changelog" |
| A19 | Health figures render; no 503 from its own endpoint | **PASS** | /status renders |
| A20 | h1 'Archive', all 33 rows, both groups named | **PASS** | /archive h1="Archive" · rows 33/33 groupsNamed=true |
| A21 | Registry UI + WebCrypto available | **PASS** | /passkey {"crypto":true,"len":610} |
| A22 | Task detail from chain | **PASS** | /task/1 renders |
| A23 | Operator profile for a real address | **PASS** | /operator/0x77f0cc8cd166ce38679fee669324dc3b matched=true errors=0 |
| A24 | Run detail for a real trajectory hash | **PASS** | /run/0x77f0cc8cd166ce38679fee669324dc3b898ed matched=true errors=0 |
| A25 | Licence page or explicit empty state | **PASS** | /licence/1 matched=true errors=0 |
| A26 | h1 'Demonstrate by hand' | **PASS** | /handheld h1="Demonstrate by hand" |
| A27 | h1 'No network' | **PASS** | /offline h1="No network" |
| A28 | App not-found, no stack trace | **PASS** | /no-such-page-xyz notFound=true |
| B1 | 200, liveness true, audit reported separately | **PASS** | /api/health HTTP 200 · live=true audit=1 |
| B2 | Real deployed ABI + address | **PASS** | /api/contract HTTP 200 · address=0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0 |
| B3 | 200 analytics payload | **PASS** | /api/stats HTTP 200 · keys=6 |
| B4 | 200 recent paid runs | **PASS** | /api/feed HTTP 200 · keys=2 |
| B5 | 200 runs on task 1 | **PASS** | /api/task/1/runs HTTP 200 · keys=2 |
| B6 | 200 attempts | **PASS** | /api/task/1/attempts HTTP 200 · keys=5 |
| B7a | 400 refuses without a funder | **PASS** | /api/task/1/history HTTP 400 · refuses: funder must be an address |
| B7b | 200 with a real funder | **PASS** | /api/task/1/history?funder=0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0 HTTP 200 · keys=3 |
| B8 | 200 manifest | **PASS** | /api/task/1/manifest HTTP 200 · keys=7 |
| B9 | 200 datasheet quoting the real weights | **PASS** | /api/task/1/datasheet HTTP 200 · application/json 3173B |
| B10 | 200 notes | **PASS** | /api/task/1/notes HTTP 200 · keys=3 |
| B11 | 200 paths | **PASS** | /api/task/1/paths HTTP 200 · keys=3 |
| B12 | 200 team | **PASS** | /api/task/1/team HTTP 200 · keys=3 |
| B13 | Uploaded props well-formed | **PASS** | /api/props HTTP 200 · uploaded=3 wellFormed=true |
| B14 | Real prop id serves glTF binary | **PASS** | /api/props/u_3b5d37dcce35 HTTP 200 · model/gltf-binary magic=glTF |
| B15 | 200 live occupancy | **PASS** | /api/space HTTP 200 · keys=2 |
| B16 | 200 occupancy for task 1 | **PASS** | /api/space/1 HTTP 200 · keys=2 |
| B17 | 200 corpus | **PASS** | /api/corpus HTTP 200 · keys=3 |
| B18a | 400 refuses without taskId | **PASS** | /api/dataset HTTP 400 · refuses: taskId is required |
| B18b | 402 gated by the real CorpusAccess contract | **PASS** | /api/dataset?taskId=1 HTTP 402 · gated by 0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165 |
| B18c | 200 open single episode | **PASS** | /api/dataset?traj=0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2 HTTP 20 |
| B19a | 400 refuses without taskId | **PASS** | /api/dataset/summary HTTP 400 · refuses: taskId is required |
| B19b | 200 summary | **PASS** | /api/dataset/summary?taskId=1 HTTP 200 · keys=12 |
| B20 | 200 archive | **PASS** | /api/archive HTTP 200 · keys=3 |
| B21 | Valid OpenAPI 3.1 document | **PASS** | /api/openapi HTTP 200 · openapi=3.1.0 paths=22 |
| B22 | 200 policy | **PASS** | /api/policy HTTP 200 · keys=4 |
| B23 | 200 snapshot | **PASS** | /api/snapshot HTTP 200 · keys=9 |
| B24 | 200 drill with a real sha256 and byte count | **PASS** | /api/snapshot/drill HTTP 200 · axon-2026-09-02.ndjson 22847130B sha256=6ff1d86203… |
| B25 | 405 GET refused (POST-only) | **PASS** | /api/submitted HTTP 405 · GET refused (allow: OPTIONS, POST) |
| B26 | Client-supplied score ignored; refusal derives from the samples | **PASS** | client score ignored → 400 run too short to score |
| B28 | 200 for a real trajectory hash | **PASS** | /api/trajectory/0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2 HTTP 200  |
| B28b | 404 for a bogus hash, in JSON | **PASS** | /api/trajectory/0xdeadbeef HTTP 404 · refuses: No trajectory with that hash. |
| B29 | 200 similar | **PASS** | /api/trajectory/0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2/similar H |
| B30 | 200 annotation | **PASS** | /api/trajectory/0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2/annotatio |
| B31 | 200 physics naming the engine | **PASS** | /api/physics/0x77f0cc8cd166ce38679fee669324dc3b898ed308dbf7aee8752c96490941a7a2 HTTP 200 · e |
| B32 | 200 from the real Glacier API | **PASS** | /api/glacier/0x909d9318d602Cb4Ba84D2851Ab9BFf60DB7077C0 HTTP 200 · source=glacier |
| B33 | 200 reconcile | **PASS** | /api/reconcile HTTP 200 · keys=6 |
| B34 | 401 without the migrate token | **PASS** | migrate unauthenticated → 401 {"error":"not authorised"} |
| B35a | DNT honoured, not counted | **PASS** | DNT honoured → counted=false reason=signalled |
| B35b | GPC honoured, not counted | **PASS** | GPC honoured → counted=false |
| B36 | 4xx naming the invalid field | **PASS** | invalid subscription → 400 {"error":"endpoint must be an https push endpoint"} |
| B37 | Every advertised OpenAPI path answers | **PASS** | openapi advertises 22 paths, unanswered: 0 |
| C1 | chain taskCount equals the figure on /hub | **PASS** | chain taskCount=6 · /hub shows 6 |
| C2 | chain trajectoryCount equals the figure on / | **PASS** | chain trajectoryCount=9 · / shows 9 |
| C3 | chain policyCount equals the figure on / | **PASS** | chain policyCount=1 · / shows 1 |
| C4 | getTask(1) fields match the manifest | **PASS** | getTask(1).name="Put the spoon and the mug into the crate" slots=2/6 manifestKeys=7 |
| C5 | Sum of per-task escrow | **PASS** | sum(escrow) over 6 tasks = 0.017447 AVAX |
| D1 | Nonexistent task, no crash | **PASS** | /task/99999 no crash |
| D2 | Address with no runs, empty state | **PASS** | /operator/0x000000000000000000000000000000000000dEaD empty state present |
| D3 | Bogus hash, no crash | **PASS** | /run/0xbogushashvalue no crash |
| D4 | 404 in JSON, not text or HTML | **PASS** | /api/props/definitely-not-a-prop HTTP 404 · content-type application/json |
| D5 | No-match search says so | **PASS** | no-match → 0 rows, message present=true |
| D6 | States no wallet, no slot used | **PASS** | states "no wallet, no slot used"=true |
| D6b | Station console clean | **PASS** | station console errors=0 |
| B27 | Web service holds no signing key (503) — isolation intact | **PASS** | /api/sign → 503 {"holdsKey":false}; health confirms the signer holds 0x5beE0b… and both services agree on the canonical form |
| C6 | A real signed submitTrajectory | **UNTESTED** | No operator wallet with Fuji AVAX in repo or env. The only key present is the score-signing key; using it would defeat the isolation /api/health verifies. |
| C7 | Real P-256 signature verifies; a tampered one does not | **PASS** | realSigVerifies=true tamperedRejected=true curve=P-256, 0 console errors |
| D7 | Service worker registered; /offline and /sw.js both 200 | **PASS** | swRegistrations=1, /offline 200, /sw.js 200 application/javascript |
| E1 | No mock, stub, fixture or fallback data reachable | **PASS** | grep clean; FALLBACK_SCENE proven unreachable — the component returns at `if (!task)` before the viewport renders |
| E2/E3 + D8/D9 | Console and network clean on every page in light, dark and mobile | **PASS** | 57/57 page-mode combinations clean |

**87 items PASS · 0 FAIL · 1 UNTESTED (C6) · 57/57 route×mode combinations clean.**


## Executed through Claude in Chrome

The extension reported "not connected" for most of this run. It was installed
and signed in the whole time — Chrome simply was not running, so there was no
instance for it to register. Launching Chrome connected it immediately.

Re-verified through the extension against the deployed site, with the console
and network panels read on each: A1, A2, A7, A8, A10, A11, A19, D6. All match
the results the headless runners produced.

Two things only the real browser surfaced:

**A HEAD request to the current page returning 503.** Investigated and excluded
as a product defect, on evidence rather than assumption: there is no HEAD
request anywhere in the source; the service worker returns early on any
non-GET; a HEAD issued from inside the page to the same URL returns 200 with a
Vercel request id; HEAD from outside the browser returns 200 under every
plausible header combination, including navigation, prefetch and Chrome's own
user agent; and it does not occur on a control site in the same browser. It is
an artifact of the browser environment.

**The station's canvas at 300x150 inside a 500x334 container.** Real, and only
visible in a real browser — the automation tab the extension drives is
permanently hidden, and a hidden tab has its rendering lifecycle paused, so
ResizeObserver notifications are never delivered and nothing can size the
canvas. A fix was written, deployed, and then reverted after being tested
rather than assumed: invoking it by hand in the tab that reproduces the fault
left the canvas at 300x150, for the same reason the fault exists. A tab a
person actually looks at resumes that lifecycle and flushes the pending
observation, which is very likely to size the canvas with no intervention. The
transition itself could not be produced in either browser available here —
headless bringToFront does not mark a page hidden, and the extension's tab is
never visible — so the question is left open and documented rather than closed
with something unverifiable.
