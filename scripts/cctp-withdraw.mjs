/**
 * Take Arc earnings to another chain with Circle CCTP V2: burn USDC on Arc,
 * wait for Circle's Iris to attest the burn, and print the one call that mints
 * it on the destination.
 *
 *   node --import ./test/register.mjs scripts/cctp-withdraw.mjs <amountUsdc> <destination> [recipient] [--fast] [--no-wait]
 *
 *   destination   base-sepolia | ethereum-sepolia | arbitrum-sepolia (testnet)
 *                 base | ethereum | arbitrum (mainnet; also needs --yes)
 *   recipient     address on the destination (default: the sender)
 *   --fast        fast transfer (attests in seconds, fee ≤ maxFee); default standard (free)
 *
 * Signs with WITHDRAW_PRIVATE_KEY (the operator's key). Approves
 * TokenMessengerV2 for exactly the amount, then depositForBurn. On the local
 * fork the burn is real on the fork, but Iris only watches the public chain,
 * so there is no attestation to wait for: it says so and stops.
 */
import { createPublicClient, createWalletClient, formatUnits, getAddress, parseAbi, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CCTP_DESTINATIONS, TOKEN_MESSENGER_V2_ABI, irisMessagesUrl, parseIrisMessages, planCctpWithdraw } from "../lib/cctp.ts";
import { ARC, LOCALNET, NETWORK, env, appChain, need, transport, txUrl } from "./arc.mjs";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const [amountArg, destArg, recipientArg] = argv.filter((a) => !a.startsWith("--"));
const cctpNet = NETWORK === "mainnet" ? "mainnet" : "testnet";
const destinations = CCTP_DESTINATIONS[cctpNet];
const destination = destinations.find((d) => d.key === destArg);
if (!amountArg || !destination) {
  console.error(`usage: cctp-withdraw.mjs <amountUsdc> <${destinations.map((d) => d.key).join("|")}> [recipient] [--fast] [--no-wait]`);
  process.exit(1);
}
if (NETWORK === "mainnet" && !flags.has("--yes")) {
  console.error("  This burns real USDC on Arc mainnet. Re-run with --yes if that is what you mean.");
  process.exit(1);
}

const account = privateKeyToAccount(need(env("WITHDRAW_PRIVATE_KEY"), "WITHDRAW_PRIVATE_KEY (the key whose USDC to withdraw)"));
const recipient = getAddress(recipientArg ?? account.address);
const amount = parseUnits(amountArg, 6);
const plan = planCctpWithdraw(cctpNet, { destination, amount, recipient, fast: flags.has("--fast") });

const pub = createPublicClient({ chain: appChain, transport: transport(), pollingInterval: 500 });
const wallet = createWalletClient({ account, chain: appChain, transport: transport() });
const ERC20 = parseAbi(["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);
const messenger = ARC.tokenMessengerV2 ?? plan.tokenMessenger;

const held = await pub.readContract({ address: ARC.usdc, abi: ERC20, functionName: "balanceOf", args: [account.address] });
console.log(`withdraw  ${formatUnits(amount, 6)} USDC from ${account.address} (${formatUnits(held, 6)} held) on ${appChain.name}`);
console.log(`to        ${recipient} on ${destination.name} (CCTP domain ${destination.cctpDomain}), ${plan.minFinalityThreshold === 1000 ? `fast, max fee ${formatUnits(plan.maxFee, 6)} USDC` : "standard, no fee"}`);
if (held < amount) { console.error("  not enough USDC"); process.exit(1); }

if ((await pub.readContract({ address: ARC.usdc, abi: ERC20, functionName: "allowance", args: [account.address, messenger] })) < amount) {
  const a = await wallet.writeContract({ address: ARC.usdc, abi: ERC20, functionName: "approve", args: [messenger, amount] });
  await pub.waitForTransactionReceipt({ hash: a });
  console.log(`approve   TokenMessengerV2 for ${formatUnits(amount, 6)} USDC  ${txUrl(a)}`);
}
const burn = await wallet.writeContract({ address: messenger, abi: TOKEN_MESSENGER_V2_ABI, functionName: "depositForBurn", args: plan.args });
const r = await pub.waitForTransactionReceipt({ hash: burn });
console.log(`burned    ${r.status} in block ${r.blockNumber} (final on inclusion)  ${txUrl(burn)}`);
if (r.status !== "success") process.exit(1);

if (LOCALNET || flags.has("--no-wait")) {
  console.log(LOCALNET
    ? "iris      the fork's burn is not on the public chain, so Circle's Iris will never attest it. Stopping here."
    : `iris      poll ${irisMessagesUrl(cctpNet, burn)} for the attestation`);
  process.exit(0);
}

const url = irisMessagesUrl(cctpNet, burn);
console.log(`iris      ${url}`);
const deadline = Date.now() + 30 * 60_000;
let msg = null;
while (Date.now() < deadline) {
  const j = await fetch(url).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  msg = parseIrisMessages(j).find((m) => m.status === "complete" && m.message && m.attestation) ?? null;
  if (msg) break;
  await new Promise((res) => setTimeout(res, 5_000));
}
if (!msg) { console.log("iris      no attestation yet; run again with --no-wait later and poll the URL above"); process.exit(2); }
console.log(`attested  message ${msg.message.slice(0, 18)}…`);
console.log(`\nMint it on ${destination.name} (anyone may send this; gas there in its native token):\n`);
console.log(`  cast send ${destination.messageTransmitterV2} "receiveMessage(bytes,bytes)" \\\n    ${msg.message} \\\n    ${msg.attestation} \\\n    --rpc-url <${destination.name} RPC> --private-key <a funded key>`);
console.log(`\nThen ${destination.explorer}/address/${recipient}`);
