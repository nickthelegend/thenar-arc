"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAccount, useConfig, useReadContract, usePublicClient } from "wagmi";
import { readContracts } from "wagmi/actions";
import { formatEther, toFunctionSelector } from "viem";
import { AXON_ABI } from "./abi";
import { AXON_ADDRESS, IS_DEPLOYED, scenarioName } from "./chain";
import { parSecondsFor } from "./par";
import { armOf, instructionOf, parseScan, type ArmKind, type ScannedScene } from "./scan";

export type ChainTask = {
  id: number;
  /** The instruction as a sentence, without the tags the name carries on chain. */
  name: string;
  /** The name exactly as the contract stores it, tags and all. The verifier
   *  reads the goal from this, so anything that scores must too. */
  chainName: string;
  /** Which arm the task is for: "[arm so101]" in the name, THENAR-6 otherwise. */
  arm: ArmKind;
  /** Where the payload and its target really stood, for a task scanned from a table. */
  scanned: ScannedScene | null;
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
    name: instructionOf(raw.name),
    chainName: raw.name,
    arm: armOf(raw.name),
    scanned: parseScan(raw.name),
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
    // A run takes a minute to drive; a feed a few seconds behind it is not
    // stale, and every tab polling a public endpoint is a tab it can throttle.
    refetchInterval: 15_000,
    queryFn: async (): Promise<FeedEntry[]> => {
      if (!client) return [];

      /**
       * Every accepted run, read from the contract's storage.
       *
       * This read the TrajectoryAccepted log from the deployment block onward,
       * which on Monad cannot work: the public endpoints answer a log query a
       * hundred blocks wide, and a day of Monad is two hundred thousand blocks.
       * The contract keeps every run in an array anyway, so the runs are read
       * from there through Multicall3 — a hundred per call, each id read once
       * and cached, because the array is only ever appended to.
       */
      const runs = await readRuns(client);
      const newest = runs.slice().reverse().slice(0, Math.max(limit, 1));

      // A run's transaction is not in storage, but the block it settled in is,
      // and a one-block log query is one every endpoint answers. Only for the
      // rows a feed shows: the standings ask for hundreds and link none.
      const hashes = await Promise.all(
        newest.slice(0, FEED_TX_LOOKUPS).map((r) => txOfRun(client, r).catch(() => undefined)),
      );

      return newest.map((r, i) => ({
        trajectoryId: r.id,
        taskId: r.taskId,
        contributor: r.contributor,
        score: r.score,
        paidMon: Number(formatEther(r.paid)),
        trajHash: r.trajHash,
        txHash: hashes[i],
        at: r.at * 1000,
      }) as FeedEntry);
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
      const head = (await readContracts(config, {
        contracts: [{ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "policyCount" }],
      }))[0];
      // A failed read is not a count of zero: it used to show "No policy has
      // been minted yet." whenever the node did not answer.
      if (head.status !== "success") throw new Error("the policy count could not be read");
      const count = Number(head.result as bigint);
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
      const gasPriceWei = await client.getGasPrice();

      // The most recent calls of this kind, found from storage: a run or a
      // task records the block it was made in, and the transaction is the one
      // log in that block that names it. Twice the samples, because a submit
      // with a passkey and one without share an event and are told apart by
      // selector below.
      const recent = (call.event === ACCEPTED_EVENT
        ? await recentRunTxs(client, COST_SAMPLES * 2)
        : await recentTaskTxs(client, COST_SAMPLES * 2)
      ).slice(0, COST_SAMPLES * 2);

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
      // Every accepted run since deployment: a mean score wants all of them,
      // and the contract's own array has all of them.
      const runs = await readRuns(client);
      if (!runs.length) return { n: 0, meanScore: 0 };
      const scores = runs.map((r) => r.score);
      return { n: scores.length, meanScore: scores.reduce((a, b) => a + b, 0) / scores.length };
    },
  });
}

// ------------------------------------------------------------------ storage reads

type Client = NonNullable<ReturnType<typeof usePublicClient>>;

/** One accepted run as the contract stores it. */
type StoredRun = {
  id: number;
  taskId: number;
  contributor: `0x${string}`;
  trajHash: `0x${string}`;
  score: number;
  paid: bigint;
  /** Unix seconds. */
  at: number;
  atBlock: bigint;
};

/** How many rows of a feed get a transaction link. Each is one small request. */
const FEED_TX_LOOKUPS = 40;
/** Runs per Multicall3 call. A getTrajectory return is a few hundred bytes. */
const READ_BATCH = 100;

const runCache: StoredRun[] = [];
let runWalk: Promise<StoredRun[]> | null = null;

/**
 * Every run the contract has accepted, oldest first.
 *
 * The array is append-only on chain, so a run once read never needs reading
 * again: later calls ask only for the ids past the last one cached. Concurrent
 * callers share one walk, and a walk that fails keeps what it had read.
 */
function readRuns(client: Client): Promise<StoredRun[]> {
  runWalk ??= (async () => {
    const count = Number(
      await client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "trajectoryCount" }),
    );
    for (let from = runCache.length; from < count; from += READ_BATCH) {
      const ids = Array.from({ length: Math.min(READ_BATCH, count - from) }, (_, k) => from + k);
      const got = await client.multicall({
        allowFailure: false,
        contracts: ids.map((id) => ({
          address: AXON_ADDRESS, abi: AXON_ABI, functionName: "getTrajectory", args: [BigInt(id)],
        } as const)),
      });
      got.forEach((t, k) => {
        runCache[ids[k]] = {
          id: ids[k],
          taskId: Number(t.taskId),
          contributor: t.contributor,
          trajHash: t.trajHash,
          score: Number(t.score),
          paid: t.paid,
          at: Number(t.at),
          atBlock: t.atBlock,
        };
      });
    }
    return runCache.slice();
  })().finally(() => {
    runWalk = null;
  });
  return runWalk;
}

const runTx = new Map<number, `0x${string}`>();

/** The transaction a run settled in: the one TrajectoryAccepted log for it, in the block it recorded. */
async function txOfRun(client: Client, run: StoredRun): Promise<`0x${string}` | undefined> {
  const known = runTx.get(run.id);
  if (known) return known;
  const logs = await client.getLogs({
    address: AXON_ADDRESS, event: ACCEPTED_EVENT, args: { trajectoryId: BigInt(run.id) },
    fromBlock: run.atBlock, toBlock: run.atBlock,
  });
  const hash = logs[0]?.transactionHash ?? undefined;
  if (hash) runTx.set(run.id, hash);
  return hash;
}

async function recentRunTxs(client: Client, n: number): Promise<`0x${string}`[]> {
  const runs = (await readRuns(client)).slice(-n).reverse();
  const hashes = await Promise.all(runs.map((r) => txOfRun(client, r).catch(() => undefined)));
  return hashes.filter((h): h is `0x${string}` => Boolean(h));
}

/** The transactions that posted the most recent tasks, found the same way as a run's. */
async function recentTaskTxs(client: Client, n: number): Promise<`0x${string}`[]> {
  const count = Number(
    await client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "taskCount" }),
  );
  const ids = Array.from({ length: Math.min(n, count) }, (_, k) => count - 1 - k);
  if (!ids.length) return [];
  const tasks = await client.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({
      address: AXON_ADDRESS, abi: AXON_ABI, functionName: "getTask", args: [BigInt(id)],
    } as const)),
  });
  const hashes = await Promise.all(
    tasks.map(async (t, k) => {
      try {
        const logs = await client.getLogs({
          address: AXON_ADDRESS, event: TASK_CREATED_EVENT, args: { taskId: BigInt(ids[k]) },
          fromBlock: t.createdBlock, toBlock: t.createdBlock,
        });
        return logs[0]?.transactionHash ?? undefined;
      } catch {
        return undefined;
      }
    }),
  );
  return hashes.filter((h): h is `0x${string}` => Boolean(h));
}
