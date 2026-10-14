# Five-minute Arc mainnet film

Run `node scripts/e2e-browser-video-thenar-5min.mjs` from this repository. The audit is read-only: successful receipts, exact gas fees and blocks, hosted landing page, and explorer logs. It does not recreate the paid flow.

Artifacts in the shared Arc workspace: `../video/out/thenar-5min.mp4`, `../video/out/thenar-5min.json`, `../video/out/thenar-5min-script.json`, `../video/out/thenar-5min-REVIEW.md`. Video binaries and raw recordings remain outside the repository.

Final render: 2026-10-14T18:57:50.014Z. Post-render RPC check: 15/15 successful, exact fees, at 2026-10-14T18:58:25.597Z.

- Live: sponsor creates/funds task, operator admission/session, 377-frame keyboard robot simulation, signed verification, 0.043865 USDC payout.
- Agent paid 0.01 USDC over x402 for the corpus; replay displayed Integrity verified. Score 87.73; run duration roughly 33 seconds.
- All 15 original mainnet session receipts retained, including funding and cleanup. No new broadcasts in this re-cut.
- Hosted frontend used a local SQLite API fallback; integrity replay used the local app against the same mainnet contracts.
- Fresh explorer overview/decoded-event recordings plus protocol and ERC-8004 verifier registry contract pages (agent 2427).
- Weak: durable hosted persistence and independent verification. This was a browser simulation with an in-process development verifier, not a physical robot.
- Existing mainnet browser audit images, including observed hosted errors, were preserved separately; landing-page audit is not a full hosted backend health claim.

300 seconds, 1080p30, captions and instrumental bed. No voice or paid API calls in this job. Timed narration is reserved for a separate local Chatterbox pass.
