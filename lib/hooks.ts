"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccount, useConfig, useReadContract, usePublicClient } from "wagmi";
import { readContracts } from "wagmi/actions";
import { formatEther } from "viem";
import { AXON_ABI } from "./abi";
import { AXON_ADDRESS, IS_DEPLOYED, scenarioName } from "./chain";
import { parSecondsFor } from "./par";

export type ChainTask = {
  id: number;
  name: string;
  funder: `0x${string}`;
  rewardWei: bigint;
  rewardMon: number;
  escrowWei: bigint;
  slotsTotal: number;
  slotsFilled: number;
  scenario: string;
  difficulty: number;
  policyMinted: boolean;
  parSeconds: number;
  open: boolean;
};

type RawTask = {
  name: string;
  funder: `0x${string}`;
  rewardPerTrajectory: bigint;
  escrow: bigint;
  slotsTotal: number;
  slotsFilled: number;
  scenario: number;
  difficulty: number;
  policyMinted: boolean;
};

function shape(raw: RawTask, id: number): ChainTask {
  return {
    id,
    name: raw.name,
    funder: raw.funder,
    rewardWei: raw.rewardPerTrajectory,
    rewardMon: Number(formatEther(raw.rewardPerTrajectory)),
    escrowWei: raw.escrow,
    slotsTotal: Number(raw.slotsTotal),
    slotsFilled: Number(raw.slotsFilled),
    scenario: scenarioName(Number(raw.scenario)),
    difficulty: Number(raw.difficulty),
    policyMinted: raw.policyMinted,
    parSeconds: parSecondsFor(Number(raw.difficulty)),
    open: Number(raw.slotsFilled) < Number(raw.slotsTotal) && !raw.policyMinted,
  };
}

/**
 * Polling that gives up on a read that cannot succeed.
 *
 * A task id that is out of range reverts every time, and re-asking every six
 * seconds means the error state flickers back to a loading state forever.
 */
const pollUnlessBroken = (ms: number) => (query: { state: { error: unknown } }) =>
  query.state.error ? false : ms;

/** Every task, in one batched call. */
export function useTasks() {
  return useReadContract({
    address: AXON_ADDRESS,
    abi: AXON_ABI,
    functionName: "getTasks",
    args: [0n, 200n],
    query: {
      enabled: IS_DEPLOYED,
      refetchInterval: pollUnlessBroken(6_000),
      select: (data) => (data as RawTask[]).map(shape),
    },
  });
}

export function useTask(id: number | undefined) {
  return useReadContract({
    address: AXON_ADDRESS,
    abi: AXON_ABI,
    functionName: "getTask",
    args: id === undefined ? undefined : [BigInt(id)],
    query: {
      enabled: IS_DEPLOYED && id !== undefined,
      refetchInterval: pollUnlessBroken(6_000),
      retry: 1,
      select: (data) => shape(data as RawTask, id ?? 0),
    },
  });
}

export function useRunsOnTask(taskId: number | undefined) {
  const { address } = useAccount();
  return useReadContract({
    address: AXON_ADDRESS,
    abi: AXON_ABI,
    functionName: "runsOnTask",
    args: taskId === undefined || !address ? undefined : [BigInt(taskId), address],
    query: {
      enabled: IS_DEPLOYED && taskId !== undefined && Boolean(address),
      select: (v) => Number(v as number | bigint),
    },
  });
}

export type ChainRun = {
  id: number;
  taskId: number;
  contributor: `0x${string}`;
  trajHash: `0x${string}`;
  cid: string;
  score: number;
  paidWei: bigint;
  paidMon: number;
  at: number;
};

/** Every run an address has produced, read back from the chain. */
export function useMyRuns() {
  const { address } = useAccount();
  const config = useConfig();

  return useQuery({
    queryKey: ["myRuns", address],
    enabled: IS_DEPLOYED && Boolean(address),
    refetchInterval: 8_000,
    queryFn: async (): Promise<ChainRun[]> => {
      const ids = (await readContracts(config, {
        contracts: [
          {
            address: AXON_ADDRESS,
            abi: AXON_ABI,
            functionName: "trajectoriesOf",
            args: [address!],
          },
        ],
      }))[0].result as bigint[] | undefined;

      if (!ids?.length) return [];

      const rows = await readContracts(config, {
        contracts: ids.map((i) => ({
          address: AXON_ADDRESS,
          abi: AXON_ABI,
          functionName: "getTrajectory" as const,
          args: [i] as const,
        })),
      });

      // Dropping failed reads would silently under-report the ledger; a
      // partial answer here is wrong, not smaller.
      const bad = rows.filter((r) => r.status !== "success").length;
      if (bad) throw new Error(`${bad} of ${rows.length} trajectory reads failed`);

      return rows
        .map((r, k) => {
          if (r.status !== "success") return null;
          const t = r.result as {
            taskId: bigint; contributor: `0x${string}`; trajHash: `0x${string}`;
            cid: string; score: number; paid: bigint; at: bigint;
          };
          return {
            id: Number(ids[k]),
            taskId: Number(t.taskId),
            contributor: t.contributor,
            trajHash: t.trajHash,
            cid: t.cid,
            score: Number(t.score),
            paidWei: t.paid,
            paidMon: Number(formatEther(t.paid)),
            at: Number(t.at) * 1000,
          };
        })
        .filter(Boolean)
        .reverse() as ChainRun[];
    },
  });
}

export function useStats(who?: `0x${string}`) {
  const { address } = useAccount();
  const target = who ?? address;
  return useReadContract({
    address: AXON_ADDRESS,
    abi: AXON_ABI,
    functionName: "stats",
    args: target ? [target] : undefined,
    query: {
      enabled: IS_DEPLOYED && Boolean(target),
      refetchInterval: 8_000,
      select: (d) => {
        const [runs, earned, meanScore] = d as [bigint, bigint, bigint];
        return {
          runs: Number(runs),
          earnedWei: earned,
          earnedMon: Number(formatEther(earned)),
          meanScore: Number(meanScore),
        };
      },
    },
  });
}

export type FeedEntry = {
  trajectoryId: number;
  taskId: number;
  contributor: `0x${string}`;
  score: number;
  paidMon: number;
  trajHash: `0x${string}`;
  at: number;
  txHash?: string;
};

/**
 * The network's activity, read straight from the trajectory ledger.
 *
 * Not from event logs: the public RPC caps a getLogs range far below the
 * history this needs, and the contract already stores every trajectory in an
 * array, so counting back from the head is both cheaper and complete. The
 * transaction hash is the one field the contract does not keep, so it is
 * joined in from the trajectory store.
 */
/**
 * The feed, read from the contract's own log.
 *
 * This used to read `trajectoryCount` and then fan out one `getTrajectory` call
 * per entry — forty round trips for forty rows — and then join the transaction
 * hashes from our database, because a `Trajectory` struct has no room for the
 * transaction that created it.
 *
 * The event has everything: task, contributor, hash, score, payment. And a log
 * carries the transaction it was emitted in, so the hashes come for free and
 * the feed stops depending on our database at all — it resolves from an RPC
 * endpoint and nothing else.
 *
 * Walked backwards in windows rather than asked for in one range: public
 * endpoints cap how many blocks a single `getLogs` may span, and the contract's
 * history only grows.
 */
const WINDOW = 2_000n;
const MAX_WINDOWS = 40;

export function useActivity(limit = 40) {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["activity", limit],
    enabled: IS_DEPLOYED,
    refetchInterval: 5_000,
    queryFn: async (): Promise<FeedEntry[]> => {
      if (!client) return [];

      const head = await client.getBlockNumber();
      const found: FeedEntry[] = [];

      for (let i = 0; i < MAX_WINDOWS && found.length < limit; i += 1) {
        const to = head - WINDOW * BigInt(i);
        const from = to > WINDOW ? to - WINDOW + 1n : 0n;

        const logs = await client.getLogs({
          address: AXON_ADDRESS,
          event: {
            type: "event",
            name: "TrajectoryAccepted",
            inputs: [
              { name: "trajectoryId", type: "uint256", indexed: true },
              { name: "taskId", type: "uint256", indexed: true },
              { name: "contributor", type: "address", indexed: true },
              { name: "trajHash", type: "bytes32", indexed: false },
              { name: "cid", type: "string", indexed: false },
              { name: "score", type: "uint16", indexed: false },
              { name: "paid", type: "uint256", indexed: false },
            ],
          },
          fromBlock: from,
          toBlock: to,
        });

        for (const log of logs.reverse()) {
          const a = log.args as {
            trajectoryId?: bigint; taskId?: bigint; contributor?: `0x${string}`;
            trajHash?: `0x${string}`; score?: number; paid?: bigint;
          };
          if (a.trajectoryId === undefined || a.trajHash === undefined) continue;
          found.push({
            trajectoryId: Number(a.trajectoryId),
            taskId: Number(a.taskId ?? 0n),
            contributor: a.contributor ?? "0x0000000000000000000000000000000000000000",
            score: Number(a.score ?? 0),
            paidMon: Number(formatEther(a.paid ?? 0n)),
            trajHash: a.trajHash,
            // Straight off the log, rather than joined from our database.
            txHash: log.transactionHash ?? undefined,
            // The block's own time, so the feed is ordered by the chain.
            at: Number(log.blockNumber) ,
          } as FeedEntry);
        }

        if (from === 0n) break;
      }

      // Timestamps, once, for the blocks actually shown — rather than a call
      // per entry for blocks most of them share.
      const blocks = [...new Set(found.map((e) => e.at))];
      const times = new Map<number, number>();
      await Promise.all(
        blocks.slice(0, limit).map(async (n) => {
          try {
            const b = await client.getBlock({ blockNumber: BigInt(n) });
            times.set(n, Number(b.timestamp) * 1000);
          } catch {
            // Left as the block number; the row still renders and still links.
          }
        }),
      );
      for (const e of found) e.at = times.get(e.at) ?? Date.now();

      return found.slice(0, limit);
    },
  });
}

/** Standings, aggregated from the same ledger. */
export function useLeaderboard() {
  const activity = useActivity(500);

  return useMemo(() => {
    const rows = new Map<
      string,
      { address: `0x${string}`; runs: number; earned: number; scoreSum: number; tasks: Set<number> }
    >();

    for (const e of activity.data ?? []) {
      const k = e.contributor.toLowerCase();
      const r =
        rows.get(k) ??
        { address: e.contributor, runs: 0, earned: 0, scoreSum: 0, tasks: new Set<number>() };
      r.runs += 1;
      r.earned += e.paidMon;
      r.scoreSum += e.score;
      r.tasks.add(e.taskId);
      rows.set(k, r);
    }

    const list = [...rows.values()]
      .map((r) => ({
        address: r.address,
        runs: r.runs,
        earned: r.earned,
        meanScore: r.runs ? Math.round(r.scoreSum / r.runs) : 0,
        tasks: r.tasks.size,
      }))
      .sort((a, b) => b.earned - a.earned || b.meanScore - a.meanScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return { ...activity, standings: list };
  }, [activity]);
}

export type ChainPolicy = {
  id: number;
  taskId: number;
  minter: `0x${string}`;
  trajectories: number;
  mintedAt: number;
  licenceWei: bigint;
  licenceMon: number;
  licencesSold: number;
  distributedMon: number;
};

export function usePolicies() {
  const config = useConfig();
  return useQuery({
    queryKey: ["policies"],
    enabled: IS_DEPLOYED,
    refetchInterval: 8_000,
    queryFn: async (): Promise<ChainPolicy[]> => {
      const n = (await readContracts(config, {
        contracts: [{ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "policyCount" }],
      }))[0].result as bigint | undefined;

      const count = Number(n ?? 0n);
      if (!count) return [];

      const rows = await readContracts(config, {
        contracts: Array.from({ length: count }, (_, i) => ({
          address: AXON_ADDRESS,
          abi: AXON_ABI,
          functionName: "getPolicy" as const,
          args: [BigInt(i)] as const,
        })),
      });

      const badPolicies = rows.filter((r) => r.status !== "success").length;
      if (badPolicies) throw new Error(`${badPolicies} of ${rows.length} policy reads failed`);

      return rows
        .map((r, i) => {
          if (r.status !== "success") return null;
          const p = r.result as {
            taskId: bigint; minter: `0x${string}`; trajectories: number;
            mintedAt: bigint; licenceFee: bigint; licencesSold: number; distributed: bigint;
          };
          return {
            id: i,
            taskId: Number(p.taskId),
            minter: p.minter,
            trajectories: Number(p.trajectories),
            mintedAt: Number(p.mintedAt) * 1000,
            licenceWei: p.licenceFee,
            licenceMon: Number(formatEther(p.licenceFee)),
            licencesSold: Number(p.licencesSold),
            distributedMon: Number(formatEther(p.distributed)),
          };
        })
        .filter(Boolean) as ChainPolicy[];
    },
  });
}

export function useCapTable(policyId: number | undefined) {
  return useReadContract({
    address: AXON_ADDRESS,
    abi: AXON_ABI,
    functionName: "capTable",
    args: policyId === undefined ? undefined : [BigInt(policyId)],
    query: {
      enabled: IS_DEPLOYED && policyId !== undefined,
      select: (d) => {
        const [who, bps, payout] = d as [`0x${string}`[], bigint[], bigint[]];
        return who.map((a, i) => ({
          address: a,
          weightBps: Number(bps[i]),
          payoutMon: Number(formatEther(payout[i])),
        }));
      },
    },
  });
}
