"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { usePublicClient } from "wagmi";

import { useSession } from "@/components/session";
import { DimRule } from "@/components/primitives";
import { AXON_ADDRESS, CCIP_RECEIVER, CURRENCY, IS_MAINNET, addressUrl, isAddress } from "@/lib/chain";
import { AXON_ABI } from "@/lib/abi";
import { THENAR_CCIP_RECEIVER_ABI } from "@/lib/registry-abi";
import { formatUsdc } from "@/lib/usdc";

/**
 * Whether the connected wallet holds this licence, and how a buyer on another
 * chain gets one: ThenarCcipSender on Base or Ethereum burns their USDC with
 * CCTP V2 (minted to ThenarCcipReceiver on Arc) and sends the order with
 * Chainlink CCIP; the receiver buys `licensePolicyFor(policyId, buyer)`.
 * "CCTP moves the dollars, CCIP carries the instruction."
 */
export function LicenceCrossChain({ policyId, fee }: { policyId: number; fee: bigint }) {
  const s = useSession();
  const client = usePublicClient();
  const receiverLive = isAddress(CCIP_RECEIVER);

  const { data: held } = useQuery({
    queryKey: ["licensed", policyId, s.address],
    enabled: !!client && !!s.address,
    queryFn: async () =>
      (await client!.readContract({
        address: AXON_ADDRESS, abi: AXON_ABI, functionName: "licensed", args: [BigInt(policyId), s.address as Address],
      })) as boolean,
  });

  const { data: receiver } = useQuery({
    queryKey: ["ccip-receiver"],
    enabled: !!client && receiverLive,
    queryFn: async () => {
      const read = (functionName: "licensesBought" | "pendingTotal" | "owedTotal") =>
        client!.readContract({ address: CCIP_RECEIVER, abi: THENAR_CCIP_RECEIVER_ABI, functionName }) as Promise<bigint>;
      const [bought, pending, owed] = await Promise.all([read("licensesBought"), read("pendingTotal"), read("owedTotal")]);
      return { bought, pending, owed };
    },
  });

  const source = IS_MAINNET ? "base" : "base-sepolia";

  return (
    <>
      <DimRule className="mt-10" note="Your licence" />
      <p className="mt-3 text-[14px] leading-relaxed text-scribe-2">
        {!s.connected
          ? "Connect a wallet to see whether it holds this licence."
          : held
            ? "This wallet holds the licence on Arc (ThenarProtocol.licensed). The bulk download at /api/dataset accepts its signature."
            : "This wallet does not hold the licence yet."}
      </p>

      <DimRule className="mt-10" note="Buy it from Base or Ethereum" />
      <p className="mt-3 max-w-[64ch] text-[14px] leading-relaxed text-scribe-3">
        A buyer agent that holds USDC on Base or Ethereum licenses this corpus in one transaction there, never
        holding anything on Arc. <span className="text-scribe-2">Circle CCTP V2 moves the {formatUsdc(fee)} {CURRENCY}</span>{" "}
        to Thenar&rsquo;s receiver on Arc, and <span className="text-scribe-2">Chainlink CCIP carries the order</span>;
        whichever lands second completes the purchase, and the fee fans out to every operator above. The receiver
        only accepts allowlisted senders, keeps any message it cannot process for retry, and holds an overpayment or a
        refused order for the buyer to withdraw on Arc.
      </p>
      <pre className="mt-3 overflow-x-auto border border-rule bg-ink-2 px-4 py-3 font-mono text-[12px] text-scribe-2">
{`node --import ./test/register.mjs scripts/ccip-send.mjs --source ${source} --policy ${policyId} --amount ${formatUsdc(fee)}
node --import ./test/register.mjs scripts/ccip-send.mjs status <messageId>`}
      </pre>
      <dl className="mt-3 grid grid-cols-3 gap-px bg-rule font-mono text-[12px]">
        <div className="bg-ink px-3 py-2">
          <dt className="label">Bought over CCIP</dt>
          <dd className="text-scribe">{receiver ? receiver.bought.toString() : "—"}</dd>
        </div>
        <div className="bg-ink px-3 py-2">
          <dt className="label">Awaiting the CCTP mint</dt>
          <dd className="text-scribe">{receiver ? `${formatUsdc(receiver.pending)} ${CURRENCY}` : "—"}</dd>
        </div>
        <div className="bg-ink px-3 py-2">
          <dt className="label">Held for buyers</dt>
          <dd className="text-scribe">{receiver ? `${formatUsdc(receiver.owed)} ${CURRENCY}` : "—"}</dd>
        </div>
      </dl>
      <p className="mt-2 font-mono text-[12px] text-scribe-3">
        {receiverLive ? (
          <a href={addressUrl(CCIP_RECEIVER)} target="_blank" rel="noreferrer" className="hover:text-probe">
            ThenarCcipReceiver {CCIP_RECEIVER.slice(0, 10)}… &rarr;
          </a>
        ) : (
          "ThenarCcipReceiver is not deployed on this network yet."
        )}{" "}
        Live sends are run by the buyer; they need USDC and gas on the source chain.
      </p>
    </>
  );
}
