/**
 * Exercise the passkey registry's state-changing path on chain.
 *
 * The view path was already proven live, but register() and authorise() had
 * never executed. This binds a real WebCrypto secp256r1 key to an address,
 * spends a signature through the P256 precompile, and proves the same
 * signature cannot be spent twice.
 *
 *   node scripts/passkey-onchain.mjs
 */
import { readFileSync } from "node:fs";
import { webcrypto as wc } from "node:crypto";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const env = Object.fromEntries(readFileSync(".env.deployer", "utf8").split("\n").filter(Boolean).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } };

const REGISTRY = "0xD6dE823EE979c4aAD3ba8eDe05f6E363DE65E165";
const abi = parseAbi([
  "error AlreadyUsed()", "error BadSignature()", "error NoPasskey()",
  "function register(bytes32 x, bytes32 y)",
  "function authorise(address who, bytes32 digest, bytes32 r, bytes32 s)",
  "function hasPasskey(address) view returns (bool)",
  "function verify(address who, bytes32 digest, bytes32 r, bytes32 s) view returns (bool)",
  "function used(address, bytes32) view returns (bool)",
]);

const pub = createPublicClient({ chain, transport: http() });
const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain, transport: http() });

let failed = 0;
const check = (ok, m, x = "") => { if (!ok) failed++; console.log(`${ok ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const hex = b => Buffer.from(b).toString("hex");
const big = b => BigInt("0x" + hex(b));
const word = n => `0x${n.toString(16).padStart(64, "0")}`;

console.log(`\nPasskey registry, on chain · ${REGISTRY}\noperator ${account.address}\n`);

// A real secp256r1 key, the same curve a passkey uses.
const key = await wc.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await wc.subtle.exportKey("jwk", key.publicKey);
const b64u = v => Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const x = word(big(b64u(jwk.x))), y = word(big(b64u(jwk.y)));

let h = await wallet.writeContract({ address: REGISTRY, abi, functionName: "register", args: [x, y] });
let r0 = await pub.waitForTransactionReceipt({ hash: h });
check(r0.status === "success", "register() confirmed on chain", h.slice(0, 20));
check(await pub.readContract({ address: REGISTRY, abi, functionName: "hasPasskey", args: [account.address] }),
      "the key is bound to the address");

const msg = new TextEncoder().encode(`axon: authorise run ${Date.now()}`);
const sig = new Uint8Array(await wc.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, msg));
const digest = `0x${hex(new Uint8Array(await wc.subtle.digest("SHA-256", msg)))}`;
let s = big(sig.slice(32, 64));
if (s > N / 2n) s = N - s;
const r = word(big(sig.slice(0, 32)));

check(await pub.readContract({ address: REGISTRY, abi, functionName: "verify", args: [account.address, digest, r, word(s)] }),
      "the registered key verifies the signature");

h = await wallet.writeContract({ address: REGISTRY, abi, functionName: "authorise", args: [account.address, digest, r, word(s)] });
const started = Date.now();
r0 = await pub.waitForTransactionReceipt({ hash: h });
check(r0.status === "success", "authorise() spent the signature on chain", `${Date.now() - started} ms`);
check(await pub.readContract({ address: REGISTRY, abi, functionName: "used", args: [account.address, digest] }),
      "the digest is recorded as spent");

try {
  await pub.simulateContract({ address: REGISTRY, abi, functionName: "authorise", account, args: [account.address, digest, r, word(s)] });
  check(false, "replaying the same signature is refused");
} catch (e) {
  check(/AlreadyUsed/.test(e.message ?? ""), "replaying the same signature is refused");
}

try {
  const bad = word(big(sig.slice(0, 32)) ^ 1n);
  await pub.simulateContract({ address: REGISTRY, abi, functionName: "authorise", account, args: [account.address, `0x${hex(new Uint8Array(32))}`, bad, word(s)] });
  check(false, "a forged signature is refused");
} catch (e) {
  check(/BadSignature/.test(e.message ?? ""), "a forged signature is refused");
}

console.log(failed === 0 ? "\npasskey authorisation proven on chain\n" : `\n${failed} check(s) failed\n`);
process.exit(failed ? 1 : 0);
