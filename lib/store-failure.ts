/**
 * Whose answer a failed read was.
 *
 * "This deployment has never stored that hash" and "the store did not answer"
 * are different facts, and one of them is about the reader's run while the
 * other is about us. Saying the first when the second is true is the site
 * asserting something it does not know, on pages whose whole claim is that
 * every figure can be checked.
 *
 * The status alone does not separate them, which was the first guess and was
 * wrong: a 404 can be our route reporting no such hash, and it can be the edge
 * in front of us reporting no such application. While the backend was gone
 * those were indistinguishable, and every run page told its reader the run had
 * never existed.
 *
 * What separates them is the shape of the body. Our routes answer a 404 with
 * `{ error: string }` and nothing else; a platform 404 carries its own
 * envelope. So "absent" is claimed only when our own store is the thing that
 * said so, and anything else is reported as not knowing.
 */
export type ReadFailure = "absent" | "unreachable";

/** True when the body is one of our own JSON errors rather than an edge's. */
export function isOurError(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  if (typeof o.error !== "string") return false;
  // Platform envelopes carry a correlation id and a machine-readable code
  // alongside their message. Ours carry a sentence and nothing else.
  return !("request_id" in o) && !("requestId" in o) && !("code" in o);
}

export function classifyRead(status: number, body: unknown): ReadFailure {
  return status === 404 && isOurError(body) ? "absent" : "unreachable";
}
