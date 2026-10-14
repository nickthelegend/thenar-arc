# Mainnet video recording

The real browser flow completed on Arc mainnet (chain 5042): task 5 funded 0.05 USDC, an independently connected operator registered a passkey, keyboard controls drove a 32.9-second run, and score 87.73 paid 0.043865 USDC in the same Memo-tagged transaction. No samples or chain responses were injected. The arm is a kinematic simulator, not a physical robot demonstration.

A separate buyer paid 0.01 USDC through x402 and downloaded the 184,945-byte corpus. Its SHA-256 matches SalesLog sequence 1. Opening `/run/<payout transaction>` on the local mainnet app redirects to the trajectory and verifies its integrity. The hosted browser used a real local SQLite/API fallback because hosted Atlas access was unavailable. These notes do not claim hosted persistence or production authentication was verified; the browser wallets were real EIP-1193 signers operated by the recording harness.

Task 5's remaining 0.006135 USDC was reclaimed, all three demo wallets were swept, and task escrow is zero. Fifteen successful transactions used 0.037687918796888099 USDC in gas. Original service floats were preserved; residual controlled wallet dust remains.

Evidence: `docs/VIDEO-RECEIPTS.json`. Read-only verification: `node scripts/e2e-browser-video-thenar.mjs`. It checks every receipt/fee, the score/payout event, the corpus hash on SalesLog, empty task escrow, the hosted floor and explorer. The shared workspace also holds `../video/out/thenar.mp4`, its edit timeline and the purchased corpus.
