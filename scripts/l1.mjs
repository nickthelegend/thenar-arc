#!/usr/bin/env node
/**
 * Reproduce the three claims that need a chain of our own.
 *
 *   36  the chain mints its own gas token to an address holding nothing
 *   33  the fee manager sets what a run costs, at runtime
 *   32  a minted policy is delivered to a second chain by ICM
 *
 * Everything here reads back from the chain rather than reporting what was
 * sent. Run it against a local L1 brought up as l1/README.md describes:
 *
 *   L1_RPC=http://127.0.0.1:9656/ext/bc/<id>/rpc \
 *   CCHAIN_RPC=http://127.0.0.1:9650/ext/bc/C/rpc node scripts/l1.mjs
 */
import { readFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, parseAbi, parseEther, formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const L1_RPC = process.env.L1_RPC;
const CC_RPC = process.env.CCHAIN_RPC ?? "http://127.0.0.1:9650/ext/bc/C/rpc";
if (!L1_RPC) {
  console.error("L1_RPC is required. See l1/README.md for bringing the chain up.");
  process.exit(2);
}

const NATIVE_MINTER = "0x0200000000000000000000000000000000000001";
const FEE_MANAGER = "0x0200000000000000000000000000000000000003";
const TELEPORTER = "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf";
/** The well-known local test key, funded in the local network's C-Chain genesis. */
const EWOQ = "0x56289e99c94b6912bfc12adc093c9b51124f0dc54ac7a766b2bc5ccf558d8027";

const envOf = (f) =>
  Object.fromEntries(
    readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
  );

const minterAbi = parseAbi([
  "function mintNativeCoin(address addr, uint256 amount)",
  "function readAllowList(address addr) view returns (uint256)",
]);
const feeAbi = parseAbi([
  "function setFeeConfig(uint256 gasLimit, uint256 targetBlockRate, uint256 minBaseFee, uint256 targetGas, uint256 baseFeeChangeDenominator, uint256 minBlockGasCost, uint256 maxBlockGasCost, uint256 blockGasCostStep)",
  "function getFeeConfig() view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
  "function readAllowList(address addr) view returns (uint256)",
]);
const ROLE = ["None", "Enabled", "Admin", "Manager"];

const deployer = privateKeyToAccount(envOf(".env.deployer").DEPLOYER_PRIVATE_KEY);
const l1Chain = {
  id: Number(process.env.L1_CHAIN_ID ?? 88812),
  name: "Thenar L1",
  nativeCurrency: { name: "Thenar", symbol: "THN", decimals: 18 },
  rpcUrls: { default: { http: [L1_RPC] } },
};
const l1 = createPublicClient({ chain: l1Chain, transport: http() });
const l1w = createWalletClient({ account: deployer, chain: l1Chain, transport: http() });

/** Explicit fees throughout. A chain whose base fee is being changed underneath
 *  the run is exactly the one where an estimator's cached answer goes stale. */
async function fees() {
  const base = (await l1.getBlock()).baseFeePerGas ?? 1n;
  return { maxFeePerGas: base * 3n + 1_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };
}

// ------------------------------------------------------------------- 36
async function nativeToken() {
  console.log("\n36 — the chain issues its own gas token");
  const role = await l1.readContract({
    address: NATIVE_MINTER, abi: minterAbi, functionName: "readAllowList", args: [deployer.address],
  });
  console.log("  deployer on the native minter:", ROLE[Number(role)]);

  // A fresh address, so "held nothing" is a reading rather than a claim.
  const newcomer = privateKeyToAccount(
    `0x${Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(await l1.getBlockNumber())))).toString("hex")}`,
  );
  const before = await l1.getBalance({ address: newcomer.address });
  console.log("  newcomer holds:", formatEther(before), "THN");

  const treasuryBefore = await l1.getBalance({ address: deployer.address });
  const hash = await l1w.writeContract({
    address: NATIVE_MINTER, abi: minterAbi, functionName: "mintNativeCoin",
    args: [newcomer.address, parseEther("25")], gas: 200_000n, ...(await fees()),
  });
  const receipt = await l1.waitForTransactionReceipt({ hash, timeout: 90_000 });
  const after = await l1.getBalance({ address: newcomer.address });
  const treasuryAfter = await l1.getBalance({ address: deployer.address });
  const spentOnGas = receipt.gasUsed * receipt.effectiveGasPrice;

  console.log("  mint:", receipt.status, "-> newcomer holds", formatEther(after), "THN");
  console.log("  minter's balance moved by:",
    formatEther(treasuryAfter - treasuryBefore + spentOnGas), "THN besides gas");
  return after > before;
}

// ------------------------------------------------------------------- 33
async function feeFloor(target = 1_000_000n) {
  console.log("\n33 — the operator sets what a run costs");
  const role = await l1.readContract({
    address: FEE_MANAGER, abi: feeAbi, functionName: "readAllowList", args: [deployer.address],
  });
  console.log("  deployer on the fee manager:", ROLE[Number(role)]);

  const before = (await l1.getBlock()).baseFeePerGas ?? 0n;
  console.log("  base fee now:", before, "wei — a 21,000-gas run costs", formatEther(before * 21000n), "THN");

  const c = await l1.readContract({ address: FEE_MANAGER, abi: feeAbi, functionName: "getFeeConfig" });
  if (c[2] !== target) {
    // The floor only. Changing the denominator or the block gas cost alongside
    // it is what stopped the first L1 dead at a base fee of 1 wei.
    const { request } = await l1.simulateContract({
      address: FEE_MANAGER, abi: feeAbi, functionName: "setFeeConfig",
      args: [c[0], c[1], target, c[3], c[4], c[5], c[6], c[7]], account: deployer,
    });
    const r = await l1.waitForTransactionReceipt({
      hash: await l1w.writeContract({ ...request, gas: 300_000n, ...(await fees()) }), timeout: 90_000,
    });
    const now = await l1.readContract({ address: FEE_MANAGER, abi: feeAbi, functionName: "getFeeConfig" });
    console.log("  setFeeConfig:", r.status, "| minBaseFee", c[2], "->", now[2], "wei");
  } else {
    console.log("  minBaseFee already at", target, "wei");
  }

  // The floor is a floor. The live fee walks down to it one block at a time,
  // so the chain has to be kept busy for the reading to mean anything.
  let block = await l1.getBlock();
  for (let i = 0; i < 600 && (block.baseFeePerGas ?? 0n) > target; i++) {
    await l1.waitForTransactionReceipt({
      timeout: 60_000,
      hash: await l1w.sendTransaction({ to: deployer.address, value: 0n, gas: 21000n, ...(await fees()) }),
    });
    block = await l1.getBlock();
    if (i % 50 === 0) console.log(`    block ${block.number}: ${block.baseFeePerGas} wei`);
  }
  const after = block.baseFeePerGas ?? 0n;
  console.log("  base fee reached:", after, "wei at block", block.number);
  console.log("  the same run now costs:", formatEther(after * 21000n), "THN —",
    `${Math.round(Number(before) / Number(after || 1n))}x cheaper`);
  return after <= target;
}

// ------------------------------------------------------------------- 32
async function announce() {
  console.log("\n32 — a minted policy delivered to a second chain");
  const artifact = (p) => JSON.parse(readFileSync(p, "utf8"));
  const ANN = artifact("contracts/out/PolicyAnnouncer.sol/PolicyAnnouncer.json");
  const REG = artifact("contracts/out/PolicyRegistry.sol/PolicyRegistry.json");
  const AXON = artifact("contracts/out/AxonProtocolV2.sol/AxonProtocolV2.json");

  const ewoq = privateKeyToAccount(EWOQ);
  const cc = { id: Number(process.env.CCHAIN_ID ?? 1337), name: "Local C",
    nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
    rpcUrls: { default: { http: [CC_RPC] } } };
  const ccPub = createPublicClient({ chain: cc, transport: http() });
  const ccW = createWalletClient({ account: ewoq, chain: cc, transport: http() });
  const l1Ewoq = createWalletClient({ account: ewoq, chain: l1Chain, transport: http() });

  const warp = parseAbi(["function getBlockchainID() view returns (bytes32)"]);
  const ccId = await ccPub.readContract({ address: "0x0200000000000000000000000000000000000005", abi: warp, functionName: "getBlockchainID" });
  const l1Id = await l1.readContract({ address: "0x0200000000000000000000000000000000000005", abi: warp, functionName: "getBlockchainID" });
  console.log("  source chain:", ccId, "\n  destination :", l1Id);

  const deploy = async (pub, w, a, args, extra = {}) => {
    const h = await w.deployContract({ abi: a.abi, bytecode: a.bytecode.object, args, gas: 8_000_000n, ...extra });
    const r = await pub.waitForTransactionReceipt({ hash: h, timeout: 120_000 });
    if (r.status !== "success") throw new Error("deployment reverted");
    return r.contractAddress;
  };

  // A real policy, through the real mint path: a funded task, both slots filled
  // by verifier-signed runs whose hashes come out of the corpus.
  const verifier = privateKeyToAccount(envOf(".env.local").VERIFIER_PRIVATE_KEY.replace(/^"|"$/g, ""));
  const protocol = await deploy(ccPub, ccW, AXON, [verifier.address, ewoq.address, "0x0000000000000000000000000000000000000000"]);
  console.log("  protocol on the source chain:", protocol);

  await ccPub.waitForTransactionReceipt({ hash: await ccW.writeContract({
    address: protocol, abi: AXON.abi, functionName: "createTask",
    args: ["Cross-chain announcement", 2, parseEther("0.01"), 0, 1],
    value: parseEther("0.05"), gas: 1_000_000n }) });

  const runs = [
    { hash: "0xda3b44f41f141c3528c6e0909ffc3bcdf015b8008f2ce49c852fe69536ca0713", score: 9332 },
    { hash: "0x840db7dd8c281771b37535bb2755e2592b56a4683fd106b661749b934d6fa2a7", score: 9331 },
  ];
  const domain = { name: "Axon", version: "1", chainId: cc.id, verifyingContract: protocol };
  const types = { Run: [
    { name: "taskId", type: "uint256" }, { name: "contributor", type: "address" },
    { name: "trajHash", type: "bytes32" }, { name: "cid", type: "string" },
    { name: "score", type: "uint16" }] };
  for (const run of runs) {
    const cid = `corpus/${run.hash.slice(2, 10)}`;
    const signature = await verifier.signTypedData({ domain, types, primaryType: "Run",
      message: { taskId: 0n, contributor: ewoq.address, trajHash: run.hash, cid, score: run.score } });
    await ccPub.waitForTransactionReceipt({ hash: await ccW.writeContract({
      address: protocol, abi: AXON.abi, functionName: "submitTrajectory",
      args: [0n, run.hash, cid, run.score, signature], gas: 1_500_000n }) });
  }
  await ccPub.waitForTransactionReceipt({ hash: await ccW.writeContract({
    address: protocol, abi: AXON.abi, functionName: "mintPolicy",
    args: [0n, parseEther("0.5")], gas: 1_000_000n }) });
  const minted = await ccPub.readContract({ address: protocol, abi: AXON.abi, functionName: "getPolicy", args: [0n] });
  console.log("  policy 0 minted: task", minted.taskId, "|", minted.trajectories, "trajectories | fee",
    formatEther(minted.licenceFee));

  const announcer = await deploy(ccPub, ccW, ANN, [TELEPORTER, protocol]);
  const registry = await deploy(l1, l1Ewoq, REG, [TELEPORTER, ccId, announcer], await fees());
  console.log("  announcer:", announcer, "\n  registry :", registry);
  console.log("  the destination knows policy 0 beforehand:",
    await l1.readContract({ address: registry, abi: REG.abi, functionName: "knows", args: [0n] }));

  const r = await ccPub.waitForTransactionReceipt({ hash: await ccW.writeContract({
    address: announcer, abi: ANN.abi, functionName: "announce",
    args: [0n, l1Id, registry], gas: 1_000_000n }) });
  console.log("  announce():", r.status);

  for (let i = 0; i < 50; i++) {
    if (await l1.readContract({ address: registry, abi: REG.abi, functionName: "knows", args: [0n] })) {
      const got = await l1.readContract({ address: registry, abi: REG.abi, functionName: "getPolicy", args: [0n] });
      console.log("  delivered — the destination holds task", got.taskId, "|", got.trajectories,
        "trajectories | fee", formatEther(got.licenceFee));
      console.log("  minted at", got.mintedAt, "received at", got.receivedAt);
      return true;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("  not delivered — check the relayer log; a stale nonce looks the same as a real failure");
  return false;
}

const results = {
  36: await nativeToken(),
  33: await feeFloor(),
  32: await announce(),
};
console.log("\n" + Object.entries(results)
  .map(([n, ok]) => `${n}: ${ok ? "shown" : "NOT shown"}`).join("  |  "));
process.exit(Object.values(results).every(Boolean) ? 0 : 1);
