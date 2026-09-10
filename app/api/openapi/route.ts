import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { appChain, AXON_ADDRESS, CORPUS_MANIFEST } from "@/lib/chain";
import { ACCEPT_FLOOR, TOLERANCE_MM } from "@/lib/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The public read surface, described.
 *
 * Everything on this site is readable without a key, and until now the only
 * way to find out what was readable was to read the source or guess. That is
 * fine for a demo and useless to the buyer this project keeps claiming to be
 * built for: the argument is that a corpus can be checked without trusting us,
 * and an unlisted API is a thing you have to be told about.
 *
 * Only the routes that read are in here. The two that write — /api/verify and
 * /api/submitted — are part of the station's own flow, require a signature
 * chain that only the station assembles, and publishing them as an interface
 * would invite people to build against something that is not one.
 *
 * The addresses and thresholds are read from the same constants the running
 * code uses, so the document cannot drift from the deployment it describes.
 */
function spec() {
  const ok = (description: string) => ({ description, content: { "application/json": {} } });
  const taskId = {
    name: "id", in: "path", required: true, schema: { type: "integer", minimum: 0 },
    description: "Task id, as the contract numbers them.",
  };
  const hash = {
    name: "hash", in: "path", required: true,
    schema: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
    description: "Trajectory hash, the same value recorded on chain.",
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Thenar",
      version: "1",
      summary: "Read a manipulation corpus and check it against the chain.",
      description:
        "Every route here is public and read-only. The claim this API exists to " +
        "support is that a corpus can be verified without trusting the server " +
        `serving it: each episode's hash is on ${appChain.name}, and the set is ` +
        "committed as a Merkle root that a single episode proves into.",
    },
    servers: [{ url: "https://thenar.io", description: "Production" }],
    "x-deployment": {
      chain: appChain.name,
      chainId: appChain.id,
      protocol: AXON_ADDRESS,
      corpusManifest: CORPUS_MANIFEST,
      acceptanceFloor: ACCEPT_FLOOR,
      placementToleranceMm: TOLERANCE_MM,
    },
    paths: {
      "/api/health": {
        get: {
          summary: "Every condition that has to hold for a run to be paid.",
          description:
            "Answers 503 while any check is failing. That is deliberate: a " +
            "degraded system must not look healthy to a monitor.",
          responses: { "200": ok("All checks pass."), "503": ok("At least one check is failing; the body says which.") },
        },
      },
      "/api/contract": {
        get: { summary: "Address, chain and ABI of the live protocol.", responses: { "200": ok("The deployment the site reads.") } },
      },
      "/api/feed": {
        get: {
          summary: "Settled runs, newest first.",
          description: "Scoped to the live chain and contract. Runs on superseded deployments are in /api/archive.",
          responses: { "200": ok("Recent paid runs.") },
        },
      },
      "/api/archive": { get: { summary: "Runs settled on superseded chains or contracts.", responses: { "200": ok("Archived runs.") } } },
      "/api/stats": { get: { summary: "Page-open counts and run statistics. No identifiers are stored.", responses: { "200": ok("Counts.") } } },
      "/api/task/{id}/runs": { get: { summary: "Accepted runs for one task, best first.", parameters: [taskId], responses: { "200": ok("Runs."), "400": ok("The id is not a non-negative integer.") } } },
      "/api/task/{id}/attempts": {
        get: {
          summary: "Every scored attempt, split by outcome.",
          description:
            "paid, failed and unsubmitted are kept apart. A pass rate over " +
            "paid ÷ (paid + failed) is meaningful; one that counted " +
            "abandonments would move when somebody closed a tab.",
          parameters: [taskId], responses: { "200": ok("Counts and attempts."), "400": ok("Bad id.") },
        },
      },
      "/api/task/{id}/paths": { get: { summary: "Every accepted approach, downsampled to 40 points.", parameters: [taskId], responses: { "200": ok("Paths."), "400": ok("Bad id.") } } },
      "/api/task/{id}/manifest": {
        get: {
          summary: "The corpus commitment, and a proof that one episode is in it.",
          description:
            "Returns the root computed from what this server would serve and the " +
            "root committed on chain. A buyer should compare them: if they differ " +
            "the corpus has grown or something is missing, and publishing both is " +
            "what makes that visible without trusting either.",
          parameters: [taskId, { name: "episode", in: "query", required: false, schema: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" }, description: "Return a Merkle proof for this episode. Null when it is not in the set." }],
          responses: { "200": ok("Roots, and a proof when an episode was named."), "400": ok("Bad id or malformed episode hash.") },
        },
      },
      "/api/task/{id}/datasheet": {
        get: { summary: "Datasheet for the task's corpus, computed at request time.", parameters: [taskId], responses: { "200": ok("Datasheet."), "404": ok("No runs recorded for that task.") } },
      },
      "/api/task/{id}/notes": { get: { summary: "Signed operator notes for a task.", parameters: [taskId], responses: { "200": ok("Notes, each with the signature that proves its author.") } } },
      "/api/task/{id}/team": { get: { summary: "Who has contributed to this task.", parameters: [taskId], responses: { "200": ok("Contributors.") } } },
      "/api/task/{id}/history": {
        get: { summary: "A funder's protocol calls, from Avalanche's own index.", parameters: [taskId, { name: "funder", in: "query", required: true, schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } }], responses: { "200": ok("Settlements."), "400": ok("funder must be an address.") } },
      },
      "/api/trajectory/{hash}": { get: { summary: "One stored trajectory, with its samples and the hash re-derived.", parameters: [hash], responses: { "200": ok("The trajectory."), "404": ok("No trajectory with that hash.") } } },
      "/api/trajectory/{hash}/similar": { get: { summary: "The paid runs closest to this one, by path distance.", parameters: [hash], responses: { "200": ok("Neighbours, nearest first."), "400": ok("Malformed hash."), "404": ok("Unknown hash.") } } },
      "/api/physics/{hash}": { get: { summary: "Re-check a stored run against the station's dynamics.", parameters: [hash], responses: { "200": ok("The re-check.") } } },
      "/api/dataset": {
        get: {
          summary: "Download a corpus, or a single episode.",
          description:
            "One episode by hash is open to anyone. A whole task's corpus needs " +
            "an active subscription, named by the x-subscriber header and checked " +
            "on chain. The export carries phase boundaries, an operator-held-out " +
            "split, and the failed runs in a separate array.",
          parameters: [
            { name: "taskId", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
            { name: "traj", in: "query", required: false, schema: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" } },
            { name: "x-subscriber", in: "header", required: false, schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" }, description: "The address whose subscription to check." },
          ],
          responses: { "200": ok("The corpus or the episode."), "400": ok("Neither taskId nor traj was given, or one was malformed."), "402": ok("No active subscription for that address."), "404": ok("Nothing recorded for that task.") },
        },
      },
      "/api/dataset/summary": { get: { summary: "What a corpus contains, without downloading it.", parameters: [{ name: "taskId", in: "query", required: true, schema: { type: "integer", minimum: 0 } }], responses: { "200": ok("Summary."), "400": ok("Missing taskId.") } } },
      "/api/glacier/{address}": { get: { summary: "One address's protocol calls, from Avalanche's index.", parameters: [{ name: "address", in: "path", required: true, schema: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" } }], responses: { "200": ok("Settlements."), "400": ok("Not an address.") } } },
      "/api/props": { get: { summary: "Models funders have uploaded.", responses: { "200": ok("Props.") } } },
      "/api/space": { get: { summary: "Open rooms and who is in them.", responses: { "200": ok("Rooms.") } } },
      "/api/snapshot": { get: { summary: "The most recent corpus snapshot written to object storage.", responses: { "200": ok("Snapshot metadata.") } } },
    },
  };
}

async function handleGET() {
  return NextResponse.json(spec(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}

export const GET = logged("/api/openapi", handleGET);
