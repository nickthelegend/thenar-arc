"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { useThenarWrite } from "@/lib/write";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, addressUrl, txUrl } from "@/lib/chain";
import { TRAJECTORY_CERTIFICATE_ABI } from "@/lib/registry-abi";
import { DEPLOYED } from "@/lib/registry";
import { shortHash } from "@/lib/format";

const CERT = DEPLOYED.find((d) => d.key === "certificate")!.address;

/**
 * The soulbound certificate for this run, on the run it certifies.
 *
 * TrajectoryCertificate names who recorded a trajectory and conveys no rights
 * over the data. It was deployed, verified, set in the environment, and read by
 * no part of the interface — visible only as a row on the contract registry,
 * which is the wrong place for something that is about one specific run.
 *
 * The certificate is keyed by trajectory id and the run page only knows the
 * hash, so the id is resolved by reading the ledger and matching. That is a
 * handful of calls at the current size and it is the honest way to do it: the
 * alternative is an off-chain index that can disagree with the chain.
 */
export function RunCertificate({ trajHash }: { trajHash: string }) {
  const count = useReadContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "trajectoryCount" });
  const n = Number((count.data as bigint | undefined) ?? 0n);

  const ledger = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: AXON_ADDRESS, abi: AXON_ABI, functionName: "getTrajectory", args: [BigInt(i)],
    })),
    query: { enabled: n > 0 },
  });

  const id = ledger.data?.findIndex(
    (r) => (r.result as { trajHash?: string } | undefined)?.trajHash?.toLowerCase() === trajHash.toLowerCase(),
  );
  const found = typeof id === "number" && id >= 0;

  const minted = useReadContract({
    address: CERT, abi: TRAJECTORY_CERTIFICATE_ABI, functionName: "minted",
    args: found ? [BigInt(id)] : undefined,
    query: { enabled: found },
  });
  const owner = useReadContract({
    address: CERT, abi: TRAJECTORY_CERTIFICATE_ABI, functionName: "ownerOf",
    args: found && minted.data ? [BigInt(id)] : undefined,
    query: { enabled: Boolean(found && minted.data) },
  });

  const loading = count.isLoading || ledger.isLoading || minted.isLoading;
  const isMinted = Boolean(minted.data);
  const tx = useThenarWrite();

  return (
    <div className="mt-6 border-t border-rule pt-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="label">Certificate</span>
        <span className={`font-mono text-[12px] ${isMinted ? "text-signal" : "text-scribe-3"}`}>
          {loading ? "reading the ledger…"
            : !found ? "this run is not on the current contract"
            : isMinted ? `token #${id}` : "not minted for this run"}
        </span>
      </div>

      <p className="mt-2 max-w-[64ch] text-[13px] leading-relaxed text-scribe-3">
        A soulbound token naming who recorded this trajectory. It cannot be
        transferred and conveys no rights over the data — the corpus is licensed
        separately, and holding one is not holding the run.
      </p>

      {/* Anyone may mint it, and the contract sends it to the address the
          protocol recorded as the contributor — read from the protocol, not
          taken from the caller. So there is nothing to gate: the worst a
          stranger can do by pressing this is pay the gas to give somebody else
          their own certificate. It was callable by nobody, from anywhere, which
          is why the panel above has always said "not minted". */}
      {found && !isMinted && !loading ? (
        <div className="mt-3">
          <button
            type="button"
            disabled={tx.busy}
            onClick={() =>
              tx.run("mint", [BigInt(id!)], undefined, { address: CERT, abi: TRAJECTORY_CERTIFICATE_ABI })
            }
            className="border border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe transition-colors hover:border-scribe disabled:opacity-60"
          >
            {tx.phase === "signing" ? "Confirm in wallet…"
              : tx.phase === "pending" ? "Minting…"
              : `Mint token #${id}`}
          </button>
          <p className="mt-1.5 max-w-[62ch] font-mono text-[11px] leading-relaxed text-scribe-3">
            It goes to whoever the protocol recorded as the contributor, not to
            whoever pays the gas. You can mint somebody else&rsquo;s certificate
            for them and gain nothing by it.
          </p>
          {tx.error ? (
            <p role="alert" className="mt-2 text-[13px] text-reject">{tx.error}</p>
          ) : null}
          {tx.phase === "confirmed" && tx.txHash ? (
            <p className="mt-2 font-mono text-[12px] text-go">
              Minted ·{" "}
              <a href={txUrl(tx.txHash)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
                {shortHash(tx.txHash)}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {isMinted && owner.data ? (
        <p className="mt-2 font-mono text-[12px] text-scribe-3">
          Held by{" "}
          <a href={addressUrl(owner.data as `0x${string}`)} target="_blank" rel="noreferrer"
             className="text-signal hover:text-signal-hi">
            {shortHash(owner.data as string)} &rarr;
          </a>
        </p>
      ) : null}
    </div>
  );
}
