# Thenar on Monad

**Robot training data, recorded by people, owned by the people who recorded it,
and bought by agents.** An operator drives a robot arm in the browser; a
verifier scores the recording against the goal and signs; one Monad transaction
records the trajectory and pays the operator from escrowed MON, in under a
second. The operator signs in once with a passkey (Face ID, a fingerprint, a
PIN), made through Mera; its P-256 key is registered on Monad and its signature
checked there by the P-256 precompile, which puts them on the corpus' share
whitelist, and every paid run issues their share of the corpus. An AI agent
that wants a task's corpus asks for it over HTTP, is answered `402`, and pays a
cent of USDC on Monad through x402. Every sale is logged on Monad with the
sha256 of the bytes served. A lab funds bounties from a Privy wallet whose policy lets
it spend on nothing else.

Thenar was built at **Monad Blitz Hyderabad V3 (3rd place)** on Monad testnet,
built out on Avalanche Fuji afterwards, and has now come back to Monad for
**Metropolis**, Track 4: Trust, Identity & AI Infrastructure. The git history
says which is which: the Blitz commits, then one squashed commit for the
Avalanche build, then the move back.

| | |
| --- | --- |
| **Chain** | Monad testnet, chain `10143`. Bounties, payouts, dividends and gas are MON. |
| **Contracts** | [`lib/deployment.ts`](lib/deployment.ts), written from forge's broadcast record by [`scripts/apply-deploy.mjs`](scripts/apply-deploy.mjs). Every address below comes from there. |
| **Corpus shares** | [`CorpusShares`](contracts/src/CorpusShares.sol): a token only passkey-admitted operators can hold; shares per paid run, by score; dividends in MON at a record date fixed in advance |
| **Agent payments** | x402 `exact` in USDC on Monad, settled by the [Monad facilitator](https://x402-facilitator.molandak.org/supported), which pays the gas |
| **Sales log** | [`SalesLog`](contracts/src/SalesLog.sol): every pull, with the sha256 of the file served, in storage and in events |
| **Identity** | A passkey per operator, made with [Mera](https://github.com/category-labs/mera) and verified on chain by [`PasskeyRegistry`](contracts/src/PasskeyRegistry.sol) through the P-256 precompile at `0x0100` ([`/api/operator`](app/api/operator/route.ts)) |
| **Wallets** | Privy: operators sign in with an email and get an embedded wallet on Monad; a lab's budget is a Privy server wallet whose policy only lets it fund bounties |
| **Driving** | A keyboard, your own SO-101 leader arm over USB (six AS5600 encoders), or a Meta Quest 3S with the arm standing on your real table in mixed reality: open `app.thenar.io/q/<task>` in the headset ([docs/QUEST.md](docs/QUEST.md)) |
| **Live** | **https://app.thenar.io**, the app (tasks, the station, the data, agents). https://thenar.io is ThenarLabs, the company, and everything it builds |
| **Repo** | https://github.com/nickthelegend/thenar-monad |
| **Submission** | [SUBMISSION.md](SUBMISSION.md) |
| **Licence** | MIT ([LICENSE](LICENSE)) |

## Try it in one command

Node 22+, pnpm, Foundry (for anvil) and Docker (optional, for the indexer's database):

```bash
pnpm install
pnpm demo
```

`pnpm demo` starts the whole product on this machine:
- a local chain (anvil, with the same contracts DeployMonad.s.sol puts on Monad, the P-256 precompile, Multicall3 and
  a local USDC);
- the x402 facilitator;
- the Envio indexer, when its database is up (`cd indexer && pnpm db:up`);
- the app.

Then open **http://localhost:3336/localnet** and press *Sign in with the local wallet*. The faucet sends 5 MON and
20 USDC. Tick *A sponsor pays this wallet's gas* first to run without MON, as Privy's sponsorship does on Monad. From
there:
- set up a passkey on /passkey;
- drive a task at /station/0 (W/A/S/D/E/Q to move, Space for the jaws);
- submit, and get paid;
- buy a corpus on /corpus.

Everything is a real signed transaction on that local chain. Ctrl-C stops everything `pnpm demo` started.

## Screens

Captured from the local stack by `scripts/capture-screens.mjs`, at 1440×900 and 390×844, with real signed state:
- the landing page;
- the station mid-drive;
- a paid run re-hashed in the browser;
- a corpus bought over x402;
- the leaderboard;
- the passkey's derived SO-101 key;
- the agents' sales.

![Thenar's key screens, desktop](docs/screens/sheets/thenar-desktop.png)

<details><summary>Mobile, 390×844</summary>

![Thenar's key screens, mobile](docs/screens/sheets/thenar-mobile.png)

</details>

---

## What Monad does here that another chain would not

Each of these is load-bearing, and each has a place in the code shaped by it.

| Monad property | Where it shows |
| --- | --- |
| **300 ms blocks, final two slots later (about 600 ms)** | A run is paid in the block that records it. The station reports two timers it measured, executed and final, and the landing page shows Monad testnet's live block pipeline (Proposed → Voted → Finalized → Verified) with the milliseconds measured in the browser. A share issue and a sales-log write each land a moment later, so the station shows the payout and the share in one panel instead of promising the second. |
| **Parallel execution** | `AxonProtocolV2` shards its slot counter: each operator's submit writes only its own shard, so two runs on one task touch no common storage and execute side by side. |
| **P-256 precompile at `0x0100`** | `PasskeyRegistry` verifies a browser passkey's secp256r1 signature on chain, and a run can be authorised with it. See `/passkey`. |
| **Gas charged on the limit** | A browser write leaves the limit to the wallet's estimate, and the lab's server-signed bounty sends its estimate plus a tenth, never a doubled one; the station and `/post` quote the cost from receipts, and the low-balance floor is one constant. |
| **100-block `eth_getLogs` cap on public RPCs** | History is read from contract storage through Multicall3, not from logs. A run and a task each record the block they were made in, so a transaction hash is a one-block log query every endpoint answers. `SalesLog` keeps every sale in storage for the same reason. |
| **Cheap enough for a one-cent sale** | An agent pays one cent of USDC per corpus; the facilitator pays the gas and the sale is final before the response is sent. |

---

## Architecture

```mermaid
flowchart LR
  OP["Operator's browser<br/>station + Privy wallet"]
  AGENT["Buyer agent<br/>scripts/qwen-agent.mjs"]
  LLM["Qwen / Kimi<br/>tool calls"]
  DON["Chainlink DON<br/>cre/corpus-audit"]
  ENVIO["Envio HyperIndex<br/>indexer/"]

  subgraph APP["Thenar app (Next.js)"]
    VERIFY["/api/verify<br/>scores the samples,<br/>signs EIP-712"]
    SUBMITTED["/api/submitted<br/>reads the receipt,<br/>issues the run's shares"]
    OPERATOR["/api/operator<br/>passkey sign-in → whitelist"]
    CORPUS["/api/agent/corpus<br/>x402"]
    LAB["/lab, /api/lab<br/>the lab's budget"]
    EPISODES["/api/corpus/episodes"]
    HISTORY["/api/indexer<br/>→ /leaderboard"]
    DB[("SQLite or Postgres")]
  end

  subgraph MONAD["Monad testnet"]
    AXON["AxonProtocolV2<br/>escrow + payout in MON"]
    SHARES["CorpusShares<br/>whitelisted to humans"]
    SALES["SalesLog<br/>sha256 of every sale"]
    PASS["PasskeyRegistry<br/>P-256 at 0x0100"]
    USDC["USDC"]
    MANIFEST["CorpusManifest<br/>Merkle root per task"]
    AUDIT["CorpusAudit<br/>ReceiverTemplate"]
  end

  FAC["Monad x402 facilitator<br/>verify · settle · pays gas"]
  PRIVY["Privy<br/>embedded wallets,<br/>policy-bound lab wallet"]

  OP -- "samples" --> VERIFY --> DB
  OP -- "submitTrajectory:<br/>records the run, pays the operator" --> AXON
  OP -- "tx hash" --> SUBMITTED -- "issue(holder, shares, trajHash)" --> SHARES
  OP -- "registers its passkey's P-256 key" --> PASS
  OP -- "passkey signs a challenge" --> OPERATOR -- "verify(digest, r, s)" --> PASS
  OPERATOR -- "addToControlList" --> SHARES
  AGENT -- "GET, then PAYMENT-SIGNATURE" --> CORPUS
  CORPUS -- "verify, then settle<br/>after the file is ready" --> FAC -- "transferWithAuthorization" --> USDC
  CORPUS -- "logSale(sha256)" --> SALES
  AGENT -. "servedCount(sha256)" .-> SALES
  OP -- "email sign-in" --> PRIVY
  LAB -- "eth_signTransaction" --> PRIVY
  LAB -- "broadcasts the signed bounty" --> AXON
  AGENT <-- "chooses, step by step" --> LLM
  DON -- "every node: episodes → roots, consensus" --> EPISODES
  DON -- "latest(taskId) via Multicall3" --> MANIFEST
  DON -- "writeReport(verdicts)" --> AUDIT
  ENVIO -. "indexes events" .-> AXON
  ENVIO -. "indexes events" .-> SALES
  HISTORY --> ENVIO
```

---

## Contracts

All deployed by [`contracts/script/DeployMonad.s.sol`](contracts/script/DeployMonad.s.sol)
in one broadcast. The addresses are in [`lib/deployment.ts`](lib/deployment.ts);
an empty address there means not deployed yet, and every page says so.

| Contract | Does |
| --- | --- |
| AxonProtocolV2 | Tasks, escrow, trajectories, payouts, policies, cap tables. Records a run and pays it in one call. Relayed runs and passkey-authorised runs. |
| CorpusShares | New for Metropolis. The corpus as shares, whitelisted to verified humans, issued per run by score, with snapshot dividends in MON. |
| SalesLog | New for Metropolis. Every corpus sale to an agent, with the sha256 of the bytes served. |
| PasskeyRegistry | Binds a P-256 key to an address; verifies through the precompile at `0x0100`. |
| TrajectoryCertificate | Soulbound record of who recorded a run. |
| ContributionRecord | Running total of work recorded. |
| CorpusAccess | A day of corpus access, paid in MON. |
| CorpusManifest | The committed Merkle root of each task's corpus. |
| Referrals, Foundry, PrizePool | A referral bounty, a treasury contributors vote to spend, a pot for task 1. |
| ConfidentialPayouts | ElGamal on secp256k1: totals add up without the chain holding a number. |
| CorpusAudit | New, and not deployed yet ([docs/DEPLOY-LATER.md](docs/DEPLOY-LATER.md)). The Chainlink CRE receiver: a DON's verdict per task on the corpus Thenar serves against the committed root. |

CorpusShares was redeployed on its own the same day by
[`contracts/script/DeployShares.s.sol`](contracts/script/DeployShares.s.sol): the
first one could not return a dividend declared while no share existed, and
still holds the 0.01 MON declared that way in testing. The current one has
`reclaimDividend`, proven on chain by declaring and reclaiming one.

`LicenceReceipt`, `PolicyAnnouncer` and `PolicyRegistry` stay in the source and
are not deployed: they attest through Avalanche's Warp and Teleporter.

The Blitz deployment, `AxonProtocol` v1 at
[`0x89384f46…6Ed4`](https://testnet.monadscan.com/address/0x89384f46e430F37DB61Afb98810eba995C0d6Ed4),
is still on Monad testnet with its Hyderabad runs, and `/contracts` lists it under Superseded.

---

## Run it

Node 22 or later (scripts import TypeScript directly), pnpm, and Foundry.

```bash
pnpm install
cp .env.example .env.local        # fill in the 0x... values
pnpm dev --port 3222
```

Deploy everything to Monad testnet and point the app at it. The deployer needs
about 2.5 MON; Monad charges the gas limit, so keep the multiplier at 110:

```bash
cd contracts
set -a; . ../.env.deployer; . ../.env.local; set +a
forge script script/DeployMonad.s.sol --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast --gas-estimate-multiplier 110
cd .. && node scripts/apply-deploy.mjs && node scripts/gen-abi.mjs
```

Scripts that import TypeScript run with the resolver:

```bash
node --import ./test/register.mjs scripts/monad-run.mjs http://localhost:3222 1   # a scripted, paid run
node --import ./test/register.mjs scripts/agent-buy.mjs http://localhost:3222 1   # an agent buying a corpus
node --import ./test/register.mjs scripts/shares.mjs state                        # the share register
node --import ./test/register.mjs scripts/privy-lab.mjs                           # a lab's policy-bound budget
```

The agent needs testnet USDC from [faucet.circle.com](https://faucet.circle.com)
(Monad testnet) and no MON.

Tests:

```bash
pnpm test:unit                    # 125 unit tests
cd contracts && forge test        # 133 contract tests: CorpusShares, SalesLog, CorpusAudit, SponsoredAccount …
```

### On a local chain

Everything above also runs on anvil. That chain has the P-256 precompile, Monad's Multicall3, a local USDC and a
local x402 facilitator, and every transaction on it is real and signed. Each line below is its own terminal:

```bash
node scripts/localnet.mjs                                          # anvil on :8645, the contracts, .env.localnet
node scripts/localnet-app.mjs                                      # build and serve on :3336
NEXT_PUBLIC_CHAIN=local node --import ./test/register.mjs scripts/x402-facilitator.mjs
(cd indexer && sh scripts/start.sh --bg)                           # the Envio indexer, for /leaderboard's history
```

Then, in headed Chromium:
- `pnpm test:localnet`: a whole operator day. Passkey, a driven run, payout and shares, the SO-101 key, an x402
  purchase, and the indexer.
- `pnpm test:localnet:sponsored`: the same day for an operator who never holds MON. The gas is sponsored the way
  Privy sponsors it on Monad.
- `pnpm test:agent`: the buyer agent's whole loop for Qwen and for Kimi, with a test double as the model (the agent itself has no mock mode). It also checks that the agent refuses to start without a key. To drive it with a real model, use Qwen 3 on Ollama: `AGENT_LLM=ollama node --import ./test/register.mjs scripts/qwen-agent.mjs`.
- `pnpm test:cre`: the Chainlink CRE corpus audit and its receiver.
- `pnpm test:e2e:local`: every page and API.

---

## Built for Metropolis (1 Sep – 13 Oct 2026)

Every commit in this repository falls inside the build window. Thenar began at **Monad Blitz Hyderabad V3** (5–6 Sep,
3rd place), which is the first 56 commits. It was built out on Avalanche Fuji, then brought back to Monad, as the
[History](#history) below shows. What Metropolis added on top of the Blitz protocol:

- **Ownership and trust**:
  - `CorpusShares`, the corpus as shares only verified humans can hold, issued per run by score, with dividends;
  - `SalesLog`, the sha256 of every corpus served;
  - the `CorpusManifest` Merkle commitments, audited by a Chainlink DON (`cre/corpus-audit` → `CorpusAudit`).
- **Identity**:
  - the passkey gate (Mera, verified by the P-256 precompile) on the share whitelist;
  - the operator's **SO-101 key** derived from the passkey's PRF, shown and verified live on /passkey.
- **Agents**:
  - x402 in USDC on Monad;
  - a buyer agent that chooses, pays and verifies on chain, on Qwen or Kimi (`scripts/qwen-agent.mjs`);
  - the same purchase from a person's own wallet on /corpus.
- **Wallets**:
  - Privy embedded wallets;
  - a lab budget in a Privy server wallet under a spend policy;
  - gas sponsorship for operators.
- **Driving the arm**:
  - the SO-101 (MG996R) arm;
  - your own leader arm over USB or through the relay;
  - a Meta Quest 3S with the arm on your real table in mixed reality;
  - tasks scanned from a real table with a camera;
  - teach and repeat.
- **Data**: an Envio HyperIndex indexer and the history it serves on /leaderboard.
- **Running it**: `pnpm demo`, and a test suite that runs on the local chain with real transactions (below).

## Sponsor integrations

| Sponsor | What it does in Thenar | Code | Verified |
|---|---|---|---|
| **Privy** | Embedded wallets for operators; a policy-bound server wallet as a lab's budget; gas sponsorship; the embedded wallet paying over x402 | `components/providers.tsx`, `lib/server/privy-lab.ts`, `lib/contract-write.ts`, `components/corpus-pull.tsx` | `pnpm test:localnet:sponsored` (the same EIP-7702 shape on anvil); real Privy after the dashboard toggle |
| **Mera** | One passkey, three keys: identity (P-256 on chain), the SO-101 command key (PRF → HKDF → Ed25519), and the same keys on every synced device | `lib/passkey.ts`, `lib/robot-key.ts`, `components/passkey-keys.tsx` | `pnpm test:localnet` |
| **Qwen / Kimi** | The buyer agent's model: tool calls that list, price, pay over x402 and verify on chain | `scripts/qwen-agent.mjs` | A real Qwen 3 on Ollama; `pnpm test:agent` |
| **Envio** | HyperIndex V3 over five contracts, with aggregate entities; `/api/indexer` and the /leaderboard history | `indexer/`, `app/api/indexer`, `components/indexed-activity.tsx` | `pnpm test:localnet` (step 8) |
| **Chainlink CRE** | A DON audits the corpus Thenar sells against the verifier's on-chain commitment and writes a verdict per task | `cre/corpus-audit`, `contracts/src/CorpusAudit.sol` | `pnpm test:cre`, `forge test` |
| **Cleanverse** | Planned; blocked on their onboarding | [docs/CLEANVERSE.md](docs/CLEANVERSE.md) | — |

The gap analysis and evidence for each bounty: [docs/SPONSOR-GAP.md](docs/SPONSOR-GAP.md).

## Attribution

Code and assets this repository did not write, and where they are used:

- **Chainlink.** `contracts/src/cre/IReceiver.sol` and `ReceiverTemplate.sol` are copied from the CRE docs, unchanged
  except that the template imports the minimal `Ownable` beside it; that `Ownable` reproduces OpenZeppelin's v5
  interface.
- **Poly Haven.** Seventeen photoscanned props (CC0), each credited in `public/props/index.json`.
- **MediaPipe.** EfficientDet-Lite0 for object detection in the table scan (`@mediapipe/tasks-vision`, served from
  `public/vision/`).
- **Monad.** The Multicall3 bytecode the local chain installs is read from Monad testnet.
- **Libraries, used as dependencies and not copied:**
  - Mera (`@category-labs/mera`) for passkeys and PRF;
  - Privy (`@privy-io/*`);
  - x402 (`@x402/*`);
  - viem and wagmi;
  - three.js;
  - Next.js and React;
  - the Chainlink CRE SDK (`cre/`);
  - Envio HyperIndex (`indexer/`).
- **Tests.** Meta's IWER emulator, in the Quest tests only, never shipped.

The SO-101 arm is the open SO-ARM100/101 design. Its MG996R build and the AS5600 leader firmware come from ThenarLabs'
`thenar-arms` repository. This repository holds the arm's solver, its model, and the parametric CAD kernel in `cad/`.

## How this was built: AI tools

Most of the code, tests and documents in this repository were written with **Claude Code** (Anthropic), directed and
reviewed by the author. Commits it co-wrote carry a `Co-Authored-By: Claude` trailer. The design decisions, the
hardware (the arms, the leader, the headset) and the choice of what to build are the author's.

---

## Stated plainly: what is not proven

- **Testnet only.** Nothing here is on Monad mainnet.
- **Until `lib/deployment.ts` has addresses, nothing is deployed.** The pages
  say so rather than showing figures.
- **No run has been recorded on the Monad deployment yet.** Every flow has run
  end to end on a local chain with real contracts and signed transactions (the
  tests above). Monad testnet is the next step, by
  [docs/DEPLOY-LATER.md](docs/DEPLOY-LATER.md).
- **Monadscan's index needs a key.** The per-address call history on
  `/contracts`, `/operator` and `/portfolio` reads Etherscan's V2 API and says
  so when `ETHERSCAN_API_KEY` is unset; a local build says Monadscan does not
  index it. Everything else reads the chain.
- **Keys this repository does not have:**
  - Model Studio (Qwen 3.8 Max) and Moonshot (Kimi): without a key, the agent
    says the provider is not configured;
  - an Envio API token, to index Monad itself;
  - a `cre login`, to simulate the workflow against Monad;
  - Cleanverse onboarding.
- **Kinematic, not rigid-body physics.** The station solves inverse kinematics
  and grasps analytically. No trained policy exists yet.

---

## History

- **Monad Blitz Hyderabad V3** — the protocol, the station, passkeys through the
  P-256 precompile, sharded slots. 3rd place. The commits before
  "Build the product on Avalanche Fuji".
- **Avalanche Fuji** — the product built out: lab, hub, policies, licences,
  referrals, prize pool, AxonProtocolV2, the test suites. One squashed commit;
  the long form is in [docs/history/README-avalanche.md](docs/history/README-avalanche.md).
- **Back on Monad, for Metropolis** — everything after that commit.
