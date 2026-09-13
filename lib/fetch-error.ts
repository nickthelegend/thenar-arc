/**
 * What to tell a person when a request from the page did not get an answer.
 *
 * A fetch that never reaches the server rejects with the browser's own words —
 * "Failed to fetch" in Chrome, "NetworkError when attempting to fetch
 * resource." in Firefox, "Load failed" in Safari — and a response that is not
 * JSON (a proxy's error page, a server mid-restart) rejects from `r.json()`
 * with a parser message about an unexpected token. Printed as they are, both
 * read as a crash. Anything else is already a sentence from this app or a
 * library, and is shown as it came.
 */
export function readableError(e: unknown): string {
  if (e instanceof TypeError && /failed to fetch|networkerror|load failed|fetch failed/i.test(e.message)) {
    return "Could not reach Thenar's server. Check your connection and try again.";
  }
  if (e instanceof SyntaxError) {
    return "Thenar's server sent a reply this page could not read. It may be restarting; try again in a moment.";
  }
  if (e instanceof Error) return e.message;
  return String(e);
}
