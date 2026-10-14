# Vercel — Live (testnet)

LEAD: RUN THESE
```sh
node scripts/e2e-browser-hosted.mjs
node --env-file=.env.local --conditions=react-server --import ./test/register.mjs scripts/check-hosted-storage.mjs
```

URL: https://thenar-arc.vercel.app. Deployed from this checkout with `vercel deploy --prod --yes`.
The Next.js frontend and HTTP APIs run as Vercel functions. Contract addresses come from `deployments/arc-testnet.json`.
The existing Atlas cluster is reused in `arc_thenar_testnet`; no database service was provisioned.

**Checks:** Vercel build and local typecheck pass; lint has zero errors and nine existing warnings.
The real Atlas integration check preserves eight concurrent increments, survives reconnect, and rejects mutating read queries.
Both proof recordings were seeded only after their successful Arc testnet receipts were rechecked.
Expanded production rerun: all 24 routes returned HTTP 200; eight routes logged backend resource errors. Wallet-free practice starts, testnet bytecode is present, and mobile fits 390 px.
Atlas works locally; Vercel runtime logs show TLS alert 80 / server selection failures. Check Atlas Network Access for Vercel before calling the backend healthy.
The live contract/RPC health checks pass. Browser screenshots and exact failures are in `docs/screens/hosted/results.json`.
The rerun retains failed health/feed checks and console errors. It continues after an API failure so the later practice, contract and viewport evidence is not lost.

**Services:** no required always-on server. The hardware serial/WebSocket arm relay belongs on the operator's computer.
The optional audit/CCIP completion keeper remains an on-demand command; new on-chain actions were not run during hosting.
A scheduled `/api/reconcile` function already exists for receipt reconciliation; configure `CRON_SECRET` before scheduling it.

**Environment:** `NEXT_PUBLIC_ARC_NETWORK=testnet`, `NEXT_PUBLIC_ARC_RPC`, `PUBLIC_ORIGIN`, `NEXT_PUBLIC_SITE_ORIGIN`,
`MONGODB_URI`, `MONGODB_DB=arc_thenar_testnet`, `VERIFIER_PRIVATE_KEY`, `VERIFIER_ADDRESS`,
`CORPUS_ISSUER_PRIVATE_KEY`, `AUDITOR_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `X402_FACILITATOR_PRIVATE_KEY`,
`PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID`. Values were passed to `vercel env add` on stdin.
Allow https://thenar-arc.vercel.app in Privy. No wallet transaction was sent by this smoke check.

The Atlas SQL snapshot adapter is a small-demo bridge: optimistic version checks prevent lost updates, but the whole corpus is capped at 12 MiB.
For larger corpora, configure remote Postgres `DATABASE_URL` with `DATABASE_SCHEMA=arc_thenar_testnet`.
Distributed rate limits and concurrent signer nonce coordination remain production hardening work.
