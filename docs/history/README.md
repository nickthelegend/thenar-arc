# Earlier test passes

Four test plans, in the order they were written, each recording a real pass over
the product at the time. They are kept because they are evidence of what was
checked and when, and superseded because the surface has changed since.

| File | Covered |
|---|---|
| `TESTPLAN.md` | v1 — 60 items: every page, route, on-chain call |
| `TESTPLAN-V2.md` | v2 — the surface v1 did not reach |
| `TESTPLAN-V3.md` | v3 — full surface, Vercel proxying `/api/*` to Railway |
| `TESTPLAN-V4.md` | v4 — full surface, second pass, against `0x909d…77C0` |

**The current plan and its results are `docs/TESTPLAN.md` and
`docs/TEST-RESULTS.md`.** Those are generated from the runners in `scripts/qa-*.mjs`
rather than maintained by hand.
