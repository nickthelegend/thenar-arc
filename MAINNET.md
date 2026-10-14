# Deploying Thenar to Arc mainnet

Mainnet is one command; the phase gate says the lead runs it after the user funds the deployer.

## 1. Keys and addresses

| Role | Env | Needs USDC for |
|---|---|---|
| Deployer (shared, `/Volumes/Extreme SSD/Projects/arc/.deployer/deployer.env`) | `DEPLOYER_PRIVATE_KEY` (sourced by the script, never in the repo) | deploy + seed tasks |
| Verifier | `THENAR_VERIFIER_ADDRESS` (deploy), `VERIFIER_PRIVATE_KEY` (signer service) | registering its ERC-8004 agent (~0.01) |
| Corpus issuer / seller / auditor | `THENAR_ISSUER_ADDRESS`, `CORPUS_ISSUER_PRIVATE_KEY`, `AUDITOR_PRIVATE_KEY` | SalesLog lines, share issues, audits (~0.005 each) |
| x402 facilitator | `X402_FACILITATOR_PRIVATE_KEY` | settling each x402 sale (~0.003 each) |
| Relayer | `RELAYER_PRIVATE_KEY` | gasless task posts, Gateway mints |

On mainnet the verifier must not be the deployer (the script refuses).

## 2. Deploy

```bash
cd thenar-arc
export THENAR_VERIFIER_ADDRESS=0x… THENAR_ISSUER_ADDRESS=0x… THENAR_AUDITOR_ADDRESS=0x…
export THENAR_MAX_TASK_ESCROW=100000000      # 100 USDC per task (default on mainnet)
export THENAR_SEED_REWARD=50000              # 0.05 USDC per perfect run, 5 tasks x 6 slots = 1.5 USDC escrowed
THENAR_CONFIRM_MAINNET=1 THENAR_VERIFY=1 bash scripts/deploy.sh mainnet   # holds the shared lock only for the broadcast
node scripts/apply-deploy.mjs                # writes lib/deployment.ts from deployments/arc-mainnet.json
NEXT_PUBLIC_ARC_NETWORK=mainnet node --import ./test/register.mjs scripts/register-agent.mjs verifier   # ERC-8004 + bind ThenarVerdicts
```

CCIP lane (optional): deploy `ThenarCcipSender` on Base and allowlist it on Arc:

```bash
cd contracts
SOURCE=base THENAR_CONFIRM_MAINNET=1 forge script script/DeploySender.s.sol --rpc-url https://mainnet.base.org --broadcast
NETWORK=mainnet SOURCE=base THENAR_CONFIRM_MAINNET=1 forge script script/AllowSender.s.sol --rpc-url https://rpc.mainnet.arc.io --broadcast
```

## 3. Gas (measured on the Arc testnet fork; the live testnet run agrees)

The deploy is 17 transactions and **13.2M gas**. At Arc's 20 gwei base fee that is **0.26 USDC** (the script caps the
fee at 60 gwei, so at most 0.8 USDC). A paid run is about 600k gas (~0.012 USDC), an x402 settlement ~80k, a SalesLog
line ~150k. On the public testnet the paid run in docs/E2E-TESTNET.md used 509,221 gas at 25 gwei (0.0127 USDC) and the x402
settlement 91,621 gas (0.0023 USDC).

| | USDC |
|---|---|
| Deploy (17 tx) | 0.3 |
| Seed escrow (5 tasks × 6 × 0.05) | 1.5 |
| ERC-8004 registration + bind | 0.02 |
| Role keys' gas for a short demo (issuer, facilitator, relayer, agent purchases) | 0.7 |
| **Mainnet total for deploy + a short demo** | **≈ 2.5 (fund 5 for headroom)** |

## 4. App env (Vercel)

`NEXT_PUBLIC_ARC_NETWORK=mainnet`, `NEXT_PUBLIC_SITE_ORIGIN`, `PUBLIC_ORIGIN`, `VERIFIER_PRIVATE_KEY`,
`VERIFIER_AGENT_ID`, `CORPUS_ISSUER_PRIVATE_KEY`, `AUDITOR_PRIVATE_KEY`, `X402_FACILITATOR_PRIVATE_KEY`,
`RELAYER_PRIVATE_KEY`, `CORPUS_TREASURY`, `DATABASE_URL` (remote Postgres preferred; alternatively existing Atlas via `MONGODB_URI` and `MONGODB_DB=arc_thenar_mainnet`, 12 MiB snapshot cap), `DATABASE_SCHEMA=arc_thenar_mainnet`,
`NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_ID` / `PRIVY_APP_SECRET` (optional: without Privy the app still builds and serves
public pages and practice, and shows sign-in as unavailable), `NEXT_PUBLIC_FEATURE_GATEWAY=1` only if Gateway funding should be offered. Full list: `.env.example`.

## 5. Services

- **The Next.js app** (one service): pages, the verifier, and the in-process x402 facilitator.
- **The audit keeper** (optional, cron): `node --import ./test/register.mjs scripts/keeper.mjs --once` every hour —
  writes CorpusAudit verdicts and completes CCIP orders whose USDC has arrived.
- Nothing else: no indexer, no CRE, no external facilitator.
