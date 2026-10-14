# LEAD: RUN THESE

From `/Volumes/Extreme SSD/Projects/arc/thenar-arc`, outside the Codex sandbox:

```bash
npm run build
npm run seed:proof
npm run e2e:browser:thenar
npm run e2e:browser:thenar -- --flow
```

If Chromium is not installed: `npx playwright install chromium`.
The script starts one production server on **9011**, prints its PID, and stops only that process in `finally`.
It refuses an occupied 9011. To use an existing server or Vercel: prefix each browser command with
`BASE=https://YOUR-VERIFIED-VERCEL-ORIGIN` (or `BASE=http://localhost:9011`). Never point it at mainnet or a fork.
The RPC and deployment are checked before funding. For Vercel, configure a remote Postgres database and the
server role keys first. The local `.env.local` database is **localhost**, in the separate `thenar_arc_testnet`
schema; it cannot be copied to Vercel as a usable remote URL.

## What these commands prove

**Screens:** automatically enumerates every page route, all product pages, representative task/run/operator/
licence routes, the intentionally unavailable fork-only explorer routes, plus a missing route. Visits at 1440×900 and 390×844. Checks page errors, console
errors, broken images, horizontal overflow, stale-chain copy, and explorer domains. Full-page screenshots
and a JSON PASS/FAIL manifest go to `docs/screens/testnet/round-2/`. Review the images visually; layout
assertions do not establish aesthetic quality. Empty policy and archive screens must be judged as empty states.

**Flow:** all core mutations are initiated through browser controls. Three isolated browser contexts represent
sponsor, operator and buyer. No injected trajectories, mocked RPC responses or server-only payout shortcut.

1. Save fresh throwaway keys to gitignored `.data/browser-round2-wallets.json` (0600), then fund **0.63 test USDC
   total** under the shared deployer lock. Sponsor 0.40, operator 0.20, buyer 0.03; transaction gas and backend
   role-key gas have headroom below the 1-USDC budget. No new funds are sent by this round until `--flow` runs.
2. Discover Create a task from `/hub`; approve 0.05 USDC and create one funded THENAR-6 slot through `/post`.
3. Register a browser WebAuthn passkey and admit the operator on chain. Chromium's **virtual authenticator**
   is automation of the ceremony, not proof of biometric or human presence. No admission bypass is added.
4. Drive the real station with keyboard input, grasp, lift, transfer and release. Submit through the real
   verifier and wallet. Check `TrajectoryAccepted`, escrow reduction, reward display, explorer link and the
   operator's net USDC balance after gas. Capture desktop and mobile payout receipts.
5. A separate browser buyer signs the same x402 EIP-3009 payment an agent signs. Verify the downloaded corpus
   contains the run, exactly 0.01 USDC left the buyer, and its SHA-256 matches `SalesLog.getSale`. This proves
   the browser payment protocol, **not an autonomous AI purchase decision or registered ERC-8004 buyer**.
6. Sponsor closes the filled task and reclaims the scoring remainder through the task page. Every new tx
   printed as an explorer link. Sweep remaining wallet funds back to the deployer, even if the flow fails.

## Recovery and limits

```bash
npm run e2e:browser:thenar -- --sweep
```

Saved keys are retained for recovery and never printed. Tiny gas dust can remain; sweep reports it. If the
run failed before filling the task, escrow stays in the contract until its seven-day deadline; the sponsor's
saved key can reclaim it then. `.data/browser-round2-task.json` records the task id. Keep the keys file until
all escrow is recovered. Archive that gitignored file before deliberately funding a second proof; the script
refuses to fund again while it exists. A SIGKILL or power loss can interrupt cleanup; use the printed PID and
`--sweep`. Never use a broad process kill.

The issuer and facilitator keys in the app need small existing testnet gas balances and must match their
contracts. Browser checks exit 1 on failure. Read-only screen checks do not spend funds. API and contract
checks from this session are recorded in `JUDGE-REPORT.md`; **browser round 2 is Not run** until results arrive.
