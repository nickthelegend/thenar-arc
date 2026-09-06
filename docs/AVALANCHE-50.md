# 50 features that would use Avalanche for real

Ranked by how load-bearing Avalanche's own technology is. Re-verified 30 Aug
2026 against a deployment that now settles for real on Fuji — 8 tasks, 7
trajectories, 1 licensed policy, 6 contracts `exact_match` on Sourcify — which
changes nothing about the ranking, because none of that uses anything
Avalanche-specific. Tier 1 cannot be
built on a generic EVM chain at all. Tier 5 works anywhere and is included only
so the line is visible.

Capability keys: **L1** own Avalanche L1 (ACP-77) · **FEE** fee manager
precompile · **MINT** native minter precompile · **ALLOW** allowlist
precompiles · **RWD** reward manager · **ICM** Teleporter/interchain messaging ·
**WARP** Warp precompile + BLS aggregation · **ICTT** interchain token transfer ·
**GLA** Glacier/AvaCloud Data API · **eERC** encrypted ERC · **PCHAIN**
validator management · **CORE** Core wallet

---

## Tier 1 — impossible without Avalanche (1–12)

| # | Feature | Capability | Depth | Why a judge notices |
|---|---|---|---|---|
| 1 | **Zero-gas operator runs.** Thenar's own L1 with the fee manager set so the station contract costs an operator nothing. First run needs no AVAX, no faucet, no bridge. | L1 + FEE | Core | Answers the product's own stated blocker — "first-run cost has to be near zero" — with the exact mechanism Avalanche built for it |
| 2 | **Pay operators in a gas token they mint into.** Custom gas token on the L1; `submitTrajectory` pays in the same asset that pays for gas, so an operator's earnings *are* their gas budget. | L1 + MINT | Core | A self-funding economy that is structurally impossible on C-Chain |
| 3 | **Cross-chain licence settlement.** Policies live on the L1 where the work happened; a buyer licences from C-Chain and Teleporter carries the fee and the cap-table fan-out back. | ICM | Core | Uses the live Fuji messenger for the exact split it exists for: work on one chain, capital on another |
| 4 | **Corpus roots attested by the validator set.** The L1 signs a BLS attestation of a corpus Merkle root; C-Chain verifies it through Warp. Provenance secured by consensus, not by our server. | WARP | Core | The strongest possible answer to "why does this need a chain" |
| 5 | **Confidential operator earnings.** Per-run payouts as eERC encrypted balances so a rival lab cannot scrape who your best operators are, with a rotatable auditor for compliance. | eERC | Core | Avalanche's own confidential-token standard used for a real privacy need |
| 6 | **Validator-gated verifier.** The score signer is not our key but the L1's validator set; a run is only payable if a quorum signs the score. | PCHAIN + WARP | Core | Removes the single trusted key the whole economy currently rests on |
| 7 | **Buyer-owned data L1s.** A robotics lab launches its own Thenar L1 for proprietary tasks; the corpus root is published to the public chain via ICM without exposing the data. | L1 + ICM | Core | Enterprise story only Avalanche's L1 model supports |
| 8 | **Operator reputation as a native-minted reward stream.** Reward manager routes a slice of L1 fees to top-scoring operators automatically each epoch. | RWD | Core | Protocol-level incentive with no distribution contract to trust |
| 9 | **Permissioned task funders.** Deployer/tx allowlist precompiles mean only vetted funders can post tasks on a private L1, enforced by the chain not by our API. | ALLOW | Core | Governance enforced at the VM layer |
| 10 | **Portable corpus tokens.** A corpus licence as an ICTT token that moves between the Thenar L1 and C-Chain without a custodial bridge. | ICTT | Core | Canonical Avalanche bridging, not a wrapped-asset hack |
| 11 | **Multi-L1 leaderboard.** Operators run on whichever L1 their task lives on; a C-Chain aggregator reads all of them through ICM and ranks globally. | ICM + GLA | Core | Demonstrates the many-chains-one-product shape Avalanche argues for |
| 12 | **Fee-token rebate for accepted runs.** A rejected run costs gas, an accepted one is refunded by the fee manager — the chain itself prices quality. | FEE | Core | Economic design expressed in VM config |

## Tier 2 — Avalanche-specific services doing real work (13–26)

| # | Feature | Capability | Depth | Why a judge notices |
|---|---|---|---|---|
| 13 | **Portfolio from Glacier, not our DB.** Operator earnings history read from the Data API so it survives our server disappearing. | GLA | Core | Removes a trust dependency a judge will probe |
| 14 | **Corpus provenance explorer.** Every trajectory's tx, block and internal transfers rendered from Glacier, including the payout fan-out. | GLA | Core | Provenance a buyer can audit without our cooperation |
| 15 | **Licence fan-out receipts.** Glacier's internal-transaction endpoint shows each contributor's share from one licence call. | GLA | Deep | Makes the headline claim visually checkable |
| 16 | **Cold-start balance check.** Before a run, read the operator's native balance from Glacier and warn about gas without an RPC round trip. | GLA | Surface | Small, but real API usage in a real flow |
| 17 | **Cross-chain task bounties.** A funder escrows on C-Chain, the task runs on the L1, ICM moves the escrow. | ICM | Core | Buyers keep assets where they already are |
| 18 | **Interchain dispute window.** A buyer disputes a corpus from C-Chain; the message lands on the L1 and freezes the policy. | ICM | Core | Governance across chains, not a webhook |
| 19 | **Warp-verified dataset export.** The LeRobot export ships with a Warp signature any chain can verify. | WARP | Core | Portable provenance, no oracle |
| 20 | **eERC-priced private licences.** Licence fees paid confidentially so competitors cannot read what a lab paid for a corpus. | eERC | Core | Real commercial motive for confidentiality |
| 21 | **Validator-set snapshot in the cap table.** Policy mint records the validator set that attested the runs. | PCHAIN | Deep | Ties the economics to consensus |
| 22 | **Subnet-local task registry.** Tasks registered on the L1, mirrored to C-Chain by ICM for discovery. | ICM | Deep | Discovery without centralising the registry |
| 23 | **Glacier-backed anti-sybil.** Check an address's on-chain age and activity before granting run slots. | GLA | Deep | Sybil resistance from real chain history |
| 24 | **Webhook-driven feed.** AvaCloud webhooks push confirmed submits to the activity feed instead of polling. | GLA | Deep | Correct use of the platform's push infrastructure |
| 25 | **Core wallet subnet add.** One click adds the Thenar L1 to Core with the right gas token and explorer. | CORE | Surface | Onboarding judges will actually try |
| 26 | **ICTT payout in USDC.** Operators elect to be paid in bridged USDC rather than the gas token. | ICTT | Deep | Real payout UX, canonical bridge |

## Tier 3 — genuine but lighter Avalanche coupling (27–38)

| # | Feature | Capability | Depth |
|---|---|---|---|
| 27 | Snowtrace-verified contracts with source links on every hash | Explorer | Surface |
| 28 | Glacier NFT endpoint for policy certificates held by licensees | GLA | Deep |
| 29 | ERC-20 token-balance panel for funders, from Glacier | GLA | Surface |
| 30 | Block-time and finality telemetry surfaced in the station HUD | RPC | Surface |
| 31 | Fuji faucet deep link when an operator's balance is too low | Faucet | Surface |
| 32 | Multi-chain address resolution across C-Chain and L1s | GLA | Deep |
| 33 | Historical gas-price chart for funders sizing an escrow | GLA | Surface |
| 34 | ICM message-status tracker in the UI | ICM | Deep |
| 35 | Validator uptime shown beside corpus attestations | PCHAIN | Deep |
| 36 | Chain-agnostic task ids that survive an L1 migration | ICM | Deep |
| 37 | Glacier-sourced contributor list for a policy's cap table | GLA | Deep |
| 38 | Teleporter-relayed emergency pause across all Thenar chains | ICM | Deep |

## Tier 4 — Avalanche-flavoured, could be done elsewhere (39–46)

39 Core wallet as the default connector · 40 AVAX-denominated pricing display ·
41 Snowtrace links on every tx · 42 Fuji/mainnet environment switcher ·
43 Avalanche-branded network badge · 44 Chain-id guard on every write ·
45 Gas estimation panel before submit · 46 Explorer-linked internal transfers

## Tier 5 — swappable for any chain (47–50)

47 Wallet connect · 48 Transaction receipt polling · 49 Block explorer deep links ·
50 Native-token balance display

---

## What I would actually build, and in what order

**#1 and #2 together are the project.** The product document already names the
blocker — an operator with no wallet and no gas cannot take their first run —
and an Avalanche L1 with the fee manager and a custom gas token is the only
thing on this list that removes it rather than working around it. Build those
two and the answer to "why Avalanche" stops being a slide and becomes the
reason the product works.

**#3 and #13 are the cheapest credibility.** Teleporter is live on Fuji right
now and Glacier already indexes this contract — I verified both against our own
transactions today. Neither needs a new chain.

**Do not build #28, or anything that turns a trajectory into an NFT.** A
trajectory is a row in a Merkle log. Minting it would be a checkbox, and a
judge on this track will read it as one.
