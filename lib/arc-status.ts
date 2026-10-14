/**
 * How far each piece of the Arc stack has actually been exercised.
 *
 *  live  Real transactions on the public Arc testnet (docs/E2E-TESTNET.md).
 *  fork  Run on a local fork of Arc testnet (Circle's Arc Foundry) or with
 *        Chainlink Local; never sent on the public network.
 *  none  Code and tests exist; never run end to end.
 *
 * One place, so the landing page, /arc and the README cannot drift apart.
 */
import { IS_MAINNET } from "./chain";

export type StackStatus = "live" | "fork" | "none";

export const STATUS_LABEL: Record<StackStatus, string> = {
  live: IS_MAINNET ? "Earlier live proof" : "Live (testnet)",
  fork: "Fork",
  none: "Not run",
};

export const STATUS_HELP: Record<StackStatus, string> = {
  live: IS_MAINNET ? "Earlier network verification is documented in the repository. Mainnet reads are shown separately." : "Real transactions on the public Arc testnet; explorer links in docs/E2E-TESTNET.md.",
  fork: "Run on a local Arc fork or with Chainlink Local; not sent on the public network.",
  none: "Code and tests exist; not run end to end.",
};

export const ARC_STATUS = {
  usdc: "live",
  finality: "live",
  x402: "live",
  erc8004: "fork",
  memo: "fork",
  passkey: "fork",
  cctp: "fork",
  ccip: "fork",
  gateway: "none",
} as const satisfies Record<string, StackStatus>;
