# Is WalletConnect / Reown actually used here?

Short answer: **imported, deliberately disabled, and the app is unusable on a
phone because of it.** Verified in the live browser, not by grep.

---

## 1. What Reown actually offers

Reown is WalletConnect's successor branding. The relevant surface:

| Product | What it does |
| --- | --- |
| **Sign API (WalletConnect v2)** | Pairing, sessions, namespaces, chain switching over a relay. This is what "connect a mobile wallet to a desktop dApp" means |
| **AppKit** (was Web3Modal) | The connect modal, plus email and social login, and smart-account onboarding |
| **WalletKit** (was Web3Wallet) | The other side, for people building wallets |
| **Cloud** | Issues the `projectId` every one of the above requires, plus connection analytics |
| **Notify API / Web3Inbox** | Push notifications delivered to a wallet, subscribed per dApp |
| **SIWE / one-click auth** | Sign-In With Ethereum bound to a session, so an app authenticates once rather than per action |
| **Smart Sessions / session keys** | Scoped, time-boxed permission to act without a signature per action |
| **Link Mode** | Deep-link pairing that skips the relay round trip on mobile |

Every one of them requires a **`projectId`** from Reown Cloud. It is free.

## 2. Audit — strict, and run in the browser

| Classification | Finding |
| --- | --- |
| **IMPORTED BUT UNUSED** | `@rainbow-me/rainbowkit@2.2.11` is a dependency and `lib/wagmi.ts:8` imports `walletConnectWallet`, `metaMaskWallet` and `rainbowWallet`. None of them are offered. `lib/wagmi.ts:14` reads `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, which is set **nowhere** — not in `vercel.json`, not on the Railway service, not in any `.env`. With no id the group is empty by construction (`lib/wagmi.ts:16`). |
| **GENUINELY USED** | Nothing from WalletConnect. RainbowKit is used only as a connector registry for `injectedWallet` and `coinbaseWallet`, neither of which touches the protocol. |
| **FAKED** | Nothing. The code is honest about it: the comment at `lib/wagmi.ts:12` says these wallets "would open a modal that can never pair, so they are only offered when the id is present." That is the correct behaviour for a missing credential. |
| **MISSING** | Sign API, AppKit, Notify, SIWE, smart sessions, Link Mode — the entire surface. |

**Verified live on `thenar.io/hub`:** opening the connect modal offers exactly
**"Browser Wallet"** and **"Coinbase"**. Resource timing shows requests to
`thenar.io` and `api.avax-test.network` only — **zero** to any
`walletconnect`, `reown` or `relay` host.

## 3. Honest status

Not used, and the omission has a cost the project has not accounted for.
`injectedWallet` requires an extension, which mobile browsers do not have.
`coinbaseWallet` covers one app. **WalletConnect is the standard path for every
other mobile wallet, so an operator on a phone currently cannot connect at
all** — on a product whose stated audience is "anyone with a browser and no
robotics hardware."

This is a one-line fix blocked on a credential: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
from cloud.reown.com. I cannot create an account to obtain one, so this gap
stays open and is reported rather than worked around.

## 4. Where it genuinely fits — and where it would be forced

**Mobile connection (essential, not optional).** Above. The product targets
people with only a browser; half of them are holding a phone.

**The five-run signature problem (the strongest organic fit).** The contract
caps an operator at five runs per task and `PRODUCT.md` says the work is
"closer to a rhythm game than to data entry." Every submit is a wallet
signature — five modal interruptions in a session that is supposed to feel
continuous. **Smart sessions** are built for exactly this: scope a key to
`submitTrajectory` on one task, cap it at five calls and twenty minutes, and
the operator signs once.

**Run settled while you are away.** Async settlement plus the **Notify API**
means an operator who closes the tab still learns their run was accepted and
paid, in their wallet, without an email list.

**Where it would be forced, and I am not proposing it:** AppKit's on-ramp and
swap widgets (this app pays out, it does not sell tokens), and social/email
login (an operator needs an address to be paid to; hiding the wallet behind a
social login adds a custody question the project has no answer for).

---

## 5. Fifty features that would use Reown for real

Ranked by how load-bearing the protocol is. Tier 1 is impossible without it.
Tier 5 is a modal you could hand-roll.

Keys: **SIGN** Sign API / relay sessions · **SESS** smart sessions / session
keys · **NOTIFY** Notify API · **SIWE** one-click auth · **APPKIT** AppKit
modal · **LINK** Link Mode · **CLOUD** Cloud analytics · **NS** namespaces &
chain switching

### Tier 1 — the product does not work without these (1–10)

| # | Feature | Uses | Depth | Why a judge notices |
|---|---|---|---|---|
| 1 | **Operate from a phone.** Pair any mobile wallet by QR or deep link. Today a phone user cannot connect at all. | SIGN | Core | It is the difference between the stated audience being reachable and not |
| 2 | **Sign once, run five times.** A session key scoped to `submitTrajectory` on one task, capped at five calls and twenty minutes. | SESS | Core | Removes five modal interruptions from a flow that is meant to feel like a game |
| 3 | **Run settled while you were away.** Push the acceptance and payout to the operator's wallet after they close the tab. | NOTIFY | Core | Async settlement finally has somewhere to land |
| 4 | **One-click session auth.** SIWE binds the wallet to a session so the API trusts the operator without a signature per request. | SIWE | Core | Replaces an address passed in a request body with something actually authenticated |
| 5 | **Link Mode on mobile.** Skip the relay round trip so a submit on a phone confirms in one hop. | LINK | Core | Directly attacks the latency the product's success criterion depends on |
| 6 | **Wallet-side chain switching.** Move an operator from any chain to Fuji through the session's namespaces, not a manual network prompt. | NS | Core | The current "Switch to Avalanche" button is a dead end if the wallet is mobile |
| 7 | **Funder approvals from a hardware wallet on a phone.** A task funder escrowing real value pairs a hardware wallet over the relay. | SIGN | Core | Escrow is the one place a hot browser key is unacceptable |
| 8 | **Session revocation on suspicion.** Revoke a session key the moment anti-sybil flags an operator, without waiting for it to expire. | SESS | Core | Scoped permission with a kill switch is the whole argument for session keys |
| 9 | **Task-follow notifications.** An operator subscribes to a task and is pushed a message when slots open. | NOTIFY | Core | Turns a one-off visit into a returning operator |
| 10 | **Multi-wallet operator identity.** One session spanning the wallet that runs and the wallet that gets paid. | SIGN + NS | Core | Separates the hot key from the treasury address |

### Tier 2 — strongly better with it (11–24)

| # | Feature | Uses | Depth |
|---|---|---|---|
| 11 | Licence purchase from a mobile buyer's wallet | SIGN | Core |
| 12 | Session-scoped auto-submit for consecutive runs | SESS | Core |
| 13 | Push on licence payout to every contributor | NOTIFY | Core |
| 14 | SIWE-gated portfolio, so earnings are private to the owner | SIWE | Core |
| 15 | Reconnect without re-pairing after a refresh | SIGN | Deep |
| 16 | Wallet-native transaction preview before a submit | SIGN | Deep |
| 17 | Per-wallet run history keyed to the authenticated session | SIWE | Deep |
| 18 | Notify a funder when their task fills | NOTIFY | Deep |
| 19 | Session budget cap in AVAX per sitting | SESS | Core |
| 20 | Deep link straight into a task from a wallet browser | LINK | Deep |
| 21 | Connection funnel analytics to find where operators drop | CLOUD | Deep |
| 22 | Namespace-declared contract allowlist for the session | NS | Deep |
| 23 | Cross-device handoff — start on desktop, submit on phone | SIGN | Core |
| 24 | Push a dispute notice to the contributor's wallet | NOTIFY | Deep |

### Tier 3 — genuine but lighter (25–36)

25 MetaMask and Rainbow in the modal at all · 26 AppKit theming to the
industrial palette · 27 Recent-wallet memory across visits · 28 QR pairing on
desktop · 29 Session expiry countdown in the HUD · 30 Wallet capability
detection before offering a flow · 31 Graceful relay-outage message ·
32 Pending-request indicator while the wallet is deciding · 33 Chain mismatch
resolved in-wallet · 34 Multi-account switcher · 35 Connection retry with
backoff · 36 Session metadata naming the exact task being authorised

### Tier 4 — Reown-flavoured, replaceable (37–45)

37 Branded connect button · 38 Wallet logos in the modal · 39 ENS-style name
display · 40 Balance in the nav from the session · 41 Disconnect control ·
42 Copy-address affordance · 43 Explorer link for the connected account ·
44 Avatar from the wallet · 45 "Installed" versus "More" grouping

### Tier 5 — swappable for anything (46–50)

46 A connect modal at all · 47 Storing the last connector · 48 Address
truncation · 49 Network badge · 50 Connected/disconnected state

---

## What I would actually do

**#1 is not a feature, it is a bug fix.** The product says "anyone with a
browser." A phone browser has no extension, so today that sentence is false.
One environment variable makes it true.

**#2 is the one a judge would remember.** Five signatures in a session that is
supposed to feel like a rhythm game is the kind of friction everyone accepts
and nobody fixes. Smart sessions fix it, and the five-run cap is already in the
contract to scope against.

**Blocked, and staying blocked:** all of it needs a `projectId` from
cloud.reown.com. I cannot create that account. It is free and takes a minute,
and it is the single highest-value credential missing from this project.
