---
name: Thenar
description: The data foundry for physical AI — teleoperate, measure, get paid on Avalanche.
colors:
  ink-0: "#000000"
  ink-1: "#080808"
  ink-2: "#121212"
  ink-3: "#1C1C1C"
  ink-4: "#272727"
  rule: "#262626"
  rule-strong: "#3D3D3D"
  scribe: "#FFFFFF"
  scribe-2: "#E0E0E0"
  scribe-3: "#8F8F8F"
  signal: "#FF6A00"
  signal-hi: "#FF9A3D"
  signal-dim: "#2B1200"
  go: "#3DD68C"
  go-dim: "#062315"
  reject: "#FF2D55"
  reject-dim: "#2B0611"
  probe: "#6E86A6"
  probe-dim: "#0E1520"
typography:
  display:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 6.4vw, 4.6rem)"
    fontWeight: 700
    lineHeight: 0.94
    letterSpacing: "-0.02em"
  display-page:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 6vw, 3.6rem)"
    fontWeight: 700
    lineHeight: 0.96
    letterSpacing: "-0.02em"
  display-run:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.2rem, 5vw, 3.2rem)"
    fontWeight: 700
    lineHeight: 0.96
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  title-page:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  title-section:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  title-card:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  title-panel:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "normal"
  title-inline:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  lede:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body-compact:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  measure:
    fontFamily: "DM Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "DM Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.14em"
rounded:
  edge: "0px"
  cut: "2px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "56px"
components:
  button-primary:
    backgroundColor: "{colors.scribe}"
    textColor: "{colors.ink-0}"
    typography: "{typography.label}"
    rounded: "{rounded.edge}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.signal-hi}"
    textColor: "{colors.ink-0}"
  button-secondary:
    backgroundColor: "{colors.ink-3}"
    textColor: "{colors.scribe}"
    typography: "{typography.label}"
    rounded: "{rounded.edge}"
    padding: "8px 16px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.scribe-3}"
    typography: "{typography.label}"
    rounded: "{rounded.edge}"
    padding: "4px 10px"
  chip-active:
    backgroundColor: "{colors.scribe}"
    textColor: "{colors.ink-0}"
  panel:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.scribe}"
    rounded: "{rounded.edge}"
    padding: "16px 20px"
  value-figure:
    textColor: "{colors.signal}"
    typography: "{typography.measure}"
---

# Thenar design system

## Overview

**Orange on black.** Pure black ground, white ink, and one saturated orange
that carries every figure of value and every live state. The neutral steps are
the same greys the category's incumbent uses, so the surface reads native to
it; the accent is ours.

The world is not decoration. Thenar's product semantics *are* metrology — a
trajectory is a physical motion measured against a tolerance, a score is a
measurement and not a rating, slots are a production run count, pass rate is
process capability. Every recurring device in this interface is a real
instrument-shop device doing the job it does on a shop floor.

Three rules carry the identity and override convenience everywhere:

1. **Colour means data.** Signal orange is value and live state, go/reject is a
   verdict, probe is the reference edge. Controls take no colour at all — they get their state
   from rule weight, relief, and inversion. A coloured button would make colour
   mean two things.
2. **State the number.** Where a quantity exists, show the quantity. Adjectives
   are a failure to measure.
3. **Value carries trend.** A reading that can be compared to the field is shown
   with that comparison attached — your pass rate against the median, your time
   against par — never the bare figure.

Committed single theme. The operator's real scene is a long session driving a
bright 3D viewport, so the surface is dark by decision, not by category habit.
There is no light mode; the palette is built on a pure black ground and a light
version would be a different product.

## Colors

| Token | Value | Use |
| --- | --- | --- |
| `ink-0` | `#000000` | Page ground, viewport ground, scrollbar track |
| `ink-1` | `#080808` | Lifted surface |
| `ink-2` | `#121212` | Panel, table row hover |
| `ink-3` | `#1C1C1C` | Input and secondary control fill |
| `ink-4` | `#272727` | Unlit tally segments |
| `rule` | `#262626` | Hairline division |
| `rule-strong` | `#3D3D3D` | Emphasised rule, dimension terminators |
| `scribe` | `#FFFFFF` | Primary text, and the fill of an inverted control |
| `scribe-2` | `#E0E0E0` | Secondary prose |
| `scribe-3` | `#8F8F8F` | Labels, units, captions |
| `signal` | `#FF6A00` | **The brand. Money, value, live state** — AVAX figures, slot tally, cap-table bars, joint collars on the arm |
| `signal-hi` | `#FF9A3D` | Primary control hover, focus ring |
| `go` | `#3DD68C` | In tolerance |
| `reject` | `#FF2D55` | Out of tolerance |
| `probe` | `#6E86A6` | The reference edge a measurement is taken from |

The verdict pair sits deliberately off the accent's hue. A reject in red-orange
would be a shade of the payout colour, so it is pushed to pink-red and the pass
to a cool mint — neither can be mistaken for money.

All text tokens clear 4.5:1 on their own grounds; `scribe-3` at 11px is the
floor case and was raised from a darker value specifically to clear it.

## Typography

Three families, each with one job:

The category's incumbent runs Borna, formularMono and Press Start 2P. The first
two are commercial, so the closest free equivalents carry the same feel:

- **Hanken Grotesk** — display, headings and body. A geometric grotesque with
  the neutral warmth the category reads as native.
- **DM Mono** — every measured value, label, address, hash and timecode. Mono
  here is for measurement and data, which is its legitimate use; it never sets
  prose.
- **Press Start 2P** — the pixel voice, and the one face shared with the
  incumbent because it is free. Used only on the wordmark, never on anything a
  visitor has to read at length.

Loaded through `next/font/google`, self-hosted at build. No CDN.

The ramp spans label to poster: `12px` label → `13px` measure → `14px` compact →
`15px` body → `16px` lede, then the titles at 18 / 20 / 24 / 30 / 36 px, and
three fluid display steps topping out at `clamp(2.6rem, 6.4vw, 4.6rem)`. **11px
is a hard floor for any functional text**; nothing in the product sits below
12px, because uppercase letterspaced labels cost legibility and they are the
smallest thing on the page.

`font-variant-numeric: tabular-nums` is global on tables, inputs, `time`, `code`
and `.tnum`. Figures in this product change in place and must not jitter.

## Layout

Content max width `1400px` for operate surfaces, `1100px` for reading-weight
surfaces, prose measure held at 56–65ch.

The station is the exception and the signature: its instrument frame *is* the
grid — a fixed three-pane console (`300px | 1fr | 308px`) where the viewport is
the work and both flanks are instrumentation. It is a console only where there
is room; below `lg` the whole thing becomes one ordinary scrolling page rather
than three nested scroll traps on a phone.

Divisions are structural. `.dim-rule` — a hairline with drawn terminators — is
used wherever a division is a real boundary between views, exactly as a drawing
separates them. A plain border is for incidental separation.

Dense rows are a table at `lg` and above and a stacked list below it; the page
body never scrolls sideways. Filter rows scroll horizontally on narrow screens
instead of stacking four deep.

## Elevation & Depth

**There are no shadows in this system.** Depth is a 1px rule plus a surface
value step, the way ink and relief read on a surface plate. A drop shadow would
be the one material this world does not contain.

Overlays darken with an opaque ground (`ink-0` at 78–88%), never a blur. Content
underneath an overlay is unmounted, not merely covered.

## Shapes

Hard corners: `0px` everywhere structural, `2px` maximum on an inset control. A
larger radius belongs to a different world and there is no case for one here.

Recurring drawn devices, all authored SVG or CSS, never an icon font or emoji:

- **Tolerance band** — the one repeating diagram. A measured value against a
  nominal and two limits, with the out-of-tolerance regions **hatched** rather
  than tinted, so a reject reads without depending on colour.
- **Slot tally** — remaining capacity as a stack of gauge blocks with a major
  division every fourth segment. Never a rounded progress bar.
- **Difficulty** — filled squares out of five. Shape carries the value, so it
  survives without colour and without a legend.
- **Stage track** — pre / training / post, where rank is **inversion**: the live
  stage alone prints dark on a pale ground.
- **Joint callouts** — live readouts pinned to the joints they measure with
  leader lines, annotating the arm the way a drawing dimensions a part.
- **Ghost trail** — the path the payload actually travelled, drawn in signal
  orange behind it. It is the exact line the smoothness term scores.
- **Reach envelope** — a dashed limit circle, drawn only when the operator has
  hit it, so the boundary appears at the moment it becomes information.

Icons are a drawn set on a 20×20 frame, 1.5 stroke, **butt caps and mitre
joins** — the vocabulary of a drawing pen, not a rounded UI kit.

## Components

**Controls are achromatic.** Primary is inversion (scribe fill, ink text),
secondary is a filled panel with a strong rule, ghost is a rule that appears on
hover. Primary hover moves to brass — the single place a control borrows the
value colour, because the primary action in this product is nearly always
getting paid.

**Copyable values.** Any hash or address a visitor might want to take away is
a `Copyable` — it says `copy`, and `copied` for a beat afterwards. Nothing in
this product is a value you have to retype.

**Status is spoken.** The submit flow drives an `Announce` live region, so a
screen reader hears verifying, confirm in your wallet, waiting for the block,
and the payout, in the product's own words.

**Browser surfaces are themed**, not left to the user agent: selection is brass
on ink, the caret is brass, focus rings are a 2px brass outline at 2px offset,
and scrollbars are a `rule-strong` thumb on an `ink-0` track.

**The measurement snap** is the product's one authored motion moment. When a run
settles, the interface does not celebrate — it takes a measurement: the verdict
stamps in tolerance or out, the band shows where the payload actually landed,
the three component scores print, and only then does the brass MON figure land
at poster scale. Everything else in the product is still.

Empty and rejected states explain the recovery in the product's own language and
never apologise: a missed run says the payload came to rest outside the datum
circle, that nothing was deducted, and to run it again.

## Scenes and the model library

Every object in the product is generated from named dimensions by `cad/kernel.py`
and written out as a glTF binary. There is no modelling package in the loop, no
asset to lose, and no thumbnail that can drift from the thing it depicts — a
preview is always the same file the station loads.

- **Rooms** (`cad/environments.py` → `public/environments/`). Seven, one per
  entry in `SCENARIOS`. A room is chosen by picking it in `/post`, which sets
  the `scenario` uint8 on the contract, so the room is recoverable from chain
  state alone. Work surface top at z = 0, origin at its centre.
- **Props** (`cad/props.py` → `public/props/`). 34: 22 payloads and 12
  landmarks, resolved from the words in a task's instruction.
- Convention for both: millimetres, Z-up, origin at the footprint centre, so the
  station can place one by its base. Scene coordinates are `(x, z, -y)`.

Sizes are real: a pen is 12 mm across and a kitchen counter is 980 mm. Previews
normalise to a common box so one camera can frame them all; the station does not,
because there the size is the point.

## Drawing many models at once

Model previews go through `ModelView`, and every `ModelView` on a page is drawn
by one shared renderer (`components/model-stage.tsx`). Never give a preview tile
its own `<Canvas>`: that is one WebGL context each, browsers stop handing them
out somewhere near sixteen, and past that line they drop the oldest — so tiles go
black in creation order. The inventory alone would have asked for 43.

The stage is a fixed, viewport-covering layer at `z-index: 5` with
`pointer-events: none` set **inline** — react-three-fiber writes its own inline
`pointer-events`, so a class does not win, and a layer that takes clicks makes
every tile beneath it unclickable.

## Motion

Two systems, deliberately scoped:

- **GSAP** owns the landing page's page-level reveals — rules drawing out from
  their centres, readings arriving last. Everything animates *from* an offset, so
  the resting state is the visible one and nothing is hidden if it never runs.
- **Motion** owns the hero sequence's sheet transitions only.

The hero is a real scroll, not a hijacked one: four viewports tall with a sticky
frame, so the scrollbar tells the truth and find-in-page still works. Which sheet
is showing comes from the **scroll event**, never from an animation frame — a
browser that has backgrounded the tab stops handing out frames, and a hero whose
state only advances on a frame is stuck on sheet one in every screenshot and
preview anything ever takes of it. The same rule applies to anything that must be
correct while unobserved: assets the scene needs are preloaded outside the
Canvas, because everything inside it renders on a frame that may never come.

Sheets stacked in one grid cell must be `inert` as well as transparent, or their
links stay clickable and stay in the tab order under the sheet on screen.

## Do's and Don'ts

**Do**

- Show the quantity, its unit, and its comparison to the field.
- Reserve signal orange for money, value and live state. If it is not a
  payment, an earning, or capacity being consumed, it is not orange.
- Give a new measurement a tolerance band rather than inventing a second way to
  show a value against a limit.
- Encode state in shape as well as hue — a pill, a fill, an inversion, a hatch.
- Keep functional text at 11px or above, always.
- Name roadmap as roadmap in the interface wherever a visitor could read it as a
  capability, and label synthetic data on the surface that renders it.

**Don't**

- No gradient as a surface fill, no glassmorphism, no backdrop blur as decoration.
- No drop shadows, no glowing borders, no pulsing status dots.
- No coloured controls — colour is data.
- No rounded cards as page structure, and never a card inside a card.
- No eyebrow or kicker above a heading; the heading carries itself.
- No section numbering unless the sequence genuinely carries information the
  reader needs (the run loop on the landing page is ordered; nothing else is).
- No acid green. It is the incumbent's colour, and here it would collide with
  the pass state.
- No Inter, Space Grotesk, or Geist as a display face.
- No Press Start 2P outside the wordmark; it is unreadable at length.
- No emoji or unicode glyph standing in for an icon.
- No mono for prose. Mono is for measurement, data, and code.
