"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DimRule } from "@/components/primitives";
import { PropPreview } from "@/components/prop-picker";
import { PROPS, type Prop } from "@/lib/props";
import { ENVIRONMENTS } from "@/lib/environments";
import { SCENARIOS } from "@/lib/chain";
import { cn } from "@/lib/cn";

type Kind = "all" | "payload" | "target" | "room";

export default function InventoryPage() {
  const [kind, setKind] = useState<Kind>("all");
  const [room, setRoom] = useState<string>("all");
  const [uploaded, setUploaded] = useState<Prop[]>([]);

  // Models funders have uploaded are part of the inventory too — leaving them
  // out would make this page a picture of the repo rather than of the library.
  useEffect(() => {
    let live = true;
    fetch("/api/props")
      .then((r) => r.json())
      .then((d: { props?: { id: string; label: string; role: string; width_mm: number; bytes: number }[] }) => {
        if (!live) return;
        setUploaded(
          (d.props ?? []).map((p) => ({
            id: p.id, label: p.label, scenario: "uploaded",
            role: p.role as Prop["role"], widthMm: p.width_mm,
            url: `/api/props/${p.id}`, bytes: p.bytes,
          })),
        );
      })
      .catch(() => { if (live) setUploaded([]); });
    return () => { live = false; };
  }, []);

  const items = useMemo(() => {
    const props = [...PROPS, ...uploaded].map((p) => ({
      key: `p:${p.id}`, label: p.label, url: p.url, bytes: p.bytes,
      kind: p.role as Kind, room: p.scenario,
      detail: `${p.widthMm} mm`,
    }));
    const rooms = ENVIRONMENTS.map((e) => ({
      key: `e:${e.id}`, label: e.label, url: e.url, bytes: e.bytes,
      kind: "room" as Kind, room: e.id,
      detail: `${e.surfaceWidthMm} × ${e.surfaceDepthMm} mm`,
    }));
    return [...rooms, ...props]
      .filter((i) => kind === "all" || i.kind === kind)
      .filter((i) => room === "all" || i.room === room);
  }, [kind, room, uploaded]);

  const counts = {
    payload: PROPS.filter((p) => p.role === "payload").length + uploaded.filter((p) => p.role === "payload").length,
    target: PROPS.filter((p) => p.role === "target").length + uploaded.filter((p) => p.role === "target").length,
    room: ENVIRONMENTS.length,
  };
  const bytes = [...PROPS, ...uploaded, ...ENVIRONMENTS].reduce((n, i) => n + i.bytes, 0);

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Inventory</h1>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-scribe-2">
        Every object a task can be built from. Each one is generated from named
        dimensions by the same kernel that makes the arm &mdash; there is no modelling
        package in the loop and no asset file to lose. Pick a room and two objects
        when you post a task and the station draws exactly these, at these sizes.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-rule py-3">
        <Reading label="Rooms" value={counts.room} />
        <Reading label="Payloads" value={counts.payload} />
        <Reading label="Landmarks" value={counts.target} />
        <Reading label="Library" value={`${(bytes / 1e6).toFixed(2)} MB`} mono />
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <Filter
          label="Kind"
          options={[["all", "Everything"], ["room", "Rooms"], ["payload", "Payloads"], ["target", "Landmarks"]]}
          value={kind}
          onChange={(v) => setKind(v as Kind)}
        />
        <Filter
          label="Room"
          options={[["all", "Any"], ...SCENARIOS.map((s) => [s, s] as [string, string]),
                    ...(uploaded.length ? [["uploaded", "uploaded"] as [string, string]] : [])]}
          value={room}
          onChange={setRoom}
        />
      </div>

      <DimRule className="mt-6" note={`${items.length} shown`} />

      {items.length === 0 ? (
        <div className="mt-6 border border-rule px-6 py-16 text-center">
          <p className="text-[15px] text-scribe-2">Nothing matches those filters.</p>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((i) => (
            <li key={i.key} className="flex flex-col overflow-hidden border border-rule bg-ink-2">
              <PropPreview url={i.url} className="h-[104px] w-full" />
              <div className="border-t border-rule px-2 py-1.5">
                <span className="block truncate font-mono text-[12px] leading-tight text-scribe">{i.label}</span>
                <span className="mt-0.5 flex items-baseline justify-between gap-2 font-mono text-[12px] tabular-nums text-scribe-3">
                  <span>{i.detail}</span>
                  <span>{(i.bytes / 1024).toFixed(0)} kB</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-[14px] leading-relaxed text-scribe-3">
        Your own model can join this library &mdash;{" "}
        <Link href="/post" className="text-scribe-2 underline underline-offset-2 hover:text-probe">
          upload a glTF binary when you post a task
        </Link>{" "}
        and it is validated, de-duplicated by digest and stored beside the runs
        recorded against it.
      </p>
    </div>
  );
}

function Reading({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="label">{label}</span>
      <span className={cn("font-mono text-[15px] tabular-nums", mono ? "text-scribe-2" : "text-scribe")}>{value}</span>
    </span>
  );
}

function Filter({
  label, options, value, onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <span className="label w-[46px] shrink-0">{label}</span>
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "border px-2.5 py-1 font-mono text-[12px] capitalize transition-colors",
            value === v ? "border-scribe bg-scribe text-ink-0" : "border-rule text-scribe-3 hover:border-rule-strong",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
