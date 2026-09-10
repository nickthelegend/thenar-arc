"use client";

import { useEffect, useState } from "react";
import { useReadContract } from "wagmi";
import { verifyProof } from "@/lib/merkle";
import { CORPUS_MANIFEST, addressUrl } from "@/lib/chain";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Whether this episode is part of the corpus that was sold.
 *
 * The integrity badge above already answers a different question — do these
 * samples hash to the value on chain — and answering it does not tell you the
 * episode belongs to any particular corpus. A buyer holds a file and has no
 * way to know an episode was left out of it, because a list of individually
 * valid hashes contains no claim about being the whole list.
 *
 * So: the root is read from the chain by this browser, the proof comes from
 * the API, and the walk from leaf to root happens here. The server supplies
 * siblings and cannot supply the answer — a wrong proof fails against a root
 * it never had a hand in.
 */

const ABI = [
  {
    type: "function", name: "latest", stateMutability: "view",
    inputs: [{ name: "taskId", type: "uint256" }],
    outputs: [{
      type: "tuple",
      components: [
        { name: "root", type: "bytes32" },
        { name: "episodes", type: "uint32" },
        { name: "at", type: "uint64" },
      ],
    }],
  },
] as const;

export function InCorpus({ taskId, trajHash }: { taskId: number; trajHash: string }) {
  const [proof, setProof] = useState<`0x${string}`[] | null | undefined>(undefined);

  const { data: commitment, isError } = useReadContract({
    address: CORPUS_MANIFEST,
    abi: ABI,
    functionName: "latest",
    args: [BigInt(taskId)],
    query: { retry: false },
  });

  useEffect(() => {
    let live = true;
    fetch(`/api/task/${taskId}/manifest?episode=${trajHash}`)
      .then((r) => r.json())
      .then((d: { proof?: `0x${string}`[] | null }) => { if (live) setProof(d.proof ?? null); })
      .catch(() => { if (live) setProof(null); });
    return () => { live = false; };
  }, [taskId, trajHash]);

  // No commitment for this task yet is the ordinary state, not a fault, and
  // saying nothing is better than a box explaining an absence.
  if (isError || !commitment) return null;
  if (proof === undefined) return <div className="hatch mt-4 h-14 max-w-[62ch]" aria-busy="true" />;

  const verified = proof !== null && verifyProof(trajHash, proof, commitment.root);

  return (
    <div
      className={cn(
        "mt-4 max-w-[62ch] border px-4 py-3",
        verified ? "border-go/40 bg-go/5" : "border-rule bg-ink-1",
      )}
    >
      <p className="font-mono text-[12px] uppercase tracking-[0.12em]">
        <span className={verified ? "text-go" : "text-scribe-3"}>
          {verified ? "In the committed corpus" : "Not in the committed corpus"}
        </span>
        <span className="ml-3 normal-case tracking-normal text-scribe-3">
          {commitment.episodes} episode{commitment.episodes === 1 ? "" : "s"} under{" "}
          {shortHash(commitment.root)}
        </span>
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-scribe-3">
        {verified ? (
          <>
            The root was read from{" "}
            <a href={addressUrl(CORPUS_MANIFEST)} target="_blank" rel="noreferrer" className="text-probe hover:underline">
              the manifest contract
            </a>{" "}
            by this browser, and this episode&rsquo;s{" "}
            {proof.length === 0 ? "single-episode corpus is its own root" : `${proof.length}-step proof was walked here`}.
            The server supplied siblings and could not supply the answer.
          </>
        ) : (
          <>
            This episode is not under the root currently committed for task {taskId}.
            That happens while a corpus is growing — the commitment is made when
            a policy is minted, and runs recorded after it are not in it yet.
          </>
        )}
      </p>
    </div>
  );
}
