"use client";

import { useEffect } from "react";

/**
 * The tab says what the page is: not found.
 *
 * A route that calls notFound() still streams its own metadata to the
 * browser, so /task/9999 showed "Nothing is measured here." under a tab
 * titled "Task #9999", and /q/abc under the company's title. The server's
 * HTML already says "Not found"; this keeps the browser saying it too.
 */
export function NotFoundTitle() {
  useEffect(() => {
    document.title = "Not found — Thenar";
  }, []);
  return null;
}
