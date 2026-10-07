import { NextResponse } from "next/server";
import { AXON_ADDRESS, appChain } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this protocol will answer, and how to ask.
 *
 * "Public API keys" was rejected because everything here is already public,
 * and that was true about keys and wrong about the API. Nothing needed a key;
 * what was missing was that no page on another origin could call it at all,
 * and that there was no list of what to call. Both are the actual substance of
 * the idea, and neither has anything to do with authentication.
 *
 * Served as JSON rather than only as prose, so a client can discover the
 * surface rather than a person having to read a page and retype it.
 */
const ENDPOINTS = [
  { path: "/api/feed", returns: "The most recent settled runs on this chain, newest first." },
  { path: "/api/trajectory/{hash}", returns: "One run: its score, its samples, and the hash re-derived from those samples." },
  { path: "/api/task/{id}/runs", returns: "Every accepted run against one task, best score first." },
  { path: "/api/task/{id}/paths", returns: "The payload path of every run on a task, for overlaying." },
  { path: "/api/task/{id}/history", returns: "What has happened to one task over time." },
  { path: "/api/dataset?taskId={id}", returns: "A task's whole corpus as LeRobot episodes." },
  { path: "/api/dataset?traj={hash}", returns: "One run as a single LeRobot episode." },
  { path: "/api/dataset/summary?taskId={id}", returns: "Episode count, score spread and contributor spread, before licensing." },
  { path: "/api/archive", returns: "Runs settled under a previous deployment, on the chain they settled on." },
  { path: "/api/props", returns: "Models uploaded by task funders." },
  { path: "/api/props/{id}", returns: "One uploaded model, as GLB." },
  { path: "/api/stats", returns: "Aggregate usage. Counts with no subject." },
  { path: "/api/health", returns: "Every condition that has to hold for a run to be recorded and paid." },
  { path: "/api/calls/{address}", returns: "One address's calls to the protocol, from Monadscan's index, reverted ones included." },
  { path: "/api/space", returns: "Who is working which task right now. Presence only." },
];

export async function GET() {
  return NextResponse.json({
    name: "Thenar",
    what: "Crowdsourced robot manipulation data, settled on chain per run.",
    chain: { id: appChain.id, name: appChain.name, contract: AXON_ADDRESS },
    // Said plainly, because the absence of a key is a design decision and not
    // an oversight someone should feel clever for noticing.
    auth: "None. Every read below is public because everything it returns is " +
      "already on chain or already on the site. Reads are open cross-origin; " +
      "writes are not, and are refused at the browser's preflight rather than " +
      "by a rule that could drift.",
    verify:
      "Every run's hash is re-derived from its stored samples on read. If the " +
      "value it re-derives disagrees with the one the contract recorded, the " +
      "response says so rather than hiding it.",
    endpoints: ENDPOINTS,
  });
}
