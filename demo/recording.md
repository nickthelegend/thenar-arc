# Thenar demo — recording plan

Blockchain app: yes. Arc Testnet (runs, bounties, payouts in USDC), Hedera
testnet (x402 sales, Consensus Service log, Asset Tokenization Studio
security), World Chain (AgentBook, read only), World ID (Selfie Check gate).

No browser wallet signs in this take. Every transaction is signed by a key that
already exists for it on testnet: the Privy server wallet (lab budget, signed
inside Privy), the agent's Hedera key (`AGENT_PRIVATE_KEY`, x402), and the ATS
issuer key (`HEDERA_ATS_ISSUER_KEY`). None of them holds mainnet funds. A
human-signed station submission is not recorded: it needs a Selfie Check on a
phone, which cannot be produced here. The World gate is shown by a real refusal
captured during the take (beat e3).

Server: the production build on `http://localhost:3222`. Browser: Playwright
Chromium, headed, fresh profile, viewport `DEMO_W`x`DEMO_H` (1440x810), video
cropped to the viewport during capture.

| # | id | What is shown | Signing beat |
| --- | --- | --- | --- |
| 1 | b01-landing | Landing page with the moving arm | |
| 2 | b02-hub | Hub: open tasks, escrow in USDC | |
| 3 | b03-station | Station: policy drives a practice run | |
| 4 | b04-verdict | End run: measured verdict | |
| 5 | b05-lab | Lab: Privy wallet and its policy | |
| 6 | b06-lab-sign | Post a 0.01 USDC bounty; overlay until the Arc receipt is status 1 | **yes (Arc)** |
| 7 | b07-arcscan | That transaction on Arcscan | |
| 8 | b08-lab-refuse | Same wallet asked to send elsewhere: Privy refuses | |
| 9 | b09-agents | Agents page: 402 terms, treasury 0.0.10518776, topic 0.0.10519262 | |
| 10 | b10-agentbook | AgentBook lookup of the agent wallet | |
| 11 | b11-x402-sign | Agent buys task 1's corpus; overlay until the mirror node reports SUCCESS; new row on /agents | **yes (Hedera)** |
| 12 | b12-hashscan-x402 | That settlement on HashScan | |
| 13 | b13-hashscan-topic | The sales topic on HashScan | |
| 14 | b14-corpus-token | The ATS security on /corpus-token | |
| 15 | b15-ats-sign | Issue 10 reserve shares; overlay until the mirror node reports SUCCESS; supply +10 | **yes (Hedera ATS)** |
| 16 | b16-hashscan-ats | That issuance on HashScan | |
| 17 | b17-lookup | Holder lookup: agent wallet refused, AccountIsBlocked | |
| 18 | b18-contracts | The ten Arc contracts | |
| 19 | b19-status | Live status checks | |

Post-production scenes, with narration, drawn from the take file:
`intro`, `e1-path` (after b13), `e2-receipts` (after b17, the take's three
transaction ids), `e3-world` (after e2, the take's real 403 refusal), `outro`.
