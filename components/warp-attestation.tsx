"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { decodeAbiParameters, formatEther } from "viem";
import { LICENCE_RECEIPT_ABI } from "@/lib/registry-abi";
import { DEPLOYED } from "@/lib/registry";
import { useAttestation, type ChainPolicy } from "@/lib/hooks";
import { CURRENCY, txUrl } from "@/lib/chain";
import { fmtInt, fmtMon, shortHash } from "@/lib/format";

const RECEIPT = DEPLOYED.find((d) => d.key === "licence")!.address;

/**
 * The Warp message attesting this policy, decoded, on the licence it attests.
 *
 * This panel used to print the payload as a wall of hex and call it evidence.
 * Hex is not evidence — nobody reads it, and a reader who cannot read it has to
 * take the word of the page that it says what the page says. The interesting
 * claim was never "there are 320 bytes here"; it is that the bytes Fuji's
 * validators signed contain exactly the numbers shown above them, produced by
 * the contract rather than asserted by us.
 *
 * So the payload is decoded to its ten fields and each is checked against the
 * policy this page already read from the protocol. Both come from the chain by
 * different routes — one through `getPolicy`, one through the receipt's own
 * encoding — and if they ever disagreed, the disagreement is the finding and
 * this says so rather than showing the friendlier of the two.
 *
 * Two things are kept carefully apart, because conflating them would be the
 * easy lie here. `payloadFor` is a view: it answers for any policy, signed or
 * not, and proves nothing on its own. `Attested` is an event: a transaction
 * that went through the precompile and came back with a message id. The panel
 * shows the second only when it exists, with the block and the transaction.
 *
 * And delivery is a third thing again. Fuji produces the signed message; this
 * deployment does not carry it anywhere, because delivery costs gas on a
 * destination chain. A message delivered end to end — minted here, received
 * there, checked against what the destination holds — is shown at /l1, on a
 * chain where both ends were ours.
 */

/** The receipt's own layout, in the order LicenceReceipt.sol encodes it. */
const PAYLOAD_ABI = [
  { name: "format", type: "uint8" },
  { name: "protocol", type: "address" },
  { name: "policyId", type: "uint256" },
  { name: "taskId", type: "uint256" },
  { name: "minter", type: "address" },
  { name: "trajectories", type: "uint32" },
  { name: "mintedAt", type: "uint64" },
  { name: "licenceFee", type: "uint128" },
  { name: "licencesSold", type: "uint32" },
  { name: "distributed", type: "uint128" },
] as const;

type Field = { label: string; signed: string; agrees: boolean | null };

export function WarpAttestation({ policy }: { policy: ChainPolicy }) {
  const payload = useReadContract({
    address: RECEIPT, abi: LICENCE_RECEIPT_ABI, functionName: "payloadFor",
    args: [BigInt(policy.id)],
  });
  const source = useReadContract({
    address: RECEIPT, abi: LICENCE_RECEIPT_ABI, functionName: "sourceChain",
  });
  const format = useReadContract({
    address: RECEIPT, abi: LICENCE_RECEIPT_ABI, functionName: "FORMAT",
  });
  const { data: attested, isLoading: scanning } = useAttestation(policy.id);

  const bytes = payload.data as `0x${string}` | undefined;
  const signable = typeof bytes === "string" && bytes.length > 2;

  let fields: Field[] = [];
  let readable = false;
  let formatMismatch: string | null = null;

  if (signable) {
    try {
      const d = decodeAbiParameters(PAYLOAD_ABI, bytes);
      const [fmt, protocol, policyId, taskId, minter, trajectories, mintedAt, fee, sold, distributed] = d;
      readable = true;

      // The version byte exists so a reader can refuse a layout it does not
      // know rather than misread one. Refusing is the point; check it.
      const known = format.data === undefined ? null : Number(fmt) === Number(format.data);
      if (known === false) formatMismatch = `payload says format ${fmt}, the contract is on ${format.data}`;

      const eq = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
      fields = [
        { label: "Format", signed: String(fmt), agrees: known },
        { label: "Protocol", signed: shortHash(protocol), agrees: null },
        { label: "Policy", signed: `#${policyId}`, agrees: Number(policyId) === policy.id },
        { label: "Task", signed: `#${taskId}`, agrees: Number(taskId) === policy.taskId },
        { label: "Minter", signed: shortHash(minter), agrees: eq(minter, policy.minter) },
        { label: "Trajectories", signed: fmtInt(Number(trajectories)), agrees: Number(trajectories) === policy.trajectories },
        { label: "Minted", signed: new Date(Number(mintedAt) * 1000).toISOString().slice(0, 10), agrees: Number(mintedAt) * 1000 === policy.mintedAt },
        { label: "Licence fee", signed: `${fmtMon(Number(formatEther(fee)), 3)} ${CURRENCY}`, agrees: fee === policy.licenceWei },
        { label: "Licences sold", signed: fmtInt(Number(sold)), agrees: Number(sold) === policy.licencesSold },
        { label: "Distributed", signed: `${fmtMon(Number(formatEther(distributed)), 4)} ${CURRENCY}`, agrees: Number(formatEther(distributed)) === policy.distributedMon },
      ];
    } catch {
      readable = false;
    }
  }

  const checked = fields.filter((f) => f.agrees !== null);
  const disagreements = checked.filter((f) => f.agrees === false);
  const allAgree = checked.length > 0 && disagreements.length === 0;

  return (
    <>
      <DimHead />

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Signed on chain</span>
        <span className={`font-mono text-[12px] ${attested ? "text-signal" : "text-scribe-3"}`}>
          {scanning
            ? "looking for the signature…"
            : attested
              ? `block ${attested.blockNumber.toLocaleString()}`
              : "no attestation transaction for this policy yet"}
        </span>
      </div>

      <p className="mt-2 max-w-[66ch] text-[14px] leading-relaxed text-scribe-2">
        Warp is Avalanche&rsquo;s validator-signed interchain attestation. Calling{" "}
        <code className="font-mono text-[13px] text-scribe">attest</code> puts the
        figures below through the precompile at{" "}
        <code className="font-mono text-[13px] text-scribe">0x…05</code>, and Fuji&rsquo;s
        own validators sign them &mdash; so another chain can check this licence
        against a validator set rather than against us, or anyone running this
        deployment.
      </p>

      {attested ? (
        <dl className="mt-4 grid grid-cols-1 gap-px bg-rule sm:grid-cols-3">
          <Cell label="Message id" value={shortHash(attested.messageID)} mono />
          <Cell label="Signed by" value={shortHash(attested.by)} mono />
          <Cell
            label="Transaction"
            value={shortHash(attested.txHash)}
            mono
            href={txUrl(attested.txHash)}
          />
        </dl>
      ) : null}

      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">What the signature covers</span>
        <span className={`font-mono text-[12px] ${allAgree ? "text-signal" : disagreements.length ? "text-reject" : "text-scribe-3"}`}>
          {payload.isLoading
            ? "reading the receipt…"
            : !signable
              ? "the contract has no payload for this policy"
              : !readable
                ? "the payload does not decode to the layout this build knows"
                : disagreements.length
                  ? `${disagreements.length} of ${checked.length} disagree with the protocol`
                  : `all ${checked.length} match what the protocol holds`}
        </span>
      </div>

      {formatMismatch ? (
        <p className="mt-2 max-w-[66ch] text-[13px] text-reject">{formatMismatch}</p>
      ) : null}

      {readable ? (
        <>
          <p className="mt-2 max-w-[66ch] text-[13px] leading-relaxed text-scribe-3">
            Each row is the value inside the signed message, checked against the
            same value read straight from the protocol by this page. Two routes
            off the same chain: if they ever disagreed, the disagreement would be
            the finding, and it would be shown here rather than hidden.
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-px bg-rule sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.label} className="flex items-baseline justify-between gap-4 bg-ink-1 px-4 py-2.5">
                <dt className="label">{f.label}</dt>
                <dd className="flex items-baseline gap-2 font-mono text-[13px] tabular-nums text-scribe">
                  {f.signed}
                  <span
                    className={
                      f.agrees === true ? "text-signal" : f.agrees === false ? "text-reject" : "text-scribe-3"
                    }
                    title={
                      f.agrees === true
                        ? "matches the protocol"
                        : f.agrees === false
                          ? "does not match the protocol"
                          : "carried by the message; nothing on this page to check it against"
                    }
                  >
                    {f.agrees === true ? "✓" : f.agrees === false ? "✗" : "·"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 font-mono text-[12px] text-scribe-3">
            Source chain <span className="text-scribe-2">{shortHash(String(source.data ?? "—"))}</span>
            {" · "}
            {(bytes!.length - 2) / 2} bytes signed
          </p>
        </>
      ) : null}

      <p className="mt-4 max-w-[66ch] text-[13px] leading-relaxed text-scribe-3">
        Producing the message and delivering it are different things, and only
        the first happens here &mdash; delivery costs gas on a destination chain.
        A message carried end to end, minted on one chain and read back off
        another that had never heard of it, is shown at{" "}
        <Link href="/l1" className="text-signal hover:text-signal-hi">/l1</Link>.
      </p>
    </>
  );
}

function DimHead() {
  return <div className="mt-10 border-t border-rule pt-6" />;
}

function Cell({ label, value, mono, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  const body = (
    <span className={`${mono ? "font-mono" : ""} text-[13px] tabular-nums text-scribe`}>{value}</span>
  );
  return (
    <div className="flex flex-col gap-1 bg-ink-1 px-4 py-3">
      <dt className="label">{label}</dt>
      <dd>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="hover:text-signal">
            {body}
          </a>
        ) : (
          body
        )}
      </dd>
    </div>
  );
}
