# Deploy later: the runbook for "go"

Since 6 Oct 2026 nothing goes to Monad testnet or hosting until the user says go. This is the ordered list for that
moment. Target: **under an hour from "go" to live**. Steps marked 👤 need the user (an account, a key, or MON); every
other step is a command.

What is already live and stays as it is: the contracts on Monad testnet (deployed 23 Sep 2026, below), and the
app at https://app.thenar.io (Vercel) with its API on Railway, as deployed on 5 Oct (commit `d01a8df`). Everything
after `d01a8df` is committed on `main`, tested on a local chain, and not yet deployed.

## 0. Before you start (5 min)

```bash
git pull && pnpm install
pnpm test:unit && (cd contracts && forge test)
```

Optionally, `pnpm demo`, then `pnpm test:localnet` in a second terminal, for one last full run on the local chain.

## 1. Addresses on Monad testnet (chain 10143)

From [`lib/deployment.ts`](../lib/deployment.ts). These are deployed and verified, and need no MON to keep running.

| Contract | Address |
|---|---|
| AxonProtocolV2 | `0x17731731c6652770CE630e29b62791DC2CED5f38` |
| PasskeyRegistry | `0xE344179839c9cA2101Ad930BD49268103F3945a9` |
| CorpusShares | `0xAE1F24fE0F759BEF941eA2Df2dcb23dc3e130fc7` |
| SalesLog | `0xf34A45021B8006C141E8b9CFe4B8a509a9b1fE27` |
| CorpusManifest | `0x692190b7955821C050FFFbC7741D31a65Ecd5c48` |
| CorpusAccess | `0xD0ad261D8d7a3D5a1D0Bf6Ed6EbE4BAD691b4AA1` |
| TrajectoryCertificate | `0x0604C7afC6E17Cbe59644040C2373C97a56439EA` |
| ContributionRecord | `0xd2527d7e737A63118036164A9F1D4dB3CDc3e27E` |
| Referrals / Foundry / PrizePool | `0xb51CBeF2…269b` / `0x9Fba189A…5311` / `0xcf5E9A25…4E5E` |
| ConfidentialPayouts | `0x4CC9Dd3b85Fa3E1D69f365f26eD80c9c1068A4A0` |
| USDC (Circle) | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Chainlink KeystoneForwarder / MockKeystoneForwarder | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` / `0xB9F79d863261869B234c481D1f9A7af84AeAd192` |

Keys that already exist and **must not be used for anything below**:
- the protocol deployer `0xDf93…9815`;
- the verifier `0xC7D1…893D` (it lives only in the Railway `signer` service);
- the corpus issuer `0x9a6A…e6b2`.

## 2. MON and USDC needed 👤

Prices measured on 6 Oct: 102 gwei, and Monad charges the gas **limit**.

| Wallet | For | Amount |
|---|---|---|
| A new throwaway key, the "CRE key" | Deploying `CorpusAudit` (1.21M gas, about 0.15 MON), plus a few `cre workflow simulate --broadcast` writes (600k limit, about 0.06 MON each) | **0.5 MON** |
| The demo agent `0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA` | x402 corpus pulls at 0.01 USDC each ([faucet.circle.com](https://faucet.circle.com), Monad testnet) | **1 USDC** |
| Your own Privy wallet (sign in with email on app.thenar.io) | Real runs. Payouts come from escrow; gas is free once sponsorship is on, otherwise about 0.05 MON per submit | 0 MON with sponsorship, else **0.3 MON** |
| A lab, if you post tasks from /post | The bounty escrow (slots × reward per run) plus gas | e.g. **0.1 MON** for 10 runs at 0.004 |

Monad testnet MON comes from faucet.monad.xyz.

## 3. Keys and where each one is set 👤

The user sets every secret. None of them is ever written into git, and none goes to a host it isn't listed for.

| Variable | Set on | From | Effect |
|---|---|---|---|
| `NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP=1` | **Vercel** (project `thenar`), at build time | Privy dashboard → gas sponsorship → enable Monad Testnet first (testnet subsidy: monad@privy.io) | Operators who signed in with email pay no gas |
| `ENVIO_GRAPHQL_URL` (`ENVIO_GRAPHQL_SECRET` only for a self-hosted Hasura) | **Railway `web`** | The Envio Cloud dashboard, after step 5 | The history on /leaderboard |
| `CORPUS_AUDIT=0x…` | **Railway `web`** | The address printed in step 4 | `/api/task/{id}/manifest` reports the DON's verdict |
| `ETHERSCAN_API_KEY` (optional) | **Railway `web`** | etherscan.io (the V2 API covers Monadscan) | Call history on /operator, /contracts and /portfolio |
| `CRE_ETH_PRIVATE_KEY` | `cre/.env` on this machine only | The throwaway CRE key from section 2 | Sends the simulated report |
| `DASHSCOPE_API_KEY` / `MOONSHOT_API_KEY` | `.env.local` on this machine only | Model Studio / platform.moonshot.ai | Runs the buyer agent on Qwen 3.8 Max or Kimi K2.6 |
| `AGENT_PRIVATE_KEY` | `.env.local` (already set) | — | The demo agent's wallet |

## 4. Deploy CorpusAudit (5 min) 👤 the CRE key

```bash
cd contracts
forge script script/DeployCorpusAudit.s.sol --rpc-url monad --broadcast --private-key <CRE key>
# prints: CorpusAudit 0x…   forwarder 0xB9F7…d192 (the simulation forwarder)
```

Put the address into `cre/corpus-audit/config.staging.json` as `corpusAudit`, and keep it for `CORPUS_AUDIT`.

## 5. Envio on Monad (15 min) 👤 Envio account

Follow [indexer/README.md → Host it on Envio Cloud](../indexer/README.md#host-it-on-envio-cloud-the-envio-bounty-route):
1. Root `indexer`, config `config.yaml`.
2. Env `ENVIO_THENAR_SKIP_MONAD=false` and `ENVIO_THENAR_SKIP_LOCAL=true`.
3. Push, then copy the GraphQL endpoint into `ENVIO_GRAPHQL_URL` (step 3).

Check it:

```bash
curl -s <endpoint> -H 'content-type: application/json' \
  -d '{"query":"{ Stats(where:{chainId:{_eq:10143}}){ tasks runs sales } }"}'
```

## 6. Chainlink CRE simulation (10 min) 👤 `cre login`

```bash
~/.cre/bin/cre login                     # opens the browser; finish signing in there
cp cre/.env.example cre/.env             # set CRE_ETH_PRIVATE_KEY to the CRE key
cd cre/corpus-audit && bun install && cd ..
cre workflow simulate corpus-audit --target staging-settings --non-interactive --trigger-index 0 --broadcast
```

Expect one verdict line per task in the logs, and a transaction to `CorpusAudit`. Read it back with
`cast call <CorpusAudit> "latest(uint256)((bytes32,bytes32,uint32,uint32,uint8,uint64,uint64))" 0 --rpc-url https://testnet-rpc.monad.xyz`.

## 7. Hosting (15 min)

Tell the other sessions that deploy thenar.io first: the "ETH online hackathon loss" session, and the coordinator.

```bash
node scripts/changelog.mjs && git add lib/changelog.json && git commit -m "Bring the changelog up to date with the history"
git push origin quest-web quest-web:main
railway up --project a0d40575-32d8-4d7f-bfda-80b8c1f0c001 --environment 6c661755-fbb8-42ac-a15e-05d4c65c9523 --service signer --detach
# wait for SUCCESS: railway deployment list --project … --environment … --service signer --json
railway up --project a0d40575-32d8-4d7f-bfda-80b8c1f0c001 --environment 6c661755-fbb8-42ac-a15e-05d4c65c9523 --service web --detach
# wait for SUCCESS, then:
vercel deploy --prod --yes
vercel ls thenar | head -4                # the newest Production row is Ready
```

Set the variables from step 3 **before** the `web` and Vercel deploys. `NEXT_PUBLIC_*` values are read at build time.

## 8. Smoke test (10 min)

```bash
BASE=https://app.thenar.io node --import ./test/register.mjs test/e2e.mjs   # expect all checks green
curl -s https://app.thenar.io/api/indexer | head -c 200                     # configured: true, stats for 10143
curl -s https://app.thenar.io/api/task/0/manifest | head -c 400             # "audit": {…} once step 6 has run
node --import ./test/register.mjs scripts/qwen-agent.mjs https://app.thenar.io   # with DASHSCOPE_API_KEY; pays 0.01 USDC
```

Then by hand:
1. Sign in with email on app.thenar.io and set up a passkey on /passkey.
2. Press *Derive my SO-101 key*. Do the same on a second device your passkey syncs to; the key is the same.
3. Drive /station/0 and submit. With sponsorship on, the station says the sponsor pays the gas.
4. Open the run page, and buy the corpus on /corpus.

## 9. The video (3 minutes or less) 👤

Shot list (the full script with timestamps is in [SUBMISSION.md](../SUBMISSION.md#demo-script-3-minutes)):

1. app.thenar.io: a task, its bounty, the station loading the scene.
2. Sign in with email (Privy), and the passkey on Face ID (Mera). /passkey shows the SO-101 key; the same key on a phone.
3. Drive the arm: keyboard, then the leader arm in hand, then the Quest 3S with the arm on the table.
4. Submit: the verdict, then paid in the same second on Monad. The explorer shows TrajectoryAccepted and the shares.
5. The agent: `scripts/qwen-agent.mjs` choosing, paying 0.01 USDC over x402, and verifying the sha256 against SalesLog.
6. /leaderboard history (Envio). `/api/task/0/manifest` with the DON's verdict (Chainlink CRE).
7. Close on the contracts page and the line "owned by the people who recorded it".
