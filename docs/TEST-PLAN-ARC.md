# Test plan — Thenar on Arc, ETHOnline 2026

Every component and flow this deployment claims, what "correct" means for each,
and the result of running it for real on 13 September 2026: against the
production build (`next build`, `next start`) on `http://localhost:3222`, in
Chrome with the console open, against Arc Testnet, Hedera testnet and World.

**PASS** means the result matched the expected result exactly, with no console
or network error. **UNTESTED** means it needs something that does not exist in
this environment, and says what. Nothing is marked PASS on the strength of the
code alone.

## A. Infrastructure

| # | Item | Correct means | Result |
| --- | --- | --- | --- |
| A1 | Arc contracts | All ten registry addresses return bytecode on chain 5042002 | PASS — AxonProtocolV2 15,181 bytes … PasskeyRegistry 1,814 bytes |
| A2 | Source verification | Sourcify `exact_match` for all ten; Arcscan shows the source | PASS — 10/10 on both |
| A3 | Database | SQLite on disk (`.data/axon.db`), survives restarts, `/api/health` database ok, ledger equals chain | PASS — 5 stored, 5 on chain, across four restarts |
| A4 | Verifier | Server key and EIP-712 signing domain match the contract | PASS — `/api/health` verifierMatches, signingDomain |
| A5 | CorpusManifest | Each task's corpus root committed on chain and equal to the root computed from stored runs | PASS — tasks 1 and 2, `matches: true` (fixed: env missing, script on Fuji, verifier unfunded) |
| A6 | Build and static checks | `next build` exit 0; `tsc` 0 errors; `eslint` 0 errors | PASS (fixed: three lint errors — a clock read during render in the treasury, state set synchronously in two effects) |
| A7 | Unit tests | `npm run test:unit` all pass | PASS — 86/86 |
| A8 | End-to-end suite | `node test/e2e.mjs` against this deployment, every check passes | PASS — 68/68; two checks reported not applicable with the reason (single-process signer; no current CorpusAccess subscriber). Fixed: the suite still targeted thenar.io and Avalanche Fuji |
| A9 | Corpus snapshot to object storage | Snapshot stored in the bucket; drill restores it intact | UNTESTED — no bucket credentials exist; the routes answer the documented 502 / 503 |

## B. Pages

Correct means: the page's own title and heading render with real content, and
the console shows no error or exception.

| # | Page | Result |
| --- | --- | --- |
| B1 | `/` (landing, hero arm video) | PASS |
| B2 | `/hub` | PASS |
| B3 | `/agents` | PASS |
| B4 | `/lab` | PASS |
| B5 | `/corpus-token` | PASS |
| B6 | `/corpus` | PASS |
| B7 | `/contracts` | PASS |
| B8 | `/leaderboard` | PASS |
| B9 | `/portfolio` | PASS |
| B10 | `/foundry` | PASS |
| B11 | `/post` | PASS |
| B12 | `/policies` | PASS |
| B13 | `/passkey` | PASS |
| B14 | `/spec` | PASS |
| B15 | `/status` (7/7 checks) | PASS |
| B16 | `/space` | PASS |
| B17 | `/handheld` | PASS |
| B18 | `/archive` | PASS |
| B19 | `/changelog` (generated from git) | PASS |
| B20 | `/inventory` | PASS |
| B21 | `/offline` | PASS |
| B22 | `/task/1` | PASS |
| B23 | `/run/<hash>` | PASS |
| B24 | `/station/1` (3D workspace renders) | PASS |
| B25 | `/operator/<address>` | PASS |
| B26 | `/licence/0` ("not minted") | PASS |
| B27 | Unknown URL → 404 page, title "Not found — Thenar" | PASS (fixed: the Coinbase/Base Account SDK probed each page's URL and logged an error on the 404; it is no longer in Privy's wallet list) |

## C. API

| # | Item | Correct means | Result |
| --- | --- | --- | --- |
| C1 | Input handling on every route | 102 requests of valid, empty and malformed input: 2xx for valid, readable JSON 4xx for invalid, no 5xx, no stack traces | PASS — 0 flagged (fixed: `/api/sign` and `/api/verify` 500 on non-JSON; corpus paywall offered a bad task id) |
| C2 | OpenAPI matches the API | Every documented path answers a documented status | PASS (fixed: `/api/snapshot` 502 and 401 were undocumented; the server URL named thenar.io; the drill answered 500 for an unconfigured bucket, now 503) |
| C3 | Security headers and CORS | CSP, nosniff, referrer and frame headers present; reads open cross-origin; writes not | PASS |
| C4 | Forged note | A note posted under an address the caller does not hold is refused 401 | PASS |

## D. Arc: recording and paying a run

| # | Flow | Correct means | Result |
| --- | --- | --- | --- |
| D1 | Practice run driven by the policy | Begin → the arm moves → End run → "Measurement taken…" with score; nothing saved as an unsent run; the practice reason is the real one | PASS (fixed: practice runs were offered back for submission; wrong reason text) |
| D2 | Run from an operator with no World ID | `/api/verify` answers 403 "Prove you are a live human with World ID before contributing"; nothing signed, funded or sent | PASS — `scripts/arc-run.mjs` |
| D3 | Paid runs on chain | Each run's payout is in the transaction that records it; feed transactions resolve on Arc; stored samples re-hash to the recorded value | PASS — 5 runs |
| D4 | Leaving mid-run | Navigation is held by a "Leave site?" prompt while a run is in progress | PASS |
| D5 | A human-driven paid run from the station | Operator wallet on Arc, Selfie Check passed, run signed, submitted, paid | UNTESTED — needs the operator's own wallet and phone |

## E. Hedera

| # | Flow | Correct means | Result |
| --- | --- | --- | --- |
| E1 | The corpus security | THNRC at 0.0.10520394: supply 1000, whitelist 1, dividends 1, shown live on `/corpus-token` | PASS |
| E2 | Compliance lookups | Issuer: "On the whitelist · 1000 shares… would accept"; agent wallet: "refuses a share… AccountIsBlocked"; malformed address: hint shown, nothing sent; Enter submits | PASS (fixed: no hint, no form) |
| E3 | x402 paid pull | 402 offer → 0.5 HBAR settled by Blocky402 → corpus returned → row on `/agents` with its Hashscan link | PASS — `0.0.7162784@1789296779.408785255` |
| E4 | Sales log | sha256 of the served file posted to topic 0.0.10519262; the buyer's own hash matches the mirror node | PASS — message #3 |
| E5 | Shares issued for a paid run | A settled run by a whitelisted human issues shares | UNTESTED — needs D5 |
| E6 | Whitelist admission after Selfie Check | A verified human's address is added to the control list | UNTESTED — needs F2 |

## F. World

| # | Flow | Correct means | Result |
| --- | --- | --- | --- |
| F1 | AgentKit on the paywall | The 402 carries the challenge; the agent signs; AgentBook answers; an unregistered agent pays | PASS |
| F2 | Selfie Check proof | World App proof accepted by `/api/world/verify` and bound to the wallet | UNTESTED — needs the phone with World App; the action allows one verification per person, so it is not spent on a test |
| F3 | Human lookup | `/agents`: malformed address refused with a readable message and no request; valid address answered from AgentBook | PASS |
| F4 | Free pulls for a human-backed agent | Registered agent receives the corpus without paying | UNTESTED — the agent wallet must be registered through World App |

## G. Privy

| # | Flow | Correct means | Result |
| --- | --- | --- | --- |
| G1 | Bounty from the lab budget | Privy signs, Arc confirms, the task appears; a double click posts once | PASS — task #7, `0x5ef56687…2e3f8c` |
| G2 | Policy refusal | "Refused by Privy's policy engine. policy_violation… Nothing was signed." | PASS |
| G3 | Sign-in modal | Connect opens Privy with email and wallet options, no console error | PASS — "Log in or sign up", email field, "Continue with a wallet"; an existing extension wallet in Chrome still reconnects |
| G4 | Email sign-in completes | One-time code accepted, embedded wallet created on Arc | UNTESTED — needs an inbox |

## H. Cross-cutting

| # | Item | Correct means | Result |
| --- | --- | --- | --- |
| H1 | No mocks | No mock, stub, fake, dummy, TODO or placeholder data in `app`, `components`, `lib`, `scripts`, `contracts` | PASS — the 13 grep hits are input `placeholder` attributes and one comment |
| H2 | Phone width | No horizontal overflow at 375 px on the landing, hub, station, lab, agents, corpus-token, contracts, operator, portfolio, task and leaderboard pages | PASS (fixed: lab address, station brief) |
| H3 | Themes | Landing, hub and station legible in light and dark; the hero video transparent in both | PASS |
| H4 | Server unreachable | A loaded page says "Could not reach Thenar's server…", never a raw TypeError | PASS — `/agents` with the server stopped (fixed: three pages printed "TypeError: Failed to fetch") |
| H5 | Server down, uncached page | The service worker answers "Thenar's server did not answer", not "No network" | PASS — `/corpus?never-cached=1` with the server stopped |

## I. Submission

| # | Item | Result |
| --- | --- | --- |
| I1 | README and SUBMISSION.md match the live state | PASS |
| I2 | Demo video | UNTESTED — to record |
| I3 | Hosted deployment | UNTESTED — hosting costs money and needs the keys uploaded; runs locally |
