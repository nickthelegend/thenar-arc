# ETHOnline 2026 submission: Thenar

Deadline: **Sunday 13 September 2026, 12:00 pm EDT.**

A Continuity project. ETHOnline counts every track from one partner as a single
partner prize, and a project can take at most three partners, so this enters:

| Partner | Tracks | Why it fits |
| --- | --- | --- |
| Hedera | Continuity, and AI & Agentic Payments | A live x402-gated service settled by Blocky402, an agent that has paid it three times, and a Consensus Service log of every sale |
| World | AgentKit Continuity | AgentKit decides which agents pay for the corpus; AgentBook is resolved on every challenge |
| Privy | Best B2B financial product, and Best financial flow | Operators sign in with Privy, and a lab's budget is a Privy wallet whose policy only lets it fund bounties |

Arc is where runs are recorded and paid, in USDC. It is infrastructure here, not
a prize entry.

**Eligibility risk, stated plainly:** Privy's page lists no Continuity track, and
Thenar existed before the event. Whether its Privy work can be judged for
Privy's prizes is for ETHGlobal and Privy to decide; ask in the partner channel
before relying on it.

The README has the architecture, every link, and a section on what is not
proven. This file maps each track's requirements to the evidence and holds the
video script.

---

## Hedera — Continuity, and AI & Agentic Payments

| Requirement | Evidence |
| --- | --- |
| Built for a previous hackathon | Monad Blitz Hyderabad V3, 3rd place |
| Substantive new work, new Hedera services | x402 paywall settled by Blocky402, Hedera accounts, and a Consensus Service sales log — none of it existed before `e4f131d` |
| README separating before and after, with commits | README, "What existed before ETHOnline, and what is new" |
| Live x402-gated service on Hedera testnet, settled through Blocky402 | `GET /api/agent/corpus`; `accepts[0].extra.feePayer` is Blocky402's `0.0.7162784` |
| An agent completing a real paid request end to end | Three settlements, each 0.5 HBAR agent → treasury: `0.0.7162784@1789279979.058986056`, `0.0.7162784@1789281472.024056054`, `0.0.7162784@1789282116.389653271` |
| Extra points: verifiable audit trail | Every pull is posted to Consensus Service topic `0.0.10519262` with the sha256 of the served file; the agent checks its copy against the mirror node (message #1 matches) |
| README covering setup, architecture, and the payment flow | README, "Run it", "Architecture", "The payment flow, step by step" |
| Demo video, five minutes or less | Script below |

---

## World — AgentKit Continuity

| Requirement | Evidence |
| --- | --- |
| Uses AgentKit in a meaningful way | It is the difference between an agent paying and not: `createAgentkitHooks` in `free-trial` mode in front of the paid corpus route, `createAgentkitClient` in the buyer |
| Shows a working app | `/agents` page; `scripts/agent-buy.mjs` against the live route |
| Registers or resolves agents through AgentBook | Every AgentKit challenge is resolved with `lookupHuman` on World Chain; `/api/agent/status` exposes the same lookup |
| Tested with the World ID Sandbox App | To do: register `0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA`, then rerun the buyer and show a free pull |
| Feedback document | [docs/FEEDBACK-WORLD.md](docs/FEEDBACK-WORLD.md) — integration sections written; Developer Portal and Sandbox App sections to be filled in after registering |

---

## Privy — Best B2B financial product

| Requirement | Evidence |
| --- | --- |
| Privy as a core part of the product | Operators sign in through Privy (email makes an embedded wallet on Arc); a lab's data budget is a Privy wallet |
| Create or use at least one Privy wallet | Server wallet `t3f4kq36uzu0zieqd5i425p0` (`0x7b4d4a773fCA1E20D2361411B34655210E44E51a`), created with its policy attached |
| A business or organisation use case | A robotics lab paying for demonstrations without anyone holding the key that pays |
| A functional B2B workflow | Treasury operation: posting a bounty from the lab budget — `/lab`, `/api/lab`, `scripts/privy-lab.mjs`. Task #5 was funded this way. |
| At least one Privy control | Policy `sf7wzkldy5364a56jol16spa`: `to` must be AxonProtocolV2, `chain_id` 5042002, `value` ≤ 1 USDC. Asked to send 0.01 USDC elsewhere, Privy answered `policy_violation` and signed nothing. |
| Working demo and source | `/lab`; this repository |

## Privy — Best financial flow

| Requirement | Evidence |
| --- | --- |
| Privy as a core part, and a Privy wallet | As above |
| One functional financial flow using a generally available Privy feature | 0.4 USDC moved from the Privy wallet into escrow on Arc, in a transaction signed with Privy's `eth_signTransaction` under a policy: [`0x7a7c387f…`](https://testnet.arcscan.app/tx/0x7a7c387f00110499e4e2c4d6665bb120ecbe7db716012d8a35338797f6d9291c) |
| Working demo and source | `/lab`; this repository |

Not yet demonstrated: an operator's Privy embedded wallet receiving a payout.
The sign-in is wired, but it has not been exercised in a browser.

---

## Video script (under five minutes)

Record with the dev server on `http://localhost:3222`, a terminal beside it, and
Arcscan and Hashscan in tabs.

**0:00–0:30 — What it is.** "Thenar pays people to record robot-arm
demonstrations and sells the result as training data. Labs fund it from a Privy
wallet, runs are paid in USDC on Arc, and agents buy the data over HTTP on
Hedera." Show `/hub`.

**0:30–1:40 — Privy: a lab's budget that can only fund bounties.** Open `/lab`.
Point at the policy, read back from Privy: AxonProtocolV2 only, Arc only, at most
one USDC. Post a bounty of 2 runs at 0.1 USDC: signed by Privy, settled on Arc,
new task, Arcscan link. Raise the runs until the escrow is over one USDC and post
again: refused by Privy. Then "Send 0.01 USDC" to any address: refused, nothing
signed.

**1:40–2:10 — Privy sign-in.** Click Connect, sign in with an email, and show the
embedded wallet address in the nav. If sign-in does not work on the day, skip
this and say so.

**2:10–3:30 — Hedera: an agent buys the corpus.** Run
`node scripts/agent-buy.mjs http://localhost:3222 1`. Walk the log: AgentKit
detected, signed, retried, still 402 (AgentBook says no human), then paid; status
200; settled, with the Hedera transaction id; then the audit line — the sales
topic's newest message logs the same sha256 as the file the agent received. Open
Hashscan: 0.5 HBAR from the agent's account to the treasury, fee paid by
Blocky402. Open `/agents`: the terms, the sales topic, the sale with its
settlement and log links.

**3:30–4:20 — World: the free path.** After registering the agent in AgentBook
with the Sandbox App, run the buyer again: "settled nothing: AgentKit granted
this pull". Show `/agents` → "Is a human behind this agent?" answering
human-backed. If registration has not happened, say so and show the lookup
answering "not in AgentBook".

**4:20–5:00 — What is new.** `git log --oneline e4f131d..HEAD`. One sentence
each: Privy, Hedera, World. End on the "not proven" list.

---

## Before submitting

- [ ] Register the project as a Continuity project on ETHGlobal and disclose the
      pre-existing work (link the README section).
- [ ] Select Hedera (Continuity and AI & Agentic Payments), World (AgentKit
      Continuity) and Privy (both tracks). Each partner counts once.
- [ ] Ask in Privy's partner channel whether a Continuity project is eligible.
- [ ] Register the agent wallet in AgentBook with World App or the Sandbox App,
      rerun `scripts/agent-buy.mjs`, and confirm a free pull.
- [ ] Fill in the Developer Portal and Sandbox App sections of
      `docs/FEEDBACK-WORLD.md`, and submit it where World's track asks.
- [ ] Open `/lab` and sign in once with Privy in a browser before recording.
- [ ] Record the video from the script above and add its link to the README.
- [ ] Push the final commit and submit before 12:00 pm EDT.
