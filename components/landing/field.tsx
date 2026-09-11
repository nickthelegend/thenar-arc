"use client";

import { useState } from "react";
import spec from "@/lib/arm-spec.json";

/**
 * A picker that repaints the whole section rather than swatching a preview.
 *
 * The five materials are the ones the kernel actually assigns, with the
 * metallic and roughness values it exports — the panel is reading the same file
 * the renderer does.
 *
 * Two rules hold this together and both are about the field being swapped at
 * runtime. The panel's dividers are borders tinted from currentColor, never a
 * coloured grid showing through 1px gaps: that technique needs the cells to
 * paint the section ground, and background:inherit would resolve to the grid's
 * own ink and fill in solid over its own text. And nothing here may name a
 * grey, for the same reason — every tone is mixed from currentColor, or the
 * body copy drops to about 1.8:1 the moment a dark option is chosen.
 */
const FIELDS: Record<string, { ground: string; ink: string }> = {
  shell:   { ground: "#EFEFEE", ink: "#0D0D0F" },
  joint:   { ground: "#0D0D0F", ink: "#EFEFEE" },
  collar:  { ground: "#E4E4E2", ink: "#0D0D0F" },
  pad:     { ground: "#0D0D0F", ink: "#EFEFEE" },
  granite: { ground: "#E4E4E2", ink: "#0D0D0F" },
};

const NOTE: Record<string, string> = {
  shell: "the cast body of every link",
  joint: "the barrel each axis turns in",
  collar: "the ring seated at each joint",
  pad: "the gripping face of both fingers",
  granite: "the pad the base is bolted to",
};

export function FieldSwap() {
  const mats = spec.materials;
  const [active, setActive] = useState(mats[0].key);
  const mat = mats.find((x) => x.key === active) ?? mats[0];
  const field = FIELDS[mat.key] ?? FIELDS.shell;

  const divider = "1px solid color-mix(in srgb, currentColor 24%, transparent)";

  return (
    <section
      className="sec"
      style={{
        background: field.ground,
        color: field.ink,
        transition: "background-color 0.7s var(--ease), color 0.7s var(--ease)",
      }}
    >
      <div className="wrap">
        <span className="meta meta-sm" style={{ opacity: 0.62 }}>
          Materials · exported by cad/arm.py
        </span>

        <h2 className="d rv" style={{ fontSize: "clamp(30px,4.4vw,62px)", marginTop: 18, maxWidth: "16ch" }}>
          Five materials, and the kernel writes all of them.
        </h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 34 }}>
          {mats.map((x) => {
            const on = x.key === active;
            return (
              <button
                key={x.key}
                type="button"
                onClick={() => setActive(x.key)}
                aria-pressed={on}
                className="meta meta-500"
                style={{
                  borderRadius: 999,
                  padding: "11px 22px",
                  cursor: "pointer",
                  // Tinted from currentColor so it survives the field swap.
                  border: on
                    ? "1px solid currentColor"
                    : "1px solid color-mix(in srgb, currentColor 26%, transparent)",
                  background: on ? "currentColor" : "transparent",
                  color: "inherit",
                  transition: "border-color .5s var(--ease), background-color .5s var(--ease)",
                }}
              >
                <span style={{ color: on ? field.ground : "inherit", mixBlendMode: "normal" }}>
                  {x.key}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 40,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            borderTop: divider,
          }}
        >
          {[
            { k: "Metallic", v: mat.metallic.toFixed(2) },
            { k: "Roughness", v: mat.roughness.toFixed(2) },
            { k: "Base colour", v: mat.color },
          ].map((cell, i) => (
            <div
              key={cell.k}
              style={{
                padding: "22px 24px 22px 0",
                borderLeft: i === 0 ? "none" : divider,
                paddingLeft: i === 0 ? 0 : 24,
              }}
            >
              <span className="meta meta-sm" style={{ opacity: 0.62 }}>{cell.k}</span>
              <div className="d num" style={{ fontSize: "clamp(26px,3.4vw,44px)", marginTop: 10 }}>
                {cell.v}
              </div>
            </div>
          ))}
        </div>

        <p className="meta meta-sm" style={{ marginTop: 22, opacity: 0.62 }}>
          {mat.key} — {NOTE[mat.key] ?? ""}
        </p>
      </div>
    </section>
  );
}
