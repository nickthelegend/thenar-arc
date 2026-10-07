import { NextResponse } from "next/server";
import { createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LOCALNET, LOCAL_RPC, USDC, thenarLocalnet } from "@/lib/chain";
import { arc } from "@/lib/server/arc";
import { logged } from "@/lib/server/log";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";
import { USDC_ABI, formatUsdc, parseUsdc } from "@/lib/usdc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One drip: enough USDC for dozens of runs' gas, a few corpus purchases and a small bounty. */
const DRIP = parseUsdc("20");
/** A wallet holding at least this much is topped up no further. */
const ENOUGH = parseUsdc("5");

/**
 * The Arc fork's faucet: one USDC transfer from the fork's faucet key.
 *
 * On Arc the gas token is USDC, so one ERC-20 transfer is the whole drip: the
 * same balance pays a run's gas and buys a corpus. There is no separate gas
 * drip and no sponsor. Only on a fork build, and only to a wallet holding less
 * than 5 USDC, so it tops a wallet up rather than filling it. On testnet or
 * mainnet this route answers 404; Circle's faucet is where testnet USDC comes from.
 */
async function handlePOST(req: Request) {
  if (!LOCALNET) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = process.env.LOCAL_FAUCET_PRIVATE_KEY;
  if (!key) return NextResponse.json({ error: "LOCAL_FAUCET_PRIVATE_KEY is not set; run scripts/arc-fork.mjs." }, { status: 503 });
  const gate = rateLimit(`fund:${callerKey(req)}`, 10, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { address?: string } | null;
  if (!body?.address || !/^0x[0-9a-fA-F]{40}$/.test(body.address)) {
    return NextResponse.json({ error: "address must be an address" }, { status: 400 });
  }
  const to = getAddress(body.address);

  const held = await arc.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [to] });
  if (held >= ENOUGH) {
    return NextResponse.json({ funded: false, usdc: held.toString(), balance: formatUsdc(held) });
  }

  const wallet = createWalletClient({ account: privateKeyToAccount(key as `0x${string}`), chain: thenarLocalnet, transport: http(LOCAL_RPC) });
  const tx = await wallet.writeContract({ address: USDC, abi: USDC_ABI, functionName: "transfer", args: [to, DRIP] });
  const receipt = await arc.waitForTransactionReceipt({ hash: tx, timeout: 30_000 });
  if (receipt.status !== "success") {
    return NextResponse.json({ error: `The faucet transfer reverted (${tx}). Is the faucet key funded? Re-run scripts/arc-fork.mjs.` }, { status: 502 });
  }
  const after = await arc.readContract({ address: USDC, abi: USDC_ABI, functionName: "balanceOf", args: [to] });
  // `usdc` is the transfer's hash, as before; `amount` and `balance` are USDC base units / decimal.
  return NextResponse.json({ funded: true, usdc: tx, amount: DRIP.toString(), balance: formatUsdc(after) });
}

export const POST = logged("/api/localnet/fund", handlePOST);
