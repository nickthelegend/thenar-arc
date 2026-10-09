/**
 * Register an ERC-8004 agent in Arc's Identity Registry, for Thenar's verifier
 * or for a buying agent, and bind the verifier to ThenarVerdicts.
 *
 *   node --import ./test/register.mjs scripts/register-agent.mjs verifier [agentURI]   register with VERIFIER_PRIVATE_KEY, then bindVerifier
 *   node --import ./test/register.mjs scripts/register-agent.mjs buyer [agentURI]      register with AGENT_PRIVATE_KEY; prints AGENT_ID
 *   node --import ./test/register.mjs scripts/register-agent.mjs bind <agentId>        bind an existing agent as the verifier
 *   node --import ./test/register.mjs scripts/register-agent.mjs show <agentId>        owner, wallet and URI of an agent
 *
 * The agentURI defaults to this app's registration file
 * (PUBLIC_ORIGIN/api/agents/verifier.json or …/buyer.json). bindVerifier holds
 * only if the agent's wallet or owner is ThenarProtocol's verifier key, so the
 * verifier registers from its own key. Gas is USDC; the key needs a few cents.
 */
import { createPublicClient, createWalletClient, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { IDENTITY_REGISTRY_ABI } from "../lib/erc8004.ts";
import { THENAR_VERDICTS_ABI } from "../lib/registry-abi.ts";
import { ADDR, ARC, env, appChain, need, transport, txUrl } from "./arc.mjs";

const [cmd, arg] = process.argv.slice(2);
const REGISTRY = need(ARC.identityRegistry, "the ERC-8004 Identity Registry's address");
const ORIGIN = (env("PUBLIC_ORIGIN") ?? env("LOCAL_APP_URL") ?? "https://app.thenar.io").replace(/\/$/, "");
const pub = createPublicClient({ chain: appChain, transport: transport() });
const walletFor = (key) => createWalletClient({ account: privateKeyToAccount(key), chain: appChain, transport: transport() });

async function register(key, uri) {
  const w = walletFor(key);
  const hash = await w.writeContract({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "register", args: [uri] });
  const r = await pub.waitForTransactionReceipt({ hash });
  const minted = parseEventLogs({ abi: IDENTITY_REGISTRY_ABI, logs: r.logs, eventName: "Transfer" })
    .find((e) => e.address.toLowerCase() === REGISTRY.toLowerCase() && e.args.to.toLowerCase() === w.account.address.toLowerCase());
  if (r.status !== "success" || !minted) throw new Error(`register did not mint an agent (${hash})`);
  console.log(`registered agent #${minted.args.tokenId} owned by ${w.account.address}  uri ${uri}  ${txUrl(hash)}`);
  return minted.args.tokenId;
}

async function bind(agentId) {
  const verdicts = need(ADDR.verdicts, "ThenarVerdicts' address");
  const [bound, current] = await pub.readContract({ address: verdicts, abi: THENAR_VERDICTS_ABI, functionName: "verifierAgent" });
  if (bound) {
    console.log(`bound     ThenarVerdicts is already bound to agent #${current}${current === agentId ? "" : " (a different agent; the binding is permanent)"}`);
    return;
  }
  const w = walletFor(need(env("VERIFIER_PRIVATE_KEY") ?? env("RELAYER_PRIVATE_KEY"), "a key to send bindVerifier from"));
  const { request } = await pub.simulateContract({ account: w.account, address: verdicts, abi: THENAR_VERDICTS_ABI, functionName: "bindVerifier", args: [agentId] });
  const hash = await w.writeContract(request);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(`bound     ThenarVerdicts → verifier agent #${agentId}, ${r.status}  ${txUrl(hash)}`);
  console.log(`          set VERIFIER_AGENT_ID=${agentId}`);
}

switch (cmd) {
  case "verifier": {
    const id = await register(need(env("VERIFIER_PRIVATE_KEY"), "VERIFIER_PRIVATE_KEY"), arg ?? `${ORIGIN}/api/agents/verifier.json`);
    await bind(id);
    break;
  }
  case "buyer": {
    const id = await register(need(env("AGENT_PRIVATE_KEY"), "AGENT_PRIVATE_KEY"), arg ?? `${ORIGIN}/api/agents/buyer.json`);
    console.log(`          set AGENT_ID=${id} so the agent sends x-erc8004-agent-id with its purchases`);
    break;
  }
  case "bind":
    await bind(BigInt(need(arg, "an agent id")));
    break;
  case "show": {
    const id = BigInt(need(arg, "an agent id"));
    const [owner, wallet, uri] = await Promise.all([
      pub.readContract({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "ownerOf", args: [id] }),
      pub.readContract({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "getAgentWallet", args: [id] }).catch(() => null),
      pub.readContract({ address: REGISTRY, abi: IDENTITY_REGISTRY_ABI, functionName: "tokenURI", args: [id] }).catch(() => ""),
    ]);
    console.log(`agent #${id}: owner ${owner}, wallet ${wallet ?? "-"}, uri ${uri || "-"}`);
    break;
  }
  default:
    console.error("usage: register-agent.mjs verifier [uri] | buyer [uri] | bind <agentId> | show <agentId>");
    process.exit(1);
}
