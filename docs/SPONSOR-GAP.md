# Thenar × Metropolis sponsor bounties: gap check

Checked 5 Oct 2026 against `/Volumes/Extreme SSD/Projects/METROPOLIS-SPONSORS.md` (sponsor research of the same day).
Bounty scoring is **40% meeting the bounty's stated requirements**, 30% technical, 20% Monad integration and 10%
innovation, so the "gap" column is measured against each bounty's own wording.

## Submission branch

`main` on `nickthelegend/thenar-monad` (the `quest-web` line, deployed at app.thenar.io and thenar.io) is the submission.

- **`monad`** (`Projects/thenar-monad-migration`, last commit 30 Sep) has **no commits that are not already in `main`**.
  Nothing to merge; that checkout is simply behind.
- **`quest-teleop`** (`Projects/thenar-monad`, 23 Sep) is the first, standalone Vite Quest prototype (`apps/quest`).
  - Its committed work is on `origin/quest-teleop`.
  - Its 37 uncommitted files (scan, teach, corpus and station pages for the standalone app) are now committed on `origin/quest-teleop-wip` so nothing is lost.
  - Every one of those features was rebuilt inside the Next app on `main`: the station, Quest 3S placement, `/post` table scan, teach and repeat, and the corpus. So the standalone app is not merged into `main`.

## Track

Thenar is entered in **Track 4: Trust, Identity & AI Infrastructure**, its natural fit:
- passkey identity verified on chain through the P-256 precompile;
- provenance of every run;
- data owned by the people who recorded it;
- agents that pay for and verify what they buy.

T4 locks **Qwen 3.8 Max** and **Cleanverse**. Every other relevant bounty is "All tracks".

**Portfolio note.** Xorv is also T4, and one track per project means the two compete for the same three T4 prizes.
- Thenar's fallback would be **T2 (Consumer Products & Payments)**: people paid per run. But Mempire is T2.
- KOMA is T3. Thenar has no T1 fit.
- Recommendation: keep Thenar in T4 (it loses Qwen otherwise), and move Xorv if it fits another track.

## Bounties

Status: ✅ meets the stated requirement · 🟡 partly · ❌ not built · ⛔ blocked on something only the user can do.

| Bounty | Prize | Lock | Thenar today | Gap against the stated requirement | Effort | Value | Plan |
|---|---|---|---|---|---|---|---|
| **Privy — beyond authentication** | $5k | All | ✅ Login + embedded wallet signs every run, passkey registration and task post. ✅ **Server wallet + policy engine**: the lab budget can only fund Thenar bounties, and the refusal is shown live on /lab. ✅ **Gas sponsorship** for operator writes (`lib/contract-write.ts`, behind `NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP`). ✅ **The embedded wallet buys a corpus over x402** on /corpus. | ⛔ Sponsorship is off until it is enabled for Monad Testnet in the Privy dashboard. Privy itself can't run on anvil, so the sponsored path is checked locally through a stand-in with the same on-chain shape: an EIP-7702 delegated wallet whose calls a sponsor sends. With `SPONSORED=1`, the whole journey passes for an operator who never holds MON: passkey registration, the paid run, and an x402 purchase. It surfaced a real requirement: a delegated wallet pays over x402 only if its account answers EIP-1271. | — | **High** | Privy's `useX402Fetch` is x402 v1 and Thenar's paywall is v2, so the purchase uses x402's v2 client over the Privy wallet. Local check: `npm run test:localnet:sponsored`. |
| **Mera: One Passkey, Many Keys** | $2.5k | All | ✅ A PRF namespace does non-account work: the salt "so101-commands" → HKDF → an Ed25519 key that the arm relay requires on every command. Nothing derived is stored, and the session zeroes it. ✅ **Live on /passkey** (shipped): both keys listed with their salts, the SO-101 key derived on demand, a command signed and verified in the page. | ⛔ The cross-device test is yours: open /passkey on two devices your passkey syncs to and compare the key. Chromium's virtual authenticator cannot copy a PRF secret, so it can't be simulated. | — | **High** | Shipped. `test/live-localnet.mjs` checks the key verifies with the relay's own check, and is the same with nothing stored. |
| **Envio — Best use** | $1k + hosting | All | ✅ HyperIndex V3 indexer (`indexer/`) over Axon, SalesLog, CorpusShares, CorpusAccess and PasskeyRegistry, with aggregate entities. ✅ **A consumer**: `/api/indexer` reads `Stats`, `DailyStat` and recent `Operator`s server-side, and /leaderboard draws the history the RPC cannot serve. A local build finds the local indexer by itself, and says how to start it when it is down. | ⛔ Not hosted against Monad testnet yet (Envio Cloud or an `ENVIO_API_TOKEN`). In production the panel stays hidden until `ENVIO_GRAPHQL_URL` is set. | — | Medium | Verified against the local chain's indexer in `test/live-localnet.mjs`. |
| **Alibaba Qwen 3.8 Max** | $5k credits (top 3 T4) | T4 | ✅ `AGENT_LLM=qwen` (`scripts/qwen-agent.mjs`): Qwen lists the tasks, reads datasheets, prices, buys over x402 with its own key, and verifies the bytes against SalesLog, all as tool calls. Driven end to end by a real Qwen 3 on Ollama (`AGENT_LLM=ollama`). | ⛔ `DASHSCOPE_API_KEY` to run on `qwen3.8-max`. Without it the agent says Qwen is not configured and exits; there is no mock mode. | — | Medium (tied to placing) | `npm run test:agent` tests the loop with a test double (under `test/` only). |
| **Kimi** | $3k credits (10 teams) | All | ✅ `AGENT_LLM=kimi` runs the buyer agent on `kimi-k2.6`: Kimi chooses the corpus with tool calls, pays over x402 and verifies on chain. Its reasoning goes back on each turn and its temperature is left to it. | ⛔ `MOONSHOT_API_KEY`; not yet run against Moonshot itself. The loop is tested with a test double that holds requests to Moonshot's rules. | — | Low–Medium | Done. |
| **Chainlink CRE** | $3k | All | ✅ `cre/corpus-audit`, in four steps. (1) A cron triggers it. (2) Every node fetches the episodes Thenar sells and builds the roots itself, and the nodes reach consensus. (3) It reads `CorpusManifest` through Multicall3. (4) It gives each task a verdict and `writeReport`s it to `CorpusAudit` (a `ReceiverTemplate`); `/api/task/{id}/manifest` reports the verdict. Compiles to WASM. | ⛔ `cre login` and MON for one receiver deploy, then `cre workflow simulate … --broadcast` (the command is in `cre/README.md`). Re-run locally on 6 Oct (`npm run test:cre`, Foundry). | — | Medium | Done locally. |
| **Cleanverse CVI/CVA** | $2k cash | T4 | ⛔ Rechecked 6 Oct ([docs/CLEANVERSE.md](CLEANVERSE.md)). The docs are still invite-gated. The deployed contracts were mapped from bytecode: validator `complianceVerify(pool,user)`, the soulbound A-Pass, aUSDC and its `canTransfer` policy. | Every pool outside Cleanverse gets `PoolNotRegistered()`. On a local fork of Monad testnet, every aUSDC move reverts `TransferNotAllowed()`, even the owner's own mint. No app can move CVA until Cleanverse registers it and issues A-Passes and rules. | M after access | Low–Medium | Planned: an aUSDC task bounty whose `claim` requires `complianceVerify(escrow, operator)`. ⛔ Ask Cleanverse for the four things listed in CLEANVERSE.md. |
| **Alchemy** | $1k credits | All | ❌ | "Meaningful" needs more than an RPC URL (Gas Manager, `monadLogs`). | S | Low | ⛔ Needs an Alchemy key. Overlaps Privy sponsorship, so skip unless the key appears. |
| **Mera UX** | $2.5k | All | ❌ by design | Requires Mera as the *entire* account layer; Thenar's account layer is Privy. | L | Low | Skip: it conflicts with the Privy bounty. |
| **Dynamic** | $5k | All | ❌ | Another account layer beside Privy. | M | Low | Skip. |
| **Aurora Intents** | $5k | All | ❌ | Mainnet only; needs real funds. | S–M | Low | Skip. |
| **Nansen** | $5k | All | ❌ | Mainnet data only; nothing in Thenar consumes wallet intelligence. | M | Low | Skip. |
| **Perpl API** | $5k | All | ❌ | A trading bot; no product fit. | — | — | Skip. |
| **Agora AUSD** | $10k ×2 | T1 / T2 | ❌ | Mobile trading or cross-border apps in other tracks. | — | — | Not eligible in T4. |
| **Community Team** | $5k | All | ? | Depends on registering under a Metropolis community supporter. | none | ? | User: check the portal profile field. |

## Shipped from this list

| Commit | What |
|---|---|
| `de7a7dd` | Mera: "Keys from this passkey" on /passkey. |
| `803d3db` | Privy: gas sponsorship for operator writes, behind `NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP`. |
| `b035d22` | Privy + x402: buy one task's corpus from /corpus with the embedded wallet. |
| `de2d4d0` | Envio: `/api/indexer` and the history on /leaderboard. |
| `bf5aa03` | Kimi: `AGENT_LLM=kimi` for the buyer agent. |
| `ce539e0` | The local journey test covers the key, the purchase and the indexer. |
| `0716d2e`, `eef06df` | Chainlink CRE: `cre/corpus-audit`, `CorpusAudit`, `/api/corpus/episodes`, the verdict on the manifest route. |
| `a214250` | Qwen and Kimi as `AGENT_LLM` options. The fixture mode added here was later removed from the product (6 Oct); the double lives under `test/` only. |
| `5d8a65f` | Cleanverse: the deployed contracts mapped, and why CVA can't move yet (`docs/CLEANVERSE.md`). |
| `396a21d` | Envio: the local build shows the indexer's history and explains an outage. |
| `739ba70` | Privy: the sponsored-gas path checked on anvil, with a 0-MON operator and an x402 purchase from a 7702-delegated wallet. |
| `b107d85` | The model fixture removed from the agent (a test double under `test/` only); a real Qwen 3 on Ollama bought and verified a corpus; `pnpm demo`. |
| `36fe03d`, `242a115` and the 6 Oct pass | The zero-mock pass (docs/TEST-PLAN-ZERO-MOCK.md): the relay on any port, honest not-configured states, lint clean, slither triaged, MIT licence, and the judge package (README, SUBMISSION, docs/DEPLOY-LATER.md). |

Verified on the local chain, every transaction real and signed:
- `test/live-localnet.mjs`: passkey, run, payout, shares, SO-101 key, x402 purchase with a matching SalesLog hash, indexer panel.
- `test/live-cre-audit.mjs`
- `forge test --match-contract CorpusAuditTest`

Also local, since 6 Oct:
- `npm run test:localnet:sponsored`
- `npm run test:agent`
- `npm run test:cre`
- `forge test --match-contract 'CorpusAuditTest|SponsoredAccountTest'`
- `test/llm-double.test.mjs` (in `npm run test:unit`)

From 6 Oct the user asked for **no deploys and no Monad transactions** until they say so. Everything after `d01a8df` is committed and pushed, and checked on the local chain, but not deployed to app.thenar.io.

Not verifiable here:
- Privy's own sponsorship (the dashboard setting);
- Kimi and Qwen 3.8 Max against their real endpoints (keys);
- the CRE simulation against Monad (`cre login`);
- Cleanverse (onboarding).

## Left for the user

1. **Register the team and project on the portal before 6 Oct 23:59 UTC** (registration and team formation close then, per a participant's capture).
2. Privy dashboard:
   - enable **gas sponsorship for Monad Testnet** (testnet subsidy: email monad@privy.io);
   - then set `NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP=1` on Vercel and redeploy (it is read at build time).
3. Envio:
   - create an account and an API token (or deploy `indexer/` to Envio Cloud) so the indexer runs against Monad testnet;
   - then set `ENVIO_GRAPHQL_URL` on the Railway web service.
4. A DashScope key (Qwen 3.8 Max), and optionally a Moonshot key (Kimi).
5. Monad testnet USDC (1 USDC) for the demo agent `0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA`, and some for your own Privy wallet if you demo the in-browser purchase.
6. Chainlink CRE, following `cre/README.md`:
   - `cre login`;
   - deploy `CorpusAudit` from a throwaway key with a little MON (not the deployer, verifier or issuer);
   - simulate with `--broadcast`;
   - set `CORPUS_AUDIT` on the Railway web service.
7. Real runs on Monad from your own Privy login (the deployment had none on 2 Oct): judges look for live activity.
8. The Mera cross-device check: derive the SO-101 key on /passkey on two devices your passkey syncs to, and film it for the demo.
