# ETHOnline 2026 submission: Thenar

Deadline: **Sunday 13 September 2026, 12:00 pm EDT.**

## What is entered

The entry is narrowed to two tracks:

| Partner | Track | What Thenar shows |
| --- | --- | --- |
| Hedera | Tokenization of Anything | The corpus is a security issued through the Asset Tokenization Studio, "Thenar Robot Corpus" (THNRC), whose holders are controlled by a whitelist |
| World | Selfie Check | A run is signed and paid only for a contributor who has passed a World ID Selfie Check, so one person cannot farm bounties from many wallets |

Privy is the wallet infrastructure, not a prize entry: operators sign in with
Privy, and a lab's budget is a Privy wallet that policy limits to funding
bounties. Arc is where runs are recorded and paid, in USDC.

**Eligibility — read this before submitting.** Thenar existed before ETHOnline
(Monad Blitz Hyderabad V3). ETHOnline's rules, as read at the start of the event,
let a pre-existing project win partner prizes only through a partner's
Continuity track, and neither Tokenization of Anything nor Selfie Check is one.
The same work also fits both partners' Continuity tracks, and every track from
one partner counts as a single partner prize, so select those as well:

- **Hedera Continuity:** the ATS issuance, the x402 paywall settled by Blocky402
  and the Consensus Service sales log are all Hedera services added after
  `e4f131d`.
- **World AgentKit Continuity:** AgentKit and AgentBook decide which agents pay
  for the corpus.

Confirm with ETHGlobal whether the non-Continuity tracks are open to this project
before relying on them.

---

## Hedera — Tokenization of Anything

| Requirement | Evidence |
| --- | --- |
| Use the Asset Tokenization Studio to issue or manage a tokenised asset | Issued through the ATS factory with `Factory.deployEquity` (factory `0.0.9213391`, resolver `0.0.9212226`): "Thenar Robot Corpus", THNRC, ISIN USTHNRCRP019, with a common dividend right. `scripts/ats-deploy.mjs` |
| Deploy and demonstrate on Hedera testnet | Security [`0.0.10520394`](https://hashscan.io/testnet/contract/0.0.10520394) (`0xDbf28C5C8cb5FA8960Bf413E6353B33066F20Fb7`). Issuance [`0x983b1e62…61fbcb3`](https://hashscan.io/testnet/transaction/0x983b1e62e8d32b59fe148e3676806d3c5252a0dfd5fab0e7d5a73de1161fbcb3): SUCCESS |
| Configuration | Whitelist control list on (`isWhiteList=true`): only listed addresses can hold. Issuer added to it in [`0x3ba258ab…63082bfe`](https://hashscan.io/testnet/transaction/0x3ba258ab0d021ddd3c16a71bd7de91859fc03ba31d5fb2d7ae488a0663082bfe): SUCCESS |
| At least one lifecycle operation | Run with `scripts/ats-lifecycle.mjs` on the live security. **Compliance:** issuing a share to the agent wallet `0x9a6C…63aA`, which is not on the whitelist, is refused by the security with `AccountIsBlocked` (a simulated call; nothing was sent), and the same issue to the issuer passes. **Issuance:** `issueByPartition`, 1,000 shares of treasury reserve to the issuer, [`0x9085a810…b8c6291c`](https://hashscan.io/testnet/transaction/0x9085a8101bca4cc72e471b48acd9e2e3a294a3af27a27b0f42a82bbcb8c6291c): SUCCESS. **Distribution:** `setDividend`, dividend #1 at 0.05 per share according to the script, [`0x8f0f9034…3cb04cb1`](https://hashscan.io/testnet/transaction/0x8f0f9034af3d4539b9f0aebac279ffc7073b454a64dc0a7b0d7657d43cb04cb1): SUCCESS. Afterwards `totalSupply()` is 1,000 and the issuer holds 1,000. |
| Public repo; contracts verified on HashScan where applicable | This repository. The contract Thenar deployed — the security's `ResolverProxy`, from `@hashgraph/asset-tokenization-contracts` 8.0.0, solc 0.8.28 — is source-verified with an `exact_match` on Sourcify, which HashScan's verification uses ([repo.sourcify.dev](https://repo.sourcify.dev/296/0xDbf28C5C8cb5FA8960Bf413E6353B33066F20Fb7)). The runtime bytecode matches; there is no creation match because the factory created the contract inside `deployEquity`. The ATS factory and resolver are Hedera's own deployments and show no match. `scripts/ats-verify.mjs` reproduces the verification. |
| Demo video, five minutes or less | Script below |

Checked against Hedera's mirror node rather than taken on trust: the contract
exists at that EVM address, `name()` returns "Thenar Robot Corpus" and
`symbol()` returns "THNRC", and both transactions report SUCCESS. The issuer is
testnet operator `0.0.9842030`, which holds the admin, issuer, control-list and
corporate-actions roles.

In progress in the app, not yet proven: holders are added to the whitelist only
after a Selfie Check, and a paid run issues shares to its contributor
(`lib/server/ats.ts`, `/api/submitted`, `/corpus-token`).

---

## World — Selfie Check

| Requirement | Evidence |
| --- | --- |
| Uses Selfie Check, or a compatible World ID credential flow, in a meaningful way | `/api/verify` refuses to sign a run without a World ID Selfie Check proof for the contributor (`lib/server/world-id.ts`, `/api/world/*`, `components/human-gate.tsx`) |
| Treats it as a risk, eligibility, fairness or abuse-prevention signal | Abuse prevention: a nullifier is one per human per action, and a wallet signature over the server's nonce binds it to one address, so one person cannot collect bounties from many wallets |
| Feedback document | [docs/FEEDBACK-WORLD.md](docs/FEEDBACK-WORLD.md), "Selfie Check — integration notes" |
| Refusal without a proof | Run on 13 September: `node scripts/arc-run.mjs http://localhost:3222 1` scores a coherent run for a fresh operator with no Selfie Check, and `/api/verify` answers 403 "Prove you are a live human with World ID before contributing." Nothing is signed, funded or sent. |
| Shows a working app | **Not yet proven end to end.** A new World app, "thenar", is configured, and the Developer Portal precheck reports face check enabled for the `thenar-contribute` action. The app's signing key derives to the portal's signer address, and a request IDKit signs with it recovers to that address. Still to do, once: a Selfie Check in World App, World's `/api/v4/verify` accepting the proof, and the Hedera whitelist admission. |

---

## Also in the repository, not entered

These are working and linked from the README. They support the Continuity
entries above.

- **Hedera x402 and World AgentKit:** an agent pays 0.5 HBAR per corpus through
  Blocky402. Five settlements so far; the three since the sales log existed are
  messages #1–#3 on Consensus Service topic `0.0.10519262`, each with the sha256
  of the file served. The latest, run again on 13 September, is
  [`0.0.7162784@1789296779.408785255`](https://hashscan.io/testnet/transaction/0.0.7162784-1789296779-408785255),
  and the buyer's own hash of what it received matched message #3. AgentBook
  decides free pulls.
- **Privy:** a lab wallet under a policy funded task #5 on Arc
  ([`0x7a7c387f…`](https://testnet.arcscan.app/tx/0x7a7c387f00110499e4e2c4d6665bb120ecbe7db716012d8a35338797f6d9291c)),
  and task #7 from the `/lab` page on 13 September
  ([`0x5ef56687…`](https://testnet.arcscan.app/tx/0x5ef56687df9d4db9baf510a5f53f093c79cb54ef587b3b07f11d98c9b42e3f8c)).
  Asked from the same page to send 0.01 USDC anywhere else, it was refused with
  `policy_violation` and nothing was signed.
- **Arc:** runs recorded and paid in USDC; all ten contracts `exact_match` on
  Sourcify.

---

## Video script (under five minutes)

Record with the dev server on `http://localhost:3222`, a terminal beside it, and
HashScan in a tab.

**0:00–0:30 — What it is.** "Thenar pays people to record robot-arm
demonstrations and sells the result as training data. On Hedera the corpus is a
security; on World, only a verified human can be paid for a run."

**0:30–2:00 — Hedera: the corpus as a security.** Open the security on HashScan:
name, symbol, the issuance through the ATS factory, the whitelist. Run
`node scripts/ats-lifecycle.mjs state`, then
`node scripts/ats-lifecycle.mjs compliance 0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA`:
the unlisted agent wallet is refused with `AccountIsBlocked`. The reserve and the
dividend are already on chain, so open their transactions rather than issuing again. Open each transaction on
HashScan. Show `/corpus-token` if it is ready.

**2:00–3:30 — World: one human, one set of paid runs.** At the station, try to
submit without a proof and show the refusal. Pass the Selfie Check in World App
or the Sandbox App, then submit: signed, and paid on Arc. If no proof has gone
through by recording time, say so and show the refusal path and the feedback
document.

**3:30–4:20 — Privy underneath.** Sign in with an email and show the embedded
wallet. Open `/lab`: post a bounty from the Privy wallet, then ask it to send
USDC elsewhere and show Privy's refusal.

**4:20–5:00 — What is new.** `git log --oneline e4f131d..HEAD`, then the "not
proven" list.

---

## Before submitting

- [ ] Register as a Continuity project on ETHGlobal and disclose the pre-existing
      work (link the README section).
- [ ] Select Hedera (Tokenization of Anything, and Continuity) and World (Selfie
      Check, and AgentKit Continuity).
- [ ] Confirm with ETHGlobal whether the non-Continuity tracks are open to a
      Continuity project.
- [ ] Pass one Selfie Check proof end to end with the new World app, and add the
      evidence above.
- [ ] Fill in the Developer Portal and Sandbox App sections of
      `docs/FEEDBACK-WORLD.md`.
- [ ] Record the video from the script above and add its link to the README.
- [ ] Push the final commit and submit before 12:00 pm EDT.
