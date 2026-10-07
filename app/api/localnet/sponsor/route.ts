import { NextResponse } from "next/server";
import { BaseError, createWalletClient, encodeFunctionData, getAddress, http, type Hex, type SignedAuthorization } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LOCALNET, LOCAL_RPC, USDC, thenarLocalnet } from "@/lib/chain";
import { LOCAL_DEPLOYMENT } from "@/lib/deployment-local";
import { monad } from "@/lib/server/monad";
import { logged } from "@/lib/server/log";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";
import { SPONSORED_ACCOUNT, SPONSORED_ACCOUNT_ABI, delegationCode } from "@/lib/local-sponsor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The sponsorship policy: what the sponsor pays gas for. Thenar's own
 * contracts and the local USDC, nothing else, as a Privy dashboard policy
 * would scope Monad's.
 */
const ALLOWED = new Set(
  [...Object.values(LOCAL_DEPLOYMENT.contracts), USDC].filter(Boolean).map((a) => a.toLowerCase()),
);

type Body = {
  from?: string; target?: string; value?: string; data?: string; signature?: string;
  authorization?: { address: string; chainId: number; nonce: number; r: Hex; s: Hex; yParity: number };
};

/**
 * Send a call a sponsored wallet signed, and pay its gas.
 *
 * The local chain's stand-in for Privy's gas sponsorship (lib/local-sponsor.ts).
 * The wallet signs the call. The first time, it also signs an EIP-7702
 * authorisation delegating its address to SponsoredAccount. This route sends
 * the transaction to the wallet's own address from the sponsor's key, so the
 * protocol sees the wallet as msg.sender while the sponsor pays. The account
 * checks the wallet's signature, so the sponsor can only deliver what was
 * signed. Local builds only.
 */
async function handlePOST(req: Request) {
  if (!LOCALNET) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const key = process.env.LOCAL_SPONSOR_PRIVATE_KEY;
  if (!key || !SPONSORED_ACCOUNT) {
    return NextResponse.json({ error: "Gas sponsorship is not set up on this chain; run scripts/localnet.mjs." }, { status: 503 });
  }
  const gate = rateLimit(`sponsor:${callerKey(req)}`, 30, 60_000);
  if (!gate.ok) return NextResponse.json({ error: "Too many requests. Wait a moment." }, { status: 429 });

  const b = (await req.json().catch(() => null)) as Body | null;
  const isAddr = (a?: string) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
  if (!b || !isAddr(b.from) || !isAddr(b.target) || !/^0x[0-9a-fA-F]*$/.test(b.data ?? "") || !/^0x[0-9a-fA-F]{130}$/.test(b.signature ?? "")) {
    return NextResponse.json({ error: "from, target, data and a 65-byte signature are required" }, { status: 400 });
  }
  const from = getAddress(b.from!);
  const target = getAddress(b.target!);
  if (!ALLOWED.has(target.toLowerCase())) {
    return NextResponse.json({ error: `The sponsor pays only for calls to Thenar's contracts, not ${target}.` }, { status: 403 });
  }
  const value = BigInt(b.value ?? "0");

  let authorizationList: SignedAuthorization[] | undefined;
  const code = ((await monad.getCode({ address: from })) ?? "0x").toLowerCase();
  if (code !== delegationCode(SPONSORED_ACCOUNT)) {
    const a = b.authorization;
    if (!a || a.address.toLowerCase() !== SPONSORED_ACCOUNT.toLowerCase() || a.chainId !== thenarLocalnet.id) {
      return NextResponse.json({ error: "This wallet has not delegated to the sponsored account; send its authorisation." }, { status: 409 });
    }
    authorizationList = [{ address: getAddress(a.address), chainId: a.chainId, nonce: a.nonce, r: a.r, s: a.s, yParity: a.yParity }];
  }

  const sponsor = createWalletClient({ account: privateKeyToAccount(key as Hex), chain: thenarLocalnet, transport: http(LOCAL_RPC) });
  const data = encodeFunctionData({
    abi: SPONSORED_ACCOUNT_ABI, functionName: "execute", args: [target, value, b.data as Hex, b.signature as Hex],
  });
  try {
    // Estimated first, so a call that would revert is refused here rather than paid for.
    const gas = await monad.estimateGas({ account: sponsor.account, to: from, data, authorizationList });
    const hash = await sponsor.sendTransaction({ to: from, data, authorizationList, gas: (gas * 12n) / 10n });
    return NextResponse.json({ hash, sponsor: sponsor.account.address });
  } catch (e) {
    const message = e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `The call would fail: ${message.split("\n")[0]}` }, { status: 409 });
  }
}

export const POST = logged("/api/localnet/sponsor", handlePOST);
