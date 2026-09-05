---
name: Axon
description: The data foundry for physical AI — teleoperate, measure, get paid on Monad.
colors:
  ink-0: "#070D15"
  ink-1: "#0C1520"
  ink-2: "#121E2C"
  ink-3: "#1A2938"
  ink-4: "#223447"
  rule: "#24374C"
  rule-strong: "#3A5270"
  scribe: "#E9F0F7"
  scribe-2: "#A6B8CB"
  scribe-3: "#7C91AB"
  brass: "#CB9A4E"
  brass-hi: "#E7BB72"
  brass-dim: "#2C2214"
  go: "#52A472"
  go-dim: "#10251A"
  reject: "#E06A5E"
  reject-dim: "#2E1512"
  datum: "#5A8FCC"
  datum-dim: "#12243A"
typography:
  display:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.6rem, 6.4vw, 4.6rem)"
    fontWeight: 700
    lineHeight: 0.94
    letterSpacing: "-0.02em"
  display-page:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.4rem, 6vw, 3.6rem)"
    fontWeight: 700
    lineHeight: 0.96
    letterSpacing: "-0.02em"
  display-run:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.2rem, 5vw, 3.2rem)"
    fontWeight: 700
    lineHeight: 0.96
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.015em"
  title-page:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  title-section:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  title-card:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  title-panel:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "normal"
  title-inline:
    fontFamily: "Saira Condensed, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  lede:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  body-compact:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  measure:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
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
    backgroundColor: "{colors.brass-hi}"
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
    textColor: "{colors.brass}"
    typography: "{typography.measure}"
---

# Axon design system

## Overview

**The inspection bench.** A surface plate under a bench lamp: layout dye as the
ground, a scribed line as the ink, brass for anything the operator is paid, and
a two-value verdict for anything measured.

The world is not decoration. Axon's product semantics *are* metrology — a
trajectory is a physical motion measured against a tolerance, a score is a
measurement and not a rating, slots are a production run count, pass rate is
process capability. Every recurring device in this interface is a real
instrument-shop device doing the job it does on a shop floor.

Three rules carry the identity and override convenience everywhere:

1. **Colour means data.** Brass is value, go/reject is a verdict, datum blue is
   the active reference. Controls take no colour at all — they get their state
   from rule weight, relief, and inversion. A coloured button would make colour
   mean two things.
2. **State the number.** Where a quantity exists, show the quantity. Adjectives
   are a failure to measure.
3. **Value carries trend.** A reading that can be compared to the field is shown
   with that comparison attached — your pass rate against the median, your time
   against par — never the bare figure.

Committed single theme. The operator's real scene is a long session driving a
bright 3D viewport, so the surface is dark by decision, not by category habit.
There is no light mode and adding one would break the lamp-on-a-dark-bench
premise the palette is built from.

## Colors

| Token | Value | Use |
| --- | --- | --- |
| `ink-0` | `#070D15` | Viewport ground, scrollbar track, overlay base |
| `ink-1` | `#0C1520` | Page ground |
| `ink-2` | `#121E2C` | Raised panel, table row hover |
| `ink-3` | `#1A2938` | Input and secondary control fill |
| `ink-4` | `#223447` | Unlit tally segments |
| `rule` | `#24374C` | Hairline division |
| `rule-strong` | `#3A5270` | Emphasised rule, dimension terminators, scrollbar thumb |
| `scribe` | `#E9F0F7` | Primary text, and the fill of an inverted (active) control |
| `scribe-2` | `#A6B8CB` | Secondary prose |
| `scribe-3` | `#7C91AB` | Labels, units, captions |
| `brass` | `#CB9A4E` | **Money and value only** — MON figures, filled slot tally, cap-table bars |
| `brass-hi` | `#E7BB72` | Primary control hover, focus ring |
| `go` | `#52A472` | In tolerance, positive delta |
| `reject` | `#E06A5E` | Out of tolerance, negative delta |
| `datum` | `#5A8FCC` | The reference edge: goal zones, transaction hashes, active selection |

Deliberately muted verdict pair. An acid green would read as a notification;
this is a measurement, and the two values have to sit at the same visual weight
so neither pre-empts the reading.

All text tokens clear 4.5:1 on their own grounds; `scribe-3` at 11px is the
floor case and was raised from a darker value specifically to clear it.

## Typography

Three families, each with one job:

- **Saira Condensed** — display and headings. Industrial condensed signage; the
  compression is what keeps a four-word headline at poster scale without
  crowding the instrument panel beside it.
- **Archivo** — body and UI prose. A grotesque with enough width contrast
  against Saira that the pairing reads as two voices, not two weights.
- **IBM Plex Mono** — every measured value, label, address, hash and timecode.
  Mono here is for measurement and data, which is its legitimate use; it never
  sets prose.

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

Icons are a drawn set on a 20×20 frame, 1.5 stroke, **butt caps and mitre
joins** — the vocabulary of a drawing pen, not a rounded UI kit.

## Components

**Controls are achromatic.** Primary is inversion (scribe fill, ink text),
secondary is a filled panel with a strong rule, ghost is a rule that appears on
hover. Primary hover moves to brass — the single place a control borrows the
value colour, because the primary action in this product is nearly always
getting paid.

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

## Do's and Don'ts

**Do**

- Show the quantity, its unit, and its comparison to the field.
- Reserve brass for money and value. If it is not a payment, an earning, or
  capacity being consumed, it is not brass.
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
- No acid green. It is the incumbent category's colour and it reads as an alert,
  not a measurement.
- No Inter, Space Grotesk, or Geist as a display face.
- No emoji or unicode glyph standing in for an icon.
- No mono for prose. Mono is for measurement, data, and code.
