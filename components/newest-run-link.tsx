"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * A link to the newest run this deployment holds, read when the page opens.
 *
 * The spec sheet linked one fixed hash, recorded on an earlier deployment;
 * on this one it opened "No trajectory with that hash".
 */
export function NewestRunLink({ children }: { children: React.ReactNode }) {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch("/api/feed?limit=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { runs?: { traj_hash: string }[] } | null) => { if (live) setHash(d?.runs?.[0]?.traj_hash ?? null); })
      .catch(() => { if (live) setHash(null); });
    return () => { live = false; };
  }, []);
  if (hash === undefined) return <span className="text-scribe-3">{children}</span>;
  if (hash === null) {
    return (
      <span className="text-scribe-3">
        {children} once one is recorded (<Link href="/hub" className="text-signal hover:text-signal-hi">drive one</Link>)
      </span>
    );
  }
  return <Link href={`/run/${hash}`} className="text-signal hover:text-signal-hi">{children}</Link>;
}
