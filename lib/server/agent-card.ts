import "server-only";
import { ARC_EXTERNAL, appChain, isAddress } from "@/lib/chain";
import { APP_ORIGIN } from "@/lib/site";

/**
 * ERC-8004 registration files: what an agent's `agentURI` points at.
 * https://eips.ethereum.org/EIPS/eip-8004#registration-v1
 */
const ORIGIN = (process.env.PUBLIC_ORIGIN ?? APP_ORIGIN ?? "").replace(/\/$/, "");

const registry = () => (isAddress(ARC_EXTERNAL.identityRegistry) ? `eip155:${appChain.id}:${ARC_EXTERNAL.identityRegistry}` : null);

export function registrationFile(input: {
  name: string;
  description: string;
  agentId: string | null | undefined;
  services: { name: string; endpoint: string; version?: string }[];
}) {
  const reg = registry();
  const id = input.agentId && /^\d+$/.test(input.agentId) ? Number(input.agentId) : null;
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: input.name,
    description: input.description,
    image: `${ORIGIN}/icon.png`,
    services: input.services.map((s) => ({ ...s, endpoint: s.endpoint.startsWith("http") ? s.endpoint : `${ORIGIN}${s.endpoint}` })),
    // Kept for readers of the earlier draft of the spec, which called them endpoints.
    endpoints: input.services.map((s) => ({ name: s.name, endpoint: s.endpoint.startsWith("http") ? s.endpoint : `${ORIGIN}${s.endpoint}` })),
    x402Support: true,
    active: true,
    registrations: reg && id !== null ? [{ agentId: id, agentRegistry: reg }] : [],
    supportedTrust: ["reputation"],
  };
}
