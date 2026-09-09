"use client";

import { useEffect, useState } from "react";
import { adoptReaderLocale } from "@/lib/format";

/**
 * Switch every figure on the page into the reader's own number conventions,
 * one render after the first.
 *
 * The delay is the point. Formatting straight from `navigator.language` would
 * make the server send `0.0000` and a browser in Berlin hydrate `0,0000` — a
 * mismatch React resolves by discarding the server markup. This renders once
 * in agreement with the server, adopts the locale, and re-renders.
 *
 * Nothing happens at all for a reader whose conventions already match, which
 * is most of them: the check is whether the two locales actually format a
 * number differently, not whether their tags differ.
 */
export function LocaleReady({ children }: { children: React.ReactNode }) {
  const [, bump] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      if (adoptReaderLocale()) bump((n) => n + 1);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return <>{children}</>;
}
