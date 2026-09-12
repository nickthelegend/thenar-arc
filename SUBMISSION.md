# ETHOnline 2026 submission: Thenar on Arc

Deadline: **Sunday 13 September 2026, 12:00 pm EDT.**

A Continuity project. ETHOnline counts every track from one partner as a single
partner prize, and a project can take at most three partners, so this enters:

| Partner | Track | Why it fits |
| --- | --- | --- |
| Arc | Best DeFi or Agentic Application (Continuity) | Every bounty, payout, pot and fee is USDC on Arc, and gas comes out of the same balance |
| World | AgentKit Continuity | AgentKit decides who pays for the corpus; AgentBook is resolved on every challenge |
| Hedera | Continuity, and AI & Agentic Payments | A live x402-gated service settled by Blocky402, and an agent that has paid it twice |

The README has the architecture, every link, and a section on what is not
proven. This file maps each track's requirements to the evidence and holds the
video script.

---

## Arc — Best DeFi or Agentic Application (Continuity)

| Requirement | Evidence |
| --- | --- |
| Registered as a Continuity project | To do on ETHGlobal before submitting |
| Working frontend and backend | Next.js app: station, `/hub`, `/corpus`, `/contracts`, `/agents`; API routes for verification, settlement, corpus, agent payments |
| Architecture diagram | README, "Architecture" |
| Video and presentation on the use of Circle's tech | Script below, part 2 |
| Documentation | README, this file |
| Repo | https://github.com/nickthelegend/thenar-arc |

**Why Arc, specifically.** A robot-data bounty is a dollar amount, and on a
chain with a volatile gas token an operator paid 2 cents can lose it to gas.
On Arc the bounty a funder escrows, the payout an operator receives and the fee
to submit are one USDC balance: in each of the runs linked in the README, the
operator's balance rose by exactly the payout net of gas. The Solidity did not
change to get there; native value on Arc is USDC.

**Circle infrastructure used.** Arc Testnet (5042002) for every contract and
run; USDC as native gas and value; Arcscan for per-address call history in the
app; the Circle faucet for funding. Also confirmed on Arc: the P-256 precompile
at `0x0100` that passkey submission uses.

**Not used, said plainly:** Circle's Agent Stack and Circle Wallets. The agent
in this project pays on Hedera. Arc mainnet is not live, so the mainnet bonus is
out of reach.

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

## Hedera — Continuity, and AI & Agentic Payments

| Requirement | Evidence |
| --- | --- |
| Built for a previous hackathon | Monad Blitz Hyderabad V3, 3rd place |
| Substantive new work, new Hedera services | x402 paywall, Hedera accounts, settlement ledger — none of it existed before `e4f131d` |
| README separating before and after, with commits | README, "What existed before ETHOnline, and what is new" |
| Live x402-gated service on Hedera testnet, settled through Blocky402 | `GET /api/agent/corpus`; `accepts[0].extra.feePayer` is Blocky402's `0.0.7162784` |
| An agent completing a real paid request end to end | Two settlements: `0.0.7162784@1789279979.058986056` and `0.0.7162784@1789281472.024056054`, each 0.5 HBAR agent → treasury |
| README covering setup, architecture, and the payment flow | README, "Run it", "Architecture", "The payment flow, step by step" |
| Demo video, five minutes or less | Script below |

---

## Video script (under five minutes)

Record with the dev server on `http://localhost:3222`, a terminal beside it, and
Arcscan and Hashscan in tabs.

**0:00–0:30 — What it is.** "Thenar pays people to record robot-arm
demonstrations and sells the result as training data. It was built at Monad
Blitz; for ETHOnline it moved to Arc, and agents can now buy the data over
HTTP." Show `/hub`.

**0:30–1:45 — Arc: the run and the payout in one USDC balance.** Run
`node scripts/arc-run.mjs http://localhost:3222 1`. Point at: the arm check
(tool 0.0 mm from the payload), the verifier's score, the submit landing in
under a second, "paid 0.0225 USDC in that transaction; gas … USDC", and the
balance rising by exactly the payout net of gas. Open the Arcscan link. Say why
that matters: a two-cent bounty is only worth doing when gas is paid in the same
dollars.

**1:45–2:15 — The data is checked, not just paid for.** Open
`/api/dataset/summary?taskId=1`: 1 of 3 episodes trainable, with the reason for
the other two. "Those two are ours, from the first version of the script. They
are paid and on chain and still labelled unusable."

**2:15–3:45 — An agent buys the corpus.** Run
`node scripts/agent-buy.mjs http://localhost:3222 1`. Walk the log: AgentKit
detected, signed, retried, still 402 (AgentBook says no human), then paid; status
200; settled, with the Hedera transaction id. Open Hashscan: 0.5 HBAR from the
agent's account to the treasury, fee paid by Blocky402. Open `/agents`: the
terms, the lookup, the sale with its proof link.

**3:45–4:30 — World: the free path.** After registering the agent in AgentBook
with the Sandbox App, run the buyer again: "settled nothing: AgentKit granted
this pull". Show `/agents` → "Is a human behind this agent?" answering
human-backed, with free pulls used. If registration has not happened, say so
instead and show the lookup answering "not in AgentBook".

**4:30–5:00 — What is new.** `git log --oneline e4f131d..HEAD`. One sentence
each: Arc port, Hedera x402, World AgentKit. End on the "not proven" list.

---

## Before submitting

- [ ] Register the project as a Continuity project on ETHGlobal and disclose the
      pre-existing work (link the README section).
- [ ] Select Arc, World and Hedera. For Hedera, select both Continuity and AI &
      Agentic Payments; they count as one partner.
- [ ] Register the agent wallet in AgentBook with World App or the Sandbox App,
      rerun `scripts/agent-buy.mjs`, and confirm a free pull.
- [ ] Fill in the Developer Portal and Sandbox App sections of
      `docs/FEEDBACK-WORLD.md`, and submit it where World's track asks.
- [ ] Record the video from the script above and add its link to the README.
- [ ] Push the final commit and submit before 12:00 pm EDT.
