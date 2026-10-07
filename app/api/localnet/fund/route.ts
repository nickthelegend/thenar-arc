import { NextResponse } from "next/server";
import { createWalletClient, getAddress, http, parseAbi, parseEther, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LOCALNET, LOCAL_RPC, USDC, thenarLocalnet } from "@/lib/chain";
import { monad } from "@/lib/server/monad";
import { logged } from "@/lib/server/log";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What one drip sends: gas for a few dozen runs, and enough USDC to buy corpora. */
const MON = parseEther("5");
const USDC_DRIP = parseUnits("20", 6);

/**
 * The local chain's faucet: MON for gas and USDC for corpus purchases, sent
 * from anvil's faucet account as two ordinary transfers.
 *
 * Only on a local build, and only to a wallet holding less than one MON, so it
 * tops a wallet up rather than filling it. On a Monad build this route does not
 * exist in any useful sense: it answers 404.
 */
async function handlePOST(req: Request) {
  if (!LOCALNET) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = process.env.LOCAL_FAUCET_PRIVATE_KEY;
  if (!key) return NextResponse.json({ error: "LOCAL_FAUCET_PRIVATE_KEY is not set; run scripts/localnet.mjs." }, { status: 503 });
  const gate = rateLimit(`fund:${callerKey(req)}`, 10, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { address?: string; gas?: boolean } | null;
  if (!body?.address || !/^0x[0-9a-fA-F]{40}$/.test(body.address)) {
    return NextResponse.json({ error: "address must be an address" }, { status: 400 });
  }
  const to = getAddress(body.address);
  if ((await monad.getChainId()) !== thenarLocalnet.id) {
    return NextResponse.json({ error: "The node at this RPC is not the local chain." }, { status: 503 });
  }

  const wallet = createWalletClient({ account: privateKeyToAccount(key as `0x${string}`), chain: thenarLocalnet, transport: http(LOCAL_RPC) });
  const sendUsdc = () => wallet.writeContract({
    address: USDC, abi: parseAbi(["function transfer(address,uint256) returns (bool)"]),
    functionName: "transfer", args: [to, USDC_DRIP],
  });

  // A wallet whose gas a sponsor pays is sent USDC only, and only while it has less than a drip.
  if (body.gas === false) {
    const held = await monad.readContract({
      address: USDC, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [to],
    });
    if (held >= USDC_DRIP) return NextResponse.json({ funded: false, usdc: held.toString() });
    const usdc = await sendUsdc();
    await monad.waitForTransactionReceipt({ hash: usdc });
    return NextResponse.json({ funded: true, mon: null, usdc });
  }

  const balance = await monad.getBalance({ address: to });
  if (balance >= parseEther("1")) return NextResponse.json({ funded: false, balance: balance.toString() });

  const mon = await wallet.sendTransaction({ to, value: MON });
  const usdc = await sendUsdc();
  await Promise.all([monad.waitForTransactionReceipt({ hash: mon }), monad.waitForTransactionReceipt({ hash: usdc })]);
  return NextResponse.json({ funded: true, mon, usdc });
}

export const POST = logged("/api/localnet/fund", handlePOST);
