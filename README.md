# Thenar on Arc

**Robot training data, recorded by people, paid per run in USDC, and bought by AI agents.** An operator drives a robot
arm in the browser; a verifier scores the recording against the goal and signs; **one Arc transaction records the
trajectory and pays the operator in USDC from the task's escrow**, final in under a second. An AI agent that wants a
task's corpus asks for it over HTTP, is answered `402`, and pays a cent of USDC through **x402** in the same request.

Why Arc: a per-run payout is only honest if the money, the gas and the finality are as simple as the work. On Arc the
escrow, the payout, the licence fee and the gas are all the same USDC; a run is final when its block lands (no
confirmations to wait for); and an agent can pay for data in the request that fetches it.

| | |
|---|---|
| **Chain** | Arc testnet (5042002) now; Arc mainnet (5042) is one command (see [MAINNET.md](MAINNET.md)). |
| **Money** | Circle's USDC ERC-20 at `0x3600…0000` (6 decimals) for escrow, payouts, licences and dividends; native USDC for gas. |
| **Contracts** | [`contracts/src`](contracts/src), deployed by [`contracts/script/Deploy.s.sol`](contracts/script/Deploy.s.sol) into [`deployments/arc-<network>.json`](deployments). |
| **Status** | Built and verified end to end on an Arc testnet fork (Circle's Arc Foundry). The testnet deploy is waiting on the shared deployer being funded. |
| **Supersedes** | The earlier ETHOnline 2026 Thenar build, which escrowed the native coin and mixed several chains. This repo is Arc-only, USDC throughout. |

## Arc stack

| Piece | What it does in Thenar | Contract / file | How it was verified |
|---|---|---|---|
| **USDC gas + sub-second finality** | One token for everything. `submitTrajectory` records a run and pays the operator in the same call; the station reports the measured time to a final receipt. | `ThenarProtocol`, `lib/chain.ts`, `lib/submit.ts`, `components/arc-finality.tsx` | Core-loop e2e on the Arc fork (`pnpm e2e:core`, tx hashes in [docs/e2e-core.log](docs/e2e-core.log)); 17 Arc-fork forge tests on Circle's real USDC |
| **x402 in USDC** | Agents buy one task's corpus per request: `402` → EIP-3009 `transferWithAuthorization` (domain `"USDC"/"2"`) → file. Settled by an in-process facilitator (Arc has no public one); every sale goes to `SalesLog` with the sha256 served. | `app/api/agent/corpus/route.ts`, `lib/server/x402-facilitator.ts`, `SalesLog` | Core-loop e2e on the fork (real EIP-3009 settlement, SalesLog line, sha256 match) |
| **ERC-8004** | The verifier is an agent in Arc's Identity Registry; `ThenarVerdicts` writes every paid verdict to the Reputation Registry (`runVerdict`, feedbackHash = run id), isolated from the payout. Buyer agents send `x-erc8004-agent-id`, are logged by agent id, and rate the verifier (`corpusQuality`). | `ThenarVerdicts`, `lib/server/erc8004.ts`, `/agents` | 13 unit tests; fork tests against Arc testnet's real registries (register, bind, feedback read back with `getSummary`) |
| **Arc Memo** | A run is sent through the Memo predeploy with `memoId` = the run id, so the payout says what it paid for; `CallFrom` keeps the operator as `msg.sender`. Probed per session; sent plain where a node doesn't run CallFrom. | `lib/memo.ts`, `lib/submit.ts` | Fork test (`--network arc`): Memo event with memoId = trajHash, operator paid; browser run on the fork showed the tag |
| **CCTP V2** | Operators withdraw earnings to Base, Ethereum or Arbitrum from `/portfolio` (`depositForBurn` → Iris → `receiveMessage`). | `lib/cctp.ts`, `components/operator-money.tsx`, `scripts/cctp-withdraw.mjs` | A real `depositForBurn` on the fork (fork test and browser). Attestation + destination mint are user-run |
| **Chainlink CCIP (+ CCTP)** | A buyer agent on Base/Ethereum licenses a corpus on Arc in one transaction: CCTP moves the USDC to `ThenarCcipReceiver`, CCIP carries the order, the receiver pays `licensePolicyFor` and every operator. Allowlisted senders; failed messages kept for retry. | `contracts/src/ccip/`, `scripts/ccip-send.mjs`, `/licence/[id]` | 27 Chainlink Local tests; fork tests against Arc testnet's router (Base Sepolia lane, fee quote, a LICENSE message bought a licence). Live sends are user-run |
| **EIP-3009 gasless posting** | A sponsor posts a funded task with one signature (`createTaskWithAuthorization`, nonce bound to the task), relayed by the server. | `ThenarProtocol`, `/api/relay/create-task`, `components/gasless-post.tsx` | Unit tests (front-running a signature for other params fails) and fork tests against Circle's FiatToken |
| **Circle Gateway** *(opt-in, off by default)* | With `NEXT_PUBLIC_FEATURE_GATEWAY=1`, a sponsor's unified USDC balance on another chain funds a bounty (burn intent → Circle attestation → `gatewayMint`), then the gasless post. | `lib/gateway.ts`, `lib/server/gateway.ts`, `/api/gateway/*` | Intent building/checks tested; balance read against Circle's live testnet API. A mint needs a funded Gateway balance, so it is user-run and off by default |
| **Audit keeper** (replaces Chainlink CRE, which isn't on Arc mainnet) | Rebuilds each task's corpus Merkle root from the public API, compares it with `CorpusManifest`, writes a verdict to `CorpusAudit`; also completes CCIP orders whose USDC has arrived. | `scripts/keeper.mjs`, `CorpusAudit` | Run against the fork |

Not used: USYC (escrow must be payable in the same block), StableFX / EURC and Data Feeds (no FX or price input on the payment path).

## The core loop

```
operator (browser) ──drive the simulated SO-101 arm──▶ /api/verify: replay, score, EIP-712 signature ("Thenar"/"1")
        │
        └─ ThenarProtocol.submitTrajectory (through Arc Memo, memoId = run id)
              ├─ records the trajectory hash and score
              ├─ pays reward × score / 10000 USDC from the task's escrow, in the same call
              └─ ThenarVerdicts → ERC-8004 Reputation Registry (bounded, never blocks the payout)
agent ──GET /api/agent/corpus?taskId=N──▶ 402 ──EIP-3009 USDC──▶ in-process facilitator settles ──▶ file + SalesLog(sha256)
```

## Contracts

| Contract | Why it exists |
|---|---|
| `ThenarProtocol` | Tasks, USDC escrow, runs paid in the call that records them, policies and licences. Ownerless; per-task escrow cap fixed at deployment; a blocklisted payee is credited to `claimable`, never blocks others. |
| `PasskeyRegistry` | Operators sign in with a passkey; Arc's P-256 precompile (`0x0100`) checks it on chain. |
| `SalesLog` | Every corpus sale with the sha256 served and the buyer's ERC-8004 agent id: the agents' side of the loop, readable without our database. |
| `ThenarVerdicts` | The verifier's ERC-8004 record of paid verdicts. |
| `CorpusManifest` / `CorpusAudit` | The Merkle root of each task's corpus, and the keeper's check of what is served against it. |
| `CorpusShares` | The corpus as shares only passkey-admitted operators can hold; dividends in USDC. |
| `TrajectoryCertificate`, `ContributionRecord` | A soulbound certificate per run, and a running total of work, both read from the protocol. |
| `ThenarCcipReceiver` (+ `ThenarCcipSender` on Base/Ethereum) | Corpus licences bought from another chain. |

Slither (medium and above) is clean or reviewed: [docs/SLITHER.md](docs/SLITHER.md). No owner can move or freeze escrowed or owed USDC.

## Run it

Node 22+, pnpm, Foundry, and [Circle's Arc Foundry](https://github.com/circlefin/arc-foundry) for the fork
(`ARC_ANVIL` / `ARC_FORGE` point at its binaries).

```bash
pnpm install && (cd contracts && npm ci)
cp .env.example .env.local                 # fill in for testnet; the fork writes its own .env.fork

# Everything on a local fork of Arc testnet (real USDC, Memo, ERC-8004, CCTP, CCIP contracts):
export ARC_ANVIL="/path/to/arcfoundry/anvil" ARC_FORGE="/path/to/arcfoundry/forge"   # quote paths that contain spaces
pnpm fork -- --detach                      # forks Arc testnet on :9000, deploys, registers ERC-8004 agents
pnpm fork:app                              # builds and serves the app on :9010 against the fork
pnpm e2e:core                              # the zero-mock core loop, printing every tx hash
```

Then open http://localhost:9010/localnet, sign in with the local wallet, take test USDC from the faucet, and drive
`/station/0`. On testnet, get USDC from https://faucet.circle.com.

Tests:

```bash
pnpm contracts:test          # forge: 156 pass, 0 fail, 2 fork suites (17 tests) skipped without Arc Foundry
pnpm contracts:test:fork     # forge --network arc against Arc testnet (ARC_FORK_TESTS=1)
pnpm test:unit               # app unit tests: 144 pass, 0 fail, 1 skipped (passkey precompile, needs the fork)
pnpm typecheck && pnpm lint && pnpm build
```

## Deploy

```bash
pnpm deploy:testnet          # scripts/deploy.sh testnet: shared deployer lock, writes deployments/arc-testnet.json
THENAR_CONFIRM_MAINNET=1 pnpm deploy:mainnet   # see MAINNET.md
```

## Stated plainly

- **Testnet deploy pending:** the shared deployer has no testnet USDC yet; everything above ran on an Arc testnet fork.
- **Sign-in configuration:** a public-chain build without `NEXT_PUBLIC_PRIVY_APP_ID` still builds and serves public
  pages and browser practice. It shows “Sign-in is unavailable” and uses a disconnected wagmi configuration with no
  connectors or persisted wallet storage. It cannot authenticate an operator or submit paid runs. Set a real Privy
  app id from `.env.example` and rebuild to enable sign-in; no placeholder credentials are supplied. Configured Privy
  behavior and the explicit local-fork wallet/faucet flow remain unchanged.
- **User-run cross-chain steps:** CCTP attestations, CCIP sends from Base/Ethereum and Gateway mints need funds on
  other chains; they are covered by fork and Chainlink Local tests and by scripts the user runs.
- **Optional extras are off by default.** The station's “Race the best run” ghost arm (a translucent replay of the
  task's best paid run, drawn only, never scored) is a switch the operator turns on; Circle Gateway funding needs
  `NEXT_PUBLIC_FEATURE_GATEWAY=1`. Neither is on the core loop's path.
- **Kinematic, not rigid-body physics.** The station solves inverse kinematics and grasps analytically. No trained policy exists.

## Licence and attribution

MIT ([LICENSE](LICENSE)). Built with Next.js, viem/wagmi, Privy, x402 (`@x402/*`), three.js, MuJoCo, Chainlink CCIP
contracts and Chainlink Local, OpenZeppelin. Poly Haven props (CC0) are credited in `public/props/index.json`. Most of
the code was written with Claude Code, directed and reviewed by the author.

### Container (not deployed from this repo's phase)

`Dockerfile` + `railway.json` package the app for a container host: default Arc testnet, Gateway off, SQLite on a
mounted `/data` (`AXON_DB_PATH=/data/axon.db`), runs as a non-root user. `/api/live` is a liveness probe; `/api/health`
reports signer, database, RPC and deployment readiness. The public web container must not hold `VERIFIER_PRIVATE_KEY`:
run a separate signer service and point `SIGNER_ORIGIN` at it. The Linux image build has not been run in this
environment.
