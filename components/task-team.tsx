"use client";

import { useEffect, useState } from "react";
import { fmtDate, shortHash } from "@/lib/format";

type Member = { member: string; role: string; signature: string; added_at: number };

/**
 * Who is working on a task besides the address that funded it.
 *
 * Team accounts were rejected for needing an account system this project does
 * not have. It turns out not to need one: a wallet is already an identity
 * here, and a signature is already how this app proves who said something. So
 * the funder — read from the chain, not claimed — signs a statement naming an
 * address and a role, and that signature is kept beside the entry for anyone
 * who wants to check it.
 *
 * Absent entirely when a task has no named collaborators. Most do not, and an
 * empty "Team" heading on every task page would be furniture.
 */
export function TaskTeam({ taskId }: { taskId: number }) {
  const [team, setTeam] = useState<Member[]>([]);

  useEffect(() => {
    let live = true;
    fetch(`/api/task/${taskId}/team`)
      .then((r) => r.json())
      .then((d: { team?: Member[] }) => { if (live) setTeam(d.team ?? []); })
      .catch(() => { if (live) setTeam([]); });
    return () => { live = false; };
  }, [taskId]);

  if (team.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2 border border-rule bg-ink-1 px-4 py-3">
      <span className="label">Named by the funder</span>
      <ul className="flex flex-col gap-1.5">
        {team.map((m) => (
          <li key={m.member} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <a href={`/operator/${m.member}`} className="font-mono text-[13px] text-scribe-2 hover:text-probe">
              {shortHash(m.member)}
            </a>
            <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-scribe">{m.role}</span>
            <span className="font-mono text-[12px] text-scribe-3">{fmtDate(m.added_at)}</span>
            <span title={`Signed by the funder: ${m.signature}`} className="font-mono text-[12px] text-go">
              signed
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] leading-relaxed text-scribe-3">
        Each entry is signed by the task&rsquo;s funder over the task, the member
        and the role. Nothing here needs taking on trust.
      </p>
    </div>
  );
}
