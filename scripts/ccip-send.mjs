/**
 * Buy a Thenar corpus licence on Arc from Base Sepolia or Ethereum Sepolia,
 * over Chainlink CCIP with the dollars moved by Circle CCTP V2.
 *
 *   node scripts/ccip-send.mjs buy <policyId> [amountUsdc] [--fast]     approve + ThenarCcipSender.buyLicence
 *   node scripts/ccip-send.mjs status <messageId>                         the CCIP message, from Chainlink's CCIP explorer
 *   node scripts/ccip-send.mjs order <orderId>                            the order as ThenarCcipReceiver on Arc holds it
 *
 * Env: CCIP_SOURCE (base-sepolia | ethereum-sepolia, default base-sepolia),
 * CCIP_SOURCE_RPC (default the chain's public RPC), CCIP_SENDER_ADDRESS (the
 * ThenarCcipSender DeploySender.s.sol put on that chain), BUYER_PRIVATE_KEY
 * (holds the source chain's USDC and a little ETH for the CCIP fee).
 * `amountUsdc` defaults to the policy's licence fee read on Arc.
 *
 * Testnets only: it refuses to run against any chain but Base Sepolia (84532)
 * and Ethereum Sepolia (11155111). The user runs it; nothing in Thenar does.
 */
import { createPublicClient, createWalletClient, formatEther, formatUnits, http, parseAbi, parseEventLogs, parseUnits } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { AXON_ABI } from "../lib/abi.ts";
import { THENAR_CCIP_RECEIVER_ABI } from "../lib/registry-abi.ts";
import { ADDR, appChain, env, need, transport } from "./arc.mjs";

const SOURCES = {
  "base-sepolia": { chain: baseSepolia, rpc: "https://sepolia.base.org", usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", explorer: "https://sepolia.basescan.org" },
  "ethereum-sepolia": { chain: sepolia, rpc: "https://ethereum-sepolia-rpc.publicnode.com", usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", explorer: "https://sepolia.etherscan.io" },
};
const ALLOWED_CHAINS = new Set([84532, 11155111]);
const ccipUrl = (id) => `https://ccip.chain.link/msg/${id}`;

const [cmd, arg, amountArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const fast = process.argv.includes("--fast");
const arc = createPublicClient({ chain: appChain, transport: transport() });

const STATUS = ["None", "Pending", "Licensed", "Cancelled", "Rejected"];

if (cmd === "status") {
  const id = need(arg, "a CCIP message id");
  const r = await fetch(`https://ccip.chain.link/api/h/atlas/message/${id}`, { headers: { accept: "application/json" } }).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => null) : null;
  if (j) {
    console.log(`message   ${id}`);
    console.log(`state     ${j.state ?? j.status ?? "unknown"}  from ${j.sourceNetworkName ?? "?"} to ${j.destNetworkName ?? "?"}`);
    if (j.receiptTransactionHash) console.log(`executed  ${j.receiptTransactionHash} on the destination`);
  } else {
    console.log(`message   ${id}: Chainlink's CCIP explorer API did not answer (${r?.status ?? "unreachable"}).`);
  }
  console.log(`explorer  ${ccipUrl(id)}`);
  process.exit(0);
}

if (cmd === "order") {
  const receiver = need(ADDR.ccipReceiver, "ThenarCcipReceiver's address");
  const o = await arc.readContract({ address: receiver, abi: THENAR_CCIP_RECEIVER_ABI, functionName: "getOrder", args: [need(arg, "an order id")] });
  console.log(`order     ${arg} on ${appChain.name}: ${STATUS[Number(o.status)]}, licensee ${o.licensee}, policy #${o.policyId}, ${formatUnits(o.amount, 6)} USDC`);
  process.exit(0);
}

if (cmd !== "buy") {
  console.error("usage: ccip-send.mjs buy <policyId> [amountUsdc] [--fast] | status <messageId> | order <orderId>");
  process.exit(1);
}

const key = env("CCIP_SOURCE") ?? "base-sepolia";
const src = SOURCES[key] ?? need(null, `CCIP_SOURCE must be ${Object.keys(SOURCES).join(" or ")}`);
const pub = createPublicClient({ chain: src.chain, transport: http(env("CCIP_SOURCE_RPC") ?? src.rpc) });
const chainId = await pub.getChainId();
if (!ALLOWED_CHAINS.has(chainId)) {
  console.error(`  Refusing: the source RPC is chain ${chainId}. This script only runs on Base Sepolia or Ethereum Sepolia.`);
  process.exit(1);
}
const SENDER = need(env("CCIP_SENDER_ADDRESS"), `CCIP_SENDER_ADDRESS (ThenarCcipSender on ${src.chain.name})`);
const buyer = privateKeyToAccount(need(env("BUYER_PRIVATE_KEY"), "BUYER_PRIVATE_KEY"));
const wallet = createWalletClient({ account: buyer, chain: src.chain, transport: http(env("CCIP_SOURCE_RPC") ?? src.rpc) });

const policyId = BigInt(need(arg, "a policy id"));
let amount;
if (amountArg) amount = parseUnits(amountArg, 6);
else {
  const p = await arc.readContract({ address: need(ADDR.protocol, "ThenarProtocol's address"), abi: AXON_ABI, functionName: "getPolicy", args: [policyId] });
  amount = BigInt(p.licenceFee);
}
// Fast: Circle's fast-transfer fee, capped at 1% (at least a cent). Standard: free, waits for source finality.
const maxFee = fast ? (amount / 100n > 10_000n ? amount / 100n : 10_000n) : 0n;
const minFinality = fast ? 1000 : 2000;

const SENDER_ABI = parseAbi([
  "function quote(uint256 policyId, uint256 amount) view returns (uint256)",
  "function buyLicence(uint256 policyId, uint256 amount, uint256 maxFee, uint32 minFinalityThreshold) payable returns (bytes32 messageId, bytes32 orderId)",
  "event LicenceOrdered(bytes32 indexed messageId, bytes32 indexed orderId, address indexed licensee, uint256 policyId, uint256 amount, uint256 maxFee, uint256 ccipFee)",
]);
const ERC20 = parseAbi(["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);

const [fee, held] = await Promise.all([
  pub.readContract({ address: SENDER, abi: SENDER_ABI, functionName: "quote", args: [policyId, amount], account: buyer }),
  pub.readContract({ address: src.usdc, abi: ERC20, functionName: "balanceOf", args: [buyer.address] }),
]);
console.log(`buyer     ${buyer.address} on ${src.chain.name}: ${formatUnits(held, 6)} USDC`);
console.log(`order     policy #${policyId} for ${formatUnits(amount, 6)} USDC (+ max CCTP fee ${formatUnits(maxFee, 6)}), CCIP fee ${formatEther(fee)} ETH`);
const total = amount + maxFee;
if (held < total) { console.error("  not enough USDC on the source chain (faucet.circle.com)"); process.exit(1); }

if ((await pub.readContract({ address: src.usdc, abi: ERC20, functionName: "allowance", args: [buyer.address, SENDER] })) < total) {
  const a = await wallet.writeContract({ address: src.usdc, abi: ERC20, functionName: "approve", args: [SENDER, total] });
  await pub.waitForTransactionReceipt({ hash: a });
  console.log(`approve   ${src.explorer}/tx/${a}`);
}
// A tenth over the quote for the fee moving between quote and inclusion; the sender refunds the rest.
const hash = await wallet.writeContract({ address: SENDER, abi: SENDER_ABI, functionName: "buyLicence", args: [policyId, amount, maxFee, minFinality], value: (fee * 11n) / 10n });
const r = await pub.waitForTransactionReceipt({ hash });
console.log(`sent      ${r.status}  ${src.explorer}/tx/${hash}`);
const [ev] = parseEventLogs({ abi: SENDER_ABI, logs: r.logs, eventName: "LicenceOrdered" });
if (!ev) process.exit(1);
console.log(`messageId ${ev.args.messageId}`);
console.log(`orderId   ${ev.args.orderId}`);
console.log(`ccip      ${ccipUrl(ev.args.messageId)}`);
console.log(`then      node scripts/ccip-send.mjs status ${ev.args.messageId}   |   node scripts/ccip-send.mjs order ${ev.args.orderId}`);
console.log("arc       once delivered, ThenarCcipReceiver licenses the policy; if the dollars land after the message, the audit keeper (scripts/keeper.mjs) executes the pending order");
