"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccount, useConfig, useReadContract, usePublicClient } from "wagmi";
import { readContracts } from "wagmi/actions";
import { formatEther, toFunctionSelector } from "viem";
import { AXON_ABI } from "./abi";
import { AXON_ADDRESS, IS_DEPLOYED, scenarioName } from "./chain";
import { DEPLOYED } from "./registry";
import { parSecondsFor } from "./par";
import { scanLogs } from "./scan-logs";

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
  /**
   * Unix milliseconds after which the funder may reclaim what is left, or null
   * where the task carries no deadline at all.
   *
   * Zero on chain means never, which is version one's behaviour and is what
   * this interface's own Post button still creates — so a task made here can
   * never return its escrow. Carried as null rather than 0 because "no
   * deadline" and "expired in 1970" are not the same task.
   */
  expiresAt: number | null;
  /** The funder has closed it and taken the unspent escrow back. */
  closed: boolean;
  /** Past its deadline, whether or not anybody has closed it yet. */
  expired: boolean;
  /**
   * Whether a run driven now can be paid.
   *
   * Slots alone was the test, which is why a closed task with no escrow still
   * offered a Run button: the interface was decoding a version-one Task and
   * could not see `closed` at all. An operator would have driven it and been
   * refused at the contract, after the work.
   */
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
  expiresAt: bigint;
  closed: boolean;
};

function shape(raw: RawTask, id: number): ChainTask {
  const expiresAt = Number(raw.expiresAt) > 0 ? Number(raw.expiresAt) * 1000 : null;
  const expired = expiresAt !== null && Date.now() >= expiresAt;
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
    expiresAt,
    closed: Boolean(raw.closed),
    expired,
    open:
      Number(raw.slotsFilled) < Number(raw.slotsTotal) &&
      !raw.policyMinted &&
      !raw.closed &&
      !expired,
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
      select: (data) => (data as readonly RawTask[]).map(shape),
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
 * Asked for in one range rather than walked backwards in windows. The window
 * walk was written against an assumption about the endpoint's range cap that
 * turned out to be wrong, and the walk it produced expired: see the note in the
 * query below.
 */

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

      /**
       * One call over the whole history, not a walk back from the head.
       *
       * This used to read forty windows of two thousand blocks — eighty
       * thousand in all — on the assumption that the public endpoint would
       * refuse a wider range. It does not: Fuji answers a million-block
       * `getLogs` on this address in a single round trip, which is how the
       * attestation and mean-score reads here already work.
       *
       * The assumption was not merely inefficient, it was a time bomb. A window
       * measured back from the head only contains the history while the history
       * is recent, and Fuji produces about forty-three thousand blocks a day.
       * Eighty thousand blocks is under two days. Every run on this deployment
       * passed out of that window a week after it was recorded, and the
       * standings, the feed and everything derived from them went quietly empty
       * — not with an error, with a legitimate-looking nothing.
       *
       * A range anchored to the deployment rather than to the clock cannot do
       * that. The result is sliced to `limit` after ordering, which is what the
       * early exit was really for.
       */
      const LOOKBACK = 1_000_000n;
      const event = {
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
      } as const;

      type EventLog = Awaited<ReturnType<typeof client.getLogs<typeof event>>>[number];
      const logs = await scanLogs(
        (r) => client.getLogs({ address: AXON_ADDRESS, event, ...r }),
        { fromBlock: head > LOOKBACK ? head - LOOKBACK : 0n, toBlock: head },
      );
      const hits: { log: EventLog }[] = logs.map((log) => ({ log }));

      // Ordered explicitly rather than by the order the requests happened to
      // return in. Newest first, and within a block the later log first, which
      // is what the feed and the standings both assume.
      hits.sort((a, b) => {
        const d = Number((b.log.blockNumber ?? 0n) - (a.log.blockNumber ?? 0n));
        return d !== 0 ? d : (b.log.logIndex ?? 0) - (a.log.logIndex ?? 0);
      });

      for (const { log } of hits.slice(0, Math.max(limit, 1))) {
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
          txHash: log.transactionHash ?? undefined,
          at: Number(log.blockNumber),
        } as FeedEntry);
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

/**
 * The on-chain record that a policy was attested, if one exists.
 *
 * `payloadFor` says what a receipt *would* contain. It is a view, so it answers
 * for every policy whether or not anybody ever signed one — which is useful and
 * is not evidence. The evidence is the `Attested` event: a transaction that
 * actually went through the Warp precompile and came back with a message id
 * signed by Fuji's validators.
 *
 * One `getLogs` call, not the backwards window walk `useActivity` needs. That
 * walk exists because the trajectory feed wants the newest N of a busy event
 * and the endpoint caps a range; this wants every occurrence of a rare one, the
 * policy id is indexed so the node does the filtering, and Fuji's public
 * endpoint answers a million-block range for it in a single round trip. A
 * window walk here would be forty requests to find nothing thirty-nine times.
 */
const LICENCE_RECEIPT_ADDRESS = DEPLOYED.find((d) => d.key === "licence")!.address;

const ATTESTED_EVENT = {
  type: "event",
  name: "Attested",
  inputs: [
    { name: "policyId", type: "uint256", indexed: true },
    { name: "messageID", type: "bytes32", indexed: true },
    { name: "by", type: "address", indexed: true },
  ],
} as const;

/** Comfortably wider than this deployment's whole history, and accepted in one call. */
const ATTEST_LOOKBACK = 1_000_000n;

export type Attestation = {
  messageID: `0x${string}`;
  by: `0x${string}`;
  blockNumber: bigint;
  txHash: `0x${string}`;
};

export function useAttestation(policyId: number | undefined) {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["attestation", policyId],
    enabled: IS_DEPLOYED && policyId !== undefined,
    // A signature already given does not change. Refetching it every few
    // seconds would be a request per tick for an answer that is fixed.
    staleTime: 60_000,
    queryFn: async (): Promise<Attestation | null> => {
      if (!client || policyId === undefined) return null;
      const head = await client.getBlockNumber();
      const logs = await scanLogs(
        (r) => client.getLogs({
          address: LICENCE_RECEIPT_ADDRESS,
          event: ATTESTED_EVENT,
          args: { policyId: BigInt(policyId) },
          ...r,
        }),
        { fromBlock: head > ATTEST_LOOKBACK ? head - ATTEST_LOOKBACK : 0n, toBlock: head },
      );
      if (!logs.length) return null;
      // The first one is the one that matters: re-attesting produces a second
      // signature over the same claim, and the receipt is dated by when the
      // claim was first signed rather than by the last time somebody re-signed it.
      const first = logs.reduce((a, b) => ((a.blockNumber ?? 0n) <= (b.blockNumber ?? 0n) ? a : b));
      return {
        messageID: first.args.messageID as `0x${string}`,
        by: first.args.by as `0x${string}`,
        blockNumber: first.blockNumber ?? 0n,
        txHash: first.transactionHash as `0x${string}`,
      };
    },
  });
}

/**
 * What a call costs, measured rather than estimated.
 *
 * The station has always told an operator what a run pays and never what it
 * costs, and the two arrive together — one transaction records the trajectory
 * and pays for it. The same hole was on the funder's side: /post priced the
 * escrow to four decimals and said nothing about the transaction that places
 * it. In both cases gas only appeared afterwards, when there was nothing left
 * to decide.
 *
 * It cannot be estimated the usual way. `estimateContractGas` for a submit
 * needs the verifier's signature over that exact trajectory, which does not
 * exist until the submit is under way. So the figure here is not an estimate of
 * this transaction; it is what the last handful of real ones actually burned,
 * read off their receipts, priced at the gas the chain is quoting right now.
 *
 * Keyed by which function was called, because they are not the same
 * transaction. `submitTrajectoryWithPasskey` verifies a P-256 signature through
 * a precompile before it does anything else, and quoting one path's gas for
 * another would be quoting a number for a transaction nobody sent.
 */
export type SubmitCost = {
  /** Wei per gas the chain is quoting now. */
  gasPriceWei: bigint;
  /** Median gas charged, over the samples for this path. */
  medianGas: number | null;
  lowGas: number | null;
  highGas: number | null;
  /** How many real transactions that median stands on. */
  samples: number;
  /** Median gas at the current price, in the native token. */
  costMon: number | null;
  /**
   * Whether every sample was charged at least half the gas limit its wallet
   * set — which is what the receipts say, and what makes a generous limit
   * expensive here rather than merely cautious.
   */
  chargedToTheLimit: boolean;
};

/** The calls whose cost anything asks about, and the event that finds them. */
const ACCEPTED_EVENT = {
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
} as const;

const TASK_CREATED_EVENT = {
  type: "event",
  name: "TaskCreated",
  inputs: [
    { name: "taskId", type: "uint256", indexed: true },
    { name: "funder", type: "address", indexed: true },
    { name: "name", type: "string", indexed: false },
    { name: "slots", type: "uint32", indexed: false },
    { name: "reward", type: "uint128", indexed: false },
    { name: "scenario", type: "uint8", indexed: false },
    { name: "difficulty", type: "uint8", indexed: false },
  ],
} as const;

const CALLS = {
  submit: {
    event: ACCEPTED_EVENT,
    signature: "submitTrajectory(uint256,bytes32,string,uint16,bytes)",
  },
  submitWithPasskey: {
    event: ACCEPTED_EVENT,
    signature: "submitTrajectoryWithPasskey(uint256,bytes32,string,uint16,bytes,bytes32,bytes32)",
  },
  createTask: {
    event: TASK_CREATED_EVENT,
    signature: "createTask(string,uint32,uint128,uint8,uint8)",
  },
  // Not a variant of the one above with an extra argument: a task created
  // without a deadline can never be closed, so its escrow can never return.
  // Different function, different gas, and a different offer.
  createTaskUntil: {
    event: TASK_CREATED_EVENT,
    signature: "createTaskUntil(string,uint32,uint128,uint8,uint8,uint64)",
  },
} as const;

export type CallKind = keyof typeof CALLS;

const COST_LOOKBACK = 200_000n;
const COST_SAMPLES = 6;

export function useObservedCost(kind: CallKind) {
  const client = usePublicClient();
  const call = CALLS[kind];

  const q = useQuery({
    queryKey: ["observed-cost", kind],
    enabled: IS_DEPLOYED,
    // The gas price moves; the observed gas of a fixed code path does not.
    // A minute is short enough that the price shown is the price charged and
    // long enough that opening a panel does not re-scan the chain.
    staleTime: 60_000,
    queryFn: async () => {
      if (!client) return null;
      const [head, gasPriceWei] = await Promise.all([client.getBlockNumber(), client.getGasPrice()]);

      const logs = await scanLogs(
        (r) => client.getLogs({ address: AXON_ADDRESS, event: call.event, ...r }),
        { fromBlock: head > COST_LOOKBACK ? head - COST_LOOKBACK : 0n, toBlock: head },
      );

      // Newest first, and only as many as are needed to have a median worth
      // quoting. Each sample is two calls; twenty of them would be forty.
      const recent = logs
        .sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)))
        .map((l) => l.transactionHash)
        .filter((h, i, all): h is `0x${string}` => Boolean(h) && all.indexOf(h) === i)
        .slice(0, COST_SAMPLES);

      const measured = await Promise.all(
        recent.map(async (hash) => {
          try {
            const [receipt, txn] = await Promise.all([
              client.getTransactionReceipt({ hash }),
              client.getTransaction({ hash }),
            ]);
            return {
              gas: Number(receipt.gasUsed),
              limit: Number(txn.gas),
              selector: txn.input.slice(0, 10).toLowerCase(),
            };
          } catch {
            return null;
          }
        }),
      );

      return {
        gasPriceWei,
        measured: measured.filter(Boolean) as { gas: number; limit: number; selector: string }[],
      };
    },
  });

  return useMemo((): SubmitCost | null => {
    if (!q.data) return null;
    const { gasPriceWei, measured } = q.data;
    const want = toFunctionSelector(call.signature).toLowerCase();

    // Only this call's own samples. There is no falling back to another's:
    // quoting one function's gas for a different one is quoting a number for a
    // transaction nobody sent, and saying nothing is the honest answer when
    // nothing has gone that way yet.
    const pool = measured.filter((m) => m.selector === want);
    if (!pool.length) {
      return {
        gasPriceWei, medianGas: null, lowGas: null, highGas: null,
        samples: 0, costMon: null, chargedToTheLimit: false,
      };
    }

    const gas = pool.map((m) => m.gas).sort((a, b) => a - b);
    const medianGas = gas[Math.floor(gas.length / 2)];

    /**
     * Every sample charged at least half the limit its wallet set.
     *
     * Fifteen transactions on this contract — nine submits and six task
     * postings — and in every one the receipt's gasUsed is exactly max(what the
     * call needed, half the gas limit). A re-estimate of one submit against its
     * own parent block answers 394,668; it was charged 600,000, half of the
     * 1,200,000 its wallet asked for. So a wallet that doubles an estimate for
     * safety does not buy headroom here — it sets the price. Reported rather
     * than corrected: fixing it means pinning a gas limit, and a limit pinned
     * too tight fails a real transaction.
     */
    const chargedToTheLimit = pool.every((m) => m.gas >= Math.floor(m.limit / 2));

    return {
      gasPriceWei,
      medianGas,
      lowGas: gas[0],
      highGas: gas[gas.length - 1],
      samples: gas.length,
      costMon: Number(gasPriceWei * BigInt(medianGas)) / 1e18,
      chargedToTheLimit,
    };
  }, [q.data, call.signature]);
}

/** The station's own question, in the station's own terms. */
export function useSubmitCost(withPasskey: boolean) {
  return useObservedCost(withPasskey ? "submitWithPasskey" : "submit");
}

/**
 * How every accepted run on this deployment actually scored.
 *
 * A funder escrows slots times reward and the contract pays reward scaled by
 * the run's score, so the escrow is a ceiling rather than a price. What it will
 * really draw depends on how well people drive, and this deployment has an
 * answer to that — it is on the chain. Read here so /post can quote it instead
 * of leaving a funder to assume every run pays in full.
 */
export function useAcceptedScores() {
  const client = usePublicClient();

  return useQuery({
    queryKey: ["accepted-scores"],
    enabled: IS_DEPLOYED,
    staleTime: 60_000,
    queryFn: async (): Promise<{ n: number; meanScore: number } | null> => {
      if (!client) return null;
      const head = await client.getBlockNumber();
      // Wider than the cost scan on purpose: a median gas figure wants recent
      // transactions, and a mean score wants all of them.
      const logs = await scanLogs(
        (r) => client.getLogs({ address: AXON_ADDRESS, event: ACCEPTED_EVENT, ...r }),
        { fromBlock: head > 1_000_000n ? head - 1_000_000n : 0n, toBlock: head },
      );
      if (!logs.length) return { n: 0, meanScore: 0 };
      const scores = logs.map((l) => Number(l.args.score ?? 0));
      return { n: scores.length, meanScore: scores.reduce((a, b) => a + b, 0) / scores.length };
    },
  });
}
