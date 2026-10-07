/**
 * Draw the card a link to this project unfurls into, as a file.
 *
 * Generated here rather than by a route. The route convention built locally,
 * appeared in the routes manifest, and returned 404 on the deployed host with
 * and without a pinned runtime — so this stops depending on the convention
 * entirely and writes a plain PNG into public/, which is the one kind of asset
 * every host serves the same way.
 *
 * The figures are read from the chain at generation time and the card says so.
 * A share card is a snapshot by nature; what it must not do is imply the
 * numbers are live, or quote numbers nobody can check. Both are on the card:
 * the date they were true, and the contract they came from.
 *
 *   node --import ./test/register.mjs scripts/og.mjs
 *
 * The chain, the address and the ABI are the app's own — scripts/monad.mjs and
 * lib/abi.ts — so the card cannot describe a deployment the site is not
 * reading. It used to carry its own copies of all three, and every move of
 * chain meant finding them.
 */
import { ImageResponse } from "next/og.js";
import React from "react";
import { writeFileSync } from "node:fs";
import { createPublicClient, formatEther } from "viem";
import { AXON_ABI as abi } from "../lib/abi.ts";
import { appChain as chain, transport, ADDR, need } from "./monad.mjs";

const h = React.createElement;

const AXON = need(ADDR.axon, "AxonProtocolV2's address (lib/deployment.ts, or NEXT_PUBLIC_AXON_ADDRESS)");

const pub = createPublicClient({ chain, transport: transport() });
const [tasks, runs, policies] = await Promise.all([
  pub.readContract({ address: AXON, abi, functionName: "taskCount" }),
  pub.readContract({ address: AXON, abi, functionName: "trajectoryCount" }),
  pub.readContract({ address: AXON, abi, functionName: "policyCount" }),
]);

// One multicall rather than a read per task: the escrow is a sum over storage,
// and Monad's public endpoints would rather answer one request than a hundred.
const rows = await pub.multicall({
  allowFailure: false,
  contracts: Array.from({ length: Number(tasks) }, (_, i) => ({
    address: AXON, abi, functionName: "getTask", args: [BigInt(i)],
  })),
});
const escrow = rows.reduce((sum, t) => sum + t.escrow, 0n);

const INK = "#000000";
const RULE = "#262626";
const SCRIBE = "#8F8F8F";
const PAPER = "#FFFFFF";
const SIGNAL = "#FF6A00";

const asOf = new Date().toISOString().slice(0, 10);

// Satori needs an explicit display on any element with more than one child,
// and gives no hint which element is missing it — so every container here
// declares one rather than relying on a default that does not exist.
const stat = (key, label, value, accent) =>
  h("div", { key, style: { display: "flex", flexDirection: "column", gap: 10 } }, [
    h("div", {
      key: "l",
      style: {
        fontSize: 17, letterSpacing: 3, color: SCRIBE, textTransform: "uppercase",
      },
    }, label),
    h("div", {
      key: "v",
      style: { fontSize: 54, color: accent ?? PAPER, lineHeight: 1 },
    }, value),
  ]);

const el = h("div", {
  style: {
    display: "flex", flexDirection: "column", width: "100%", height: "100%",
    background: INK, color: PAPER, padding: "62px 74px",
    fontFamily: "sans-serif", justifyContent: "space-between",
  },
}, [
  h("div", { key: "top", style: { display: "flex", flexDirection: "column", gap: 22 } }, [
    h("div", {
      key: "eyebrow",
      style: { display: "flex", fontSize: 20, letterSpacing: 6, color: SIGNAL, textTransform: "uppercase" },
    }, "Thenar"),
    h("div", {
      key: "claim",
      style: { display: "flex", fontSize: 56, lineHeight: 1.1, maxWidth: 880, letterSpacing: -1 },
    }, "Crowdsourced robot manipulation data, settled on chain per run."),
    h("div", {
      key: "sub",
      style: { display: "flex", fontSize: 23, color: SCRIBE, maxWidth: 840, lineHeight: 1.45 },
    }, "Everyone else anchors a receipt. An accepted trajectory is paid for in the call that records it."),
  ]),

  h("div", { key: "rule", style: { display: "flex", height: 1, background: RULE, width: "100%", marginTop: 6, marginBottom: 6 } }),

  h("div", { key: "stats", style: { display: "flex", gap: 68 } }, [
    stat("a", "Tasks funded", String(tasks)),
    stat("b", "Runs paid", String(runs)),
    stat("c", "Policies", String(policies)),
    stat("d", "Escrow", `${Number(formatEther(escrow)).toFixed(3)} ${chain.nativeCurrency.symbol}`, SIGNAL),
  ]),

  h("div", {
    key: "foot",
    style: { display: "flex", fontSize: 16, color: SCRIBE, letterSpacing: 0.5 },
  }, `${chain.name} · ${AXON} · read from the contract on ${asOf}`),
]);

const res = new ImageResponse(el, { width: 1200, height: 630 });
const buf = Buffer.from(await res.arrayBuffer());
writeFileSync("public/og.png", buf);
console.log(`public/og.png — ${buf.length} bytes · ${tasks} tasks, ${runs} runs, ${policies} policies, ${formatEther(escrow)} ${chain.nativeCurrency.symbol} escrow, as of ${asOf}`);
