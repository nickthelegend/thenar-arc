# Railway and Vercel — audit

The other three audits in this folder all reached the same verdict: imported,
absent, or generic. These two are different. **Both are genuinely used, and one
of them is load-bearing in a way the project could not work around.**

---

## 1. What each offers

**Railway** — container hosting with **persistent volumes**, a managed Postgres
if wanted, private networking between services, deploy-from-directory or from
git, logs, metrics, TCP proxies, and environment-scoped variables.

**Vercel** — edge-cached static hosting, serverless and edge functions, custom
domains with automatic TLS, immutable deployments with instant rollback and
alias promotion, build-time environment variables, and `rewrites` that proxy a
path to another origin.

## 2. Audit — strict

| | Classification | Evidence |
| --- | --- | --- |
| **Railway** | **GENUINELY USED — load-bearing** | The API service `web` (project `axon`) holds `AXON_DB_PATH=/data/axon.db` on volume `web-volume` mounted at `/data`. Verified: **20 trajectories and 1 uploaded prop survived a redeploy at 09:09 UTC today** — deployment `0aa3bd1e` SUCCESS, three prior ones REMOVED. |
| **Vercel** | **GENUINELY USED** | Serves `thenar.io` — `server: Vercel`, `x-vercel-cache: HIT`. Eight serverless routes under `app/api`. Custom domain, TLS, and alias promotion (`vercel promote`) is how the app is released. |

**Neither is faked and neither is decorative.** `next.config.ts:21` proxies
`/api/:path*` to `BACKEND_ORIGIN`, which is the exact seam between them:
Vercel serves the app, Railway owns the data.

## 3. Honest status

**Railway is the only third-party service in this project that cannot be
swapped without changing the architecture.** The comment at `next.config.ts:6`
states why: *"the API routes own a SQLite file on a persistent volume, which a
serverless host cannot keep."* That is a real constraint, correctly diagnosed,
and Railway's volume is the answer to it. Every trajectory, every signature and
every uploaded model lives there.

Vercel is genuinely used but genuinely replaceable — any static host with
serverless functions and a rewrite would do. Its distinctive contribution here
is immutable deployments with alias promotion, which this session leaned on
repeatedly to recover from a bad release.

## 4. Where deeper integration fits — and where it does not

**Railway, and it is the honest one.** SQLite on a single volume is a single
point of failure holding the only copy of every trajectory. Railway's managed
**Postgres** with automated backups is the correct next step, and the migration
is small because the schema is four tables. **Private networking** would also
let the verifier key live in a service the public app cannot reach.

**Vercel: nothing worth forcing.** Edge functions cannot help — every API route
needs the SQLite file. Image optimisation is irrelevant to a WebGL app. ISR is
irrelevant to a page that reads chain state per request. Proposing any of them
would be a checkbox, and I am not proposing them.

---

## 5. Fifty features that would use Railway for real

Ranked by how load-bearing Railway specifically is. Tier 1 needs a persistent,
stateful, always-on host. Tier 5 runs on any PaaS.

Keys: **VOL** persistent volume · **PG** managed Postgres · **NET** private
networking · **CRON** scheduled jobs · **LOG** logs & metrics · **SVC**
multi-service · **TCP** TCP proxy · **REPL** replicas

### Tier 1 — impossible on a serverless host (1–10)

| # | Feature | Uses | Depth | Why a judge notices |
|---|---|---|---|---|
| 1 | **The trajectory store itself.** Every 20 Hz sample of every run, on a volume that survives redeploys. Already shipped and verified today. | VOL | Core | It is the reason the CID resolves to anything at all |
| 2 | **Uploaded model store.** A funder's GLB kept beside the runs recorded against it, so a scene never goes missing. | VOL | Core | A scene whose model disappeared makes its runs unreproducible |
| 3 | **Postgres with backups.** Move off single-file SQLite so the only copy of the corpus is not one volume. | PG | Core | The most obvious question a reviewer asks about durability |
| 4 | **Verifier key isolation.** The EIP-712 signer in a private service the public app reaches over the internal network only. | NET + SVC | Core | Today the key sits in the same process that serves HTML |
| 5 | **Settlement reconciler.** A scheduled job that finds runs signed but never submitted and reconciles them against chain. | CRON | Core | `/api/reconcile` exists but nothing schedules it |
| 6 | **Corpus export worker.** Long-running LeRobot v3 export that would exceed any serverless timeout. | SVC | Core | Exports are minutes, not milliseconds |
| 7 | **Chain indexer as its own service.** A always-on process following logs, rather than polling from a request handler. | SVC + NET | Core | Removes the RPC rate-limit ceiling on every page load |
| 8 | **Nightly corpus snapshot to object storage.** Scheduled dump of the volume. | CRON + VOL | Core | Disaster recovery for the asset being sold |
| 9 | **WebSocket feed of live runs.** A persistent connection serverless cannot hold open. | SVC + TCP | Core | The multi-operator "space" needs this |
| 10 | **Replay verification worker.** Re-score every submitted trajectory out of band and flag disagreements. | SVC + CRON | Core | Turns the scoring claim into something continuously checked |

### Tier 2 — much better with it (11–24)

| # | Feature | Uses | Depth |
|---|---|---|---|
| 11 | Read replicas for the leaderboard | REPL + PG | Deep |
| 12 | Metrics-driven autoscale during a demo | LOG + REPL | Deep |
| 13 | Structured deploy logs tied to a run id | LOG | Deep |
| 14 | Staging environment sharing the schema | SVC | Deep |
| 15 | Volume-backed sample cache for replay | VOL | Deep |
| 16 | Scheduled anchor of the corpus root | CRON | Core |
| 17 | Private admin service, never publicly routed | NET | Core |
| 18 | Queue service for submit retries | SVC | Core |
| 19 | Postgres full-text search over instructions | PG | Deep |
| 20 | Per-task materialised stats view | PG | Deep |
| 21 | Backup restore drill as a job | CRON + PG | Deep |
| 22 | TCP proxy for a direct DB console | TCP | Surface |
| 23 | Log-based anti-sybil signal | LOG | Deep |
| 24 | Blue/green API rollout | SVC | Deep |

### Tier 3 — genuine but lighter (25–36)

25 Health endpoint wired to platform checks · 26 Deploy annotation on the feed ·
27 Env-scoped verifier keys · 28 Volume usage alerting · 29 Request tracing
across the rewrite seam · 30 Graceful shutdown draining in-flight submits ·
31 Memory metrics during export · 32 Restart policy tuning · 33 Region pinning
near the RPC · 34 Build cache for faster deploys · 35 Secret rotation without
redeploy · 36 Per-environment RPC endpoints

### Tier 4 — Railway-flavoured, replaceable (37–45)

37 One-command deploy from a directory · 38 Generated public domain ·
39 Environment variable UI · 40 Deploy rollback · 41 Log tailing ·
42 Service metrics dashboard · 43 Custom domain on the API · 44 Build from
Dockerfile · 45 Deploy notifications

### Tier 5 — any host would do (46–50)

46 HTTPS termination · 47 Env var injection · 48 Container restart on crash ·
49 A public URL · 50 Build on push

---

## What I would actually do

**#3 first.** SQLite on one volume currently holds the only copy of every
trajectory this project sells. Railway's managed Postgres with backups turns
the durability question from "trust us" into a configuration. The schema is
four tables; the migration is an afternoon.

**#5 is already half-built.** `/api/reconcile` exists and nothing calls it. A
scheduled job is one Railway feature away from closing a loop that is currently
manual.

**Vercel gets no list.** Nothing it offers beyond what is already used would
strengthen this product, and inventing fifty ways to use it would be exactly
the checkbox integration these audits exist to call out.
