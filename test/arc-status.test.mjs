import test from "node:test";
import assert from "node:assert/strict";
import { ARC_STATUS, STATUS_LABEL } from "../lib/arc-status.ts";

// Only what docs/E2E-TESTNET.md shows on the public Arc testnet may be labelled live.
test("only the pieces proven on the public testnet are labelled live", () => {
  const live = Object.entries(ARC_STATUS).filter(([, s]) => s === "live").map(([k]) => k).sort();
  assert.deepEqual(live, ["finality", "usdc", "x402"]);
});

test("cross-chain and optional pieces are never labelled live", () => {
  for (const k of ["erc8004", "memo", "passkey", "cctp", "ccip", "gateway"]) assert.notEqual(ARC_STATUS[k], "live", k);
  assert.equal(ARC_STATUS.gateway, "none");
});

test("every status has a label", () => {
  for (const s of Object.values(ARC_STATUS)) assert.ok(STATUS_LABEL[s]);
});
