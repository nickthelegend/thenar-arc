/**
 * One line per request, parseable.
 *
 * When a submission failed in production the only record was whatever the
 * platform happened to capture — no request id, no way to tie a client's report
 * to a server event, and nothing a log tool could group by. These are single
 * JSON lines on stdout, which is what Railway collects, so a route can be
 * filtered by name or status without a log service in the middle.
 *
 * Never logs a body. Trajectory samples are the product and an address is
 * personal; the shape of a request is enough to debug it.
 */

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function requestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function logLine(level: "info" | "warn" | "error", event: string, fields: LogFields = {}) {
  // `message` is what Railway's viewer renders. Without it a structured line
  // shows as a blank row — the log fires, the count and timing are right, and
  // an operator scrolling the console sees nothing at all. The structured
  // fields stay beside it, so the line is still machine-readable.
  const message = [
    event,
    fields.route ?? "",
    fields.status !== undefined ? `-> ${fields.status}` : "",
    fields.ms !== undefined ? `${fields.ms}ms` : "",
    fields.id ? `#${fields.id}` : "",
    fields.error ? `: ${fields.error}` : "",
  ].filter(Boolean).join(" ");

  const line = { t: new Date().toISOString(), level, event, message, ...fields };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

/**
 * Wrap a route handler so every call reports how it went.
 *
 * Duration and status come from the handler actually running, not from an
 * assumption about it: a thrown error is logged and rethrown rather than
 * swallowed, so the boundary above still sees it.
 */
export function logged<T extends unknown[]>(
  name: string,
  handler: (...args: T) => Promise<Response>,
) {
  return async (...args: T): Promise<Response> => {
    const id = requestId();
    const started = Date.now();
    try {
      const res = await handler(...args);
      logLine(res.status >= 500 ? "error" : res.status >= 400 ? "warn" : "info", "request", {
        id, route: name, status: res.status, ms: Date.now() - started,
      });
      return res;
    } catch (e) {
      logLine("error", "request", {
        id, route: name, status: 500, ms: Date.now() - started,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  };
}
