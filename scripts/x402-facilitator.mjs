/**
 * An x402 facilitator for the local chain.
 *
 *   NEXT_PUBLIC_CHAIN=local node scripts/x402-facilitator.mjs [port]
 *
 * On Monad the corpus paywall settles through the Monad Foundation's public
 * facilitator, which knows nothing of a chain on this machine. This is the
 * same thing for the local chain, built from x402's own facilitator library:
 * it checks the agent's EIP-3009 authorisation against the local USDC, then
 * submits transferWithAuthorization from anvil's facilitator account and pays
 * the gas, as Monad's does.
 *
 * Speaks the facilitator HTTP interface the app's HTTPFacilitatorClient uses:
 * GET /supported, POST /verify, POST /settle.
 */
import { createServer } from "node:http";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { x402Facilitator } from "@x402/core/facilitator";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { LOCALNET, LOCAL_RPC, appChain, env, need } from "./monad.mjs";

if (!LOCALNET) {
  console.error("  This facilitator is for the local chain. Run it with NEXT_PUBLIC_CHAIN=local.");
  process.exit(1);
}

const PORT = Number(process.argv[2] ?? new URL(env("X402_FACILITATOR_URL") ?? "http://127.0.0.1:4021").port ?? 4021);
const account = privateKeyToAccount(need(env("X402_FACILITATOR_PRIVATE_KEY"), "X402_FACILITATOR_PRIVATE_KEY (run scripts/localnet.mjs)"));
const client = createWalletClient({ account, chain: appChain, transport: http(LOCAL_RPC) }).extend(publicActions);

const signer = toFacilitatorEvmSigner({
  address: account.address,
  readContract: (a) => client.readContract(a),
  verifyTypedData: (a) => client.verifyTypedData(a),
  writeContract: (a) => client.writeContract(a),
  sendTransaction: (a) => client.sendTransaction(a),
  waitForTransactionReceipt: (a) => client.waitForTransactionReceipt(a),
  getCode: (a) => client.getCode(a),
});

const NETWORK = `eip155:${appChain.id}`;
const facilitator = new x402Facilitator().register(NETWORK, new ExactEvmScheme(signer));

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
};
const read = (req) =>
  new Promise((ok, fail) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch (e) { fail(e); } });
    req.on("error", fail);
  });

createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  try {
    if (req.method === "GET" && path === "/supported") return json(res, 200, facilitator.getSupported());
    if (req.method === "POST" && (path === "/verify" || path === "/settle")) {
      const { paymentPayload, paymentRequirements } = await read(req);
      if (!paymentPayload || !paymentRequirements) return json(res, 400, { error: "paymentPayload and paymentRequirements are required" });
      const out = path === "/verify"
        ? await facilitator.verify(paymentPayload, paymentRequirements)
        : await facilitator.settle(paymentPayload, paymentRequirements);
      const ok = path === "/verify" ? out.isValid : out.success;
      console.log(`${new Date().toISOString()} ${path.slice(1)} ${ok ? "ok" : "refused"} ${out.payer ?? ""} ${out.transaction ?? out.invalidReason ?? out.errorReason ?? ""}`);
      return json(res, 200, out);
    }
    return json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(`${path}: ${e instanceof Error ? e.message : e}`);
    return json(res, 500, { error: e instanceof Error ? e.message.split("\n")[0] : String(e) });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`x402 facilitator on http://127.0.0.1:${PORT} for ${NETWORK}, paying gas from ${account.address}`);
});
