"use client";

import { ModelView } from "@/components/model-stage";
import { cn } from "@/lib/cn";
import type { Prop } from "@/lib/props";

/**
 * One prop, rendered from the GLB the station will actually load.
 *
 * The preview is the same asset the run uses, not a picture of it — a thumbnail
 * that drifts from the model is how a funder ends up escrowing against a scene
 * they never saw.
 *
 * Drawing is delegated to the shared stage: a page of these used to be a page
 * of WebGL contexts, and browsers stop handing them out well before the
 * inventory runs out of models.
 */
export function PropPreview({ url, className }: { url: string; className?: string }) {
  return <ModelView url={url} className={className} />;
}

/** A row of props to choose between, each previewed as the model it is. */
export function PropPicker({
  label, hint, options, value, onChange,
}: {
  label: string;
  hint: string;
  options: Prop[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="border-t border-rule py-5">
      <div className="mb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe-3">{label}</div>
      <p className="mb-3 max-w-[62ch] text-[14px] leading-relaxed text-scribe-3">{hint}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {options.map((p) => {
          const on = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(p.id)}
              className={cn(
                "group flex flex-col overflow-hidden border text-left transition-colors",
                on ? "border-signal bg-signal-dim" : "border-rule bg-ink-2 hover:border-rule-strong",
              )}
            >
              <PropPreview url={p.url} className="h-[74px] w-full" />
              <span
                className={cn(
                  // The label step is the documented floor; a tile narrower
                  // than its own caption is a layout problem, not a type one.
                  "block truncate border-t px-2 py-1 font-mono text-[12px] leading-tight",
                  on ? "border-signal/40 text-signal-hi" : "border-rule text-scribe-3",
                )}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
