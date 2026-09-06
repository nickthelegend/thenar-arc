"use client";

import Link from "next/link";
import { PROPS } from "@/lib/props";
import { PropPreview } from "@/components/prop-picker";

/**
 * The scene library, on the landing page.
 *
 * Every task names objects — "put the toothpaste into the upper drawer" — and
 * for a long time the station drew an anonymous cylinder for all of them. These
 * are the models it draws now, rendered from the same GLB the run loads rather
 * than from a screenshot of one.
 */
export function PropStrip() {
  const shown = PROPS.slice(0, 12);
  return (
    <section className="py-14">
      <h2 className="max-w-[26ch] font-display text-[clamp(1.8rem,3.4vw,2.6rem)] font-600 leading-[1.04] tracking-[-0.015em]">
        The scene is the task.
      </h2>
      <p className="mt-4 max-w-[62ch] text-[16px] leading-relaxed text-scribe-2">
        A task names the objects it is about, and the station renders those
        objects — not a stand-in. {PROPS.length} props, every one generated from
        named dimensions by the same kernel that produces the arm, so there is no
        modelling file to lose. Funders pick from these or upload their own glTF.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-px bg-rule sm:grid-cols-3 lg:grid-cols-6">
        {shown.map((p) => (
          <div key={p.id} className="bg-ink-1">
            <PropPreview url={p.url} className="h-[104px] w-full" />
            {/* Name over role rather than beside it: at the label step the two
                will not share a tile this narrow without one of them truncating. */}
            <div className="border-t border-rule px-2 py-1.5">
              <span className="block truncate font-mono text-[12px] text-scribe-2">{p.label}</span>
              <span className="block font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3">
                {p.role === "target" ? "landmark" : p.scenario}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px] text-scribe-3">
        <span>{PROPS.filter((p) => p.role === "payload").length} payloads</span>
        <span>{PROPS.filter((p) => p.role === "target").length} landmarks</span>
        <span>generated, not modelled</span>
        <Link href="/post" className="text-signal hover:text-signal-hi">
          Build a task with them →
        </Link>
      </div>
    </section>
  );
}
