import Link from "next/link";
import Image from "next/image";
import "./landing.css";
import { LandingMotion } from "@/components/landing/motion";
import { CounterTravelStage } from "@/components/landing/stage";
import { FieldSwap } from "@/components/landing/field";
import { LiveReadings } from "@/components/landing/readings";
import { armSpec as spec, elevation, traces } from "@/lib/landing-figures";
import { TOLERANCE_MM, W_PLACEMENT, W_SMOOTHNESS, W_EFFICIENCY } from "@/lib/score";

const BRAND = "THENAR";
/**
 * The one letter the subject passes in front of.
 *
 * It has to be a letter the arm actually has pixels over at the word's height,
 * not merely one inside the image's bounding box. "A" satisfied the box test
 * and still showed nothing: at the height of the word the picture there is
 * empty space under the forearm, so the front layer drew over transparent PNG
 * and the weave's front half was invisible. The pedestal is the part that sits
 * down in the word band, and it crosses "N".
 */
const FRONT_LETTER = 3; // "N" — the pedestal crosses it

const NAV = [
  { href: "/hub", label: "Hub" },
  { href: "/space", label: "Floor" },
  { href: "/spec", label: "Spec" },
  { href: "/leaderboard", label: "Paid" },
  { href: "/foundry", label: "Foundry" },
];

/**
 * The word, rendered as one of two exactly-overlaid layers.
 *
 * Both layers contain every letter; each hides the ones it does not own, which
 * keeps the flex metrics identical so the layers register to the pixel. The
 * subject sits between them at z-index 2.
 *
 * This cannot be done with per-letter z-index inside a single element. The word
 * needs a transform for the baseline crop and another for the parallax; each
 * one creates a stacking context, z-index:auto does not save you, and the
 * letters are then trapped at the word's own level — every overlapping letter
 * falls behind the subject and the weave silently does not exist.
 */
function WordLayer({ owns, className }: { owns: (i: number) => boolean; className: string }) {
  return (
    <div
      className={`word ${className} rv`}
      data-hero-word
      data-rv-now
      aria-hidden
      style={{ transform: "translateY(0.10em) translateY(var(--par, 0px))" }}
    >
      {BRAND.split("").map((ch, i) => (
        <span key={i} {...(owns(i) ? {} : { "data-off": "" })}>{ch}</span>
      ))}
    </div>
  );
}

export default function Home() {
  const el = elevation();
  const tr = traces();
  const closed = spec.part_report.filter((p) => p.closed).length;

  return (
    <div className="lp">
      <LandingMotion />

      <header className="lp-nav">
        <div className="wrap" style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link href="/" className="brand">
            Thenar<span className="accent">.</span>
          </Link>
          <nav style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 26 }}>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="navlink">{n.label}</Link>
            ))}
            <Link href="/hub" className="pill pill-solid" style={{ padding: "10px 20px" }}>
              Start a run
            </Link>
          </nav>
        </div>
      </header>

      {/* ---- hero ---------------------------------------------------------- */}
      <section
        data-hero
        className="on-stage"
        style={{
          position: "relative",
          minHeight: "calc(100svh - 64px)",
          marginTop: 64,
          overflow: "clip",
          isolation: "isolate",
          display: "flex",
          alignItems: "flex-start",
        }}
      >
        {/* Every anchored element stays in the left column: the subject is
            deliberately oversized and crosses the whole right half, so anything
            pinned top-right would collide with it. */}
        <div className="wrap" style={{ position: "relative", zIndex: 4, paddingTop: "clamp(28px,5vh,84px)", paddingBottom: "clamp(150px,26vh,300px)" }}>
          <span className="meta meta-sm muted">
            THENAR-6 · {spec.axes} revolute axes · Avalanche Fuji · chain 43113
          </span>

          <h1
            className="d rv"
            data-rv-now
            style={{ fontSize: "clamp(34px,5.1vw,74px)", marginTop: 18, maxWidth: "14ch" }}
          >
            Physical AI is short of data,{" "}
            <span className="accent">not compute.</span>
          </h1>

          <p className="rv rv-d1" style={{ maxWidth: "38ch", marginTop: 20, fontSize: 16, lineHeight: 1.6, color: "var(--ink-2)" }}>
            Drive a six-axis arm in a browser. Every run is measured against the
            datum and paid on chain in the transaction that records it.
          </p>

          <div className="rv rv-d2" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
            <Link href="/hub" className="pill pill-solid">Find a task</Link>
            <Link href="/space" className="pill pill-line">Walk onto the floor</Link>
          </div>

          <dl className="rule rv rv-d3" style={{ marginTop: 40, paddingTop: 16, display: "flex", flexWrap: "wrap", gap: "10px 40px" }}>
            {[
              ["Reach", `${spec.reach_mm} mm`],
              ["Gripper", `${spec.gripper.type}, ${spec.gripper.stroke_mm} mm`],
              ["Placement band", `±${TOLERANCE_MM} mm`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10 }}>
                <dt className="meta meta-sm muted">{k}</dt>
                <dd className="meta meta-sm num">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* The weave: back layer, subject, front layer. */}
        <div className="weave" style={{ height: "min(46vh, 340px)" }}>
          <WordLayer className="word-back" owns={(i) => i !== FRONT_LETTER} />
          <Image
            src="/hero-arm.png"
            alt="THENAR-6, a six-axis arm with a parallel-jaw gripper, reaching"
            width={1228}
            height={566}
            priority
            className="subject rv"
            data-hero-subject
            data-rv-now
            style={{ transform: "translateY(var(--par, 0px))" }}
          />
          <WordLayer className="word-front" owns={(i) => i === FRONT_LETTER} />
        </div>
      </section>

      <LiveReadings />

      {/* ---- inverted proof ------------------------------------------------ */}
      <section className="on-ink sec">
        <div className="wrap" style={{ display: "grid", gap: "clamp(36px,5vw,72px)", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
          <div>
            <span className="meta meta-sm muted">Smoothness · mean jerk of the tool path</span>
            <h2 className="d rv" style={{ fontSize: "clamp(30px,4.4vw,62px)", marginTop: 18, maxWidth: "15ch" }}>
              A steady hand scores. A hunting one does not.
            </h2>
            <p className="rv rv-d1" style={{ maxWidth: "42ch", marginTop: 20, fontSize: 16, lineHeight: 1.62 }}>
              Smoothness is {Math.round(W_SMOOTHNESS * 100)}% of the score. It is
              measured, not judged: the mean jerk of your tool path, computed from
              the same trajectory the payout is derived from.
            </p>

            <div className="rv rv-d2" style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 34 }}>
              <span className="d num" style={{ fontSize: "clamp(56px,9vw,132px)", lineHeight: 0.86, letterSpacing: "-0.05em" }}>
                {tr.floor}
              </span>
              <span className="meta meta-sm muted">mm/s³ or under — full marks</span>
            </div>

          </div>

          <figure className="rv rv-d1" style={{ margin: 0 }}>
            <svg viewBox={`0 0 ${tr.view.w} ${tr.view.h}`} style={{ width: "100%", height: "auto" }} role="img"
              aria-label={`Two tool paths at one scale: a reference at ${tr.ceil} millimetres per second cubed wandering, and one held at ${tr.floor}`}>
              <line x1={0} y1={tr.view.h / 2} x2={tr.view.w} y2={tr.view.h / 2} stroke="var(--hair-on-ink)" strokeWidth={1} />
              <path d={tr.reference} fill="none" stroke="rgba(239,239,238,0.34)" strokeWidth={1.25} />
              <path d={tr.held} fill="none" stroke="var(--accent-lift)" strokeWidth={2} />
            </svg>
            <figcaption className="meta meta-sm muted" style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <span>Reference · {tr.ceil} mm/s³</span>
              <span className="accent">Held · {tr.floor} mm/s³</span>
            </figcaption>
            {/* The legend sits with the traces rather than under the headline:
                it is describing this figure, and in the left column it left the
                right one ending 330px short of the section. */}
            <p className="meta meta-sm muted rule" style={{ marginTop: 26, paddingTop: 14, maxWidth: "52ch", textTransform: "none", letterSpacing: "0.02em", lineHeight: 1.7 }}>
              At {tr.ceil} mm/s³ and above it scores nothing. Both traces are
              drawn to one scale, and the wandering one has exactly{" "}
              {tr.ratio.toFixed(2)}× the amplitude of the held one — the ratio of
              those two numbers, not an impression of it.
            </p>
          </figure>
        </div>
      </section>

      {/* ---- technical diagram --------------------------------------------- */}
      <section className="on-ground sec">
        <div className="wrap" style={{ display: "grid", gap: "clamp(36px,5vw,72px)", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
          <div>
            <span className="meta meta-sm muted">Link stack · every value a kernel constant</span>
            <h2 className="d rv" style={{ fontSize: "clamp(30px,4.4vw,62px)", marginTop: 18, maxWidth: "14ch" }}>
              There is no CAD file. There are {spec.parts} parts and a script.
            </h2>
            <p className="rv rv-d1" style={{ maxWidth: "44ch", marginTop: 20, fontSize: 16, lineHeight: 1.62, color: "var(--ink-2)" }}>
              The geometry is generated by a Python kernel with numpy alone and no
              CSG booleans. Every part is validated as a closed surface before it
              is exported — {closed} of {spec.parts} at the last run.
            </p>

            <dl className="rv rv-d2" style={{ marginTop: 32 }}>
              {el.links.map((l) => (
                <div key={l.symbol} className="rule" style={{ display: "grid", gridTemplateColumns: "8.5rem 1fr auto", gap: 14, alignItems: "baseline", padding: "11px 0" }}>
                  <dt className="meta meta-sm accent">{l.symbol}</dt>
                  <dd style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>{l.note}</dd>
                  <dd className="meta meta-sm num" style={{ margin: 0 }}>{l.mm} mm</dd>
                </div>
              ))}
              <div className="rule" style={{ display: "grid", gridTemplateColumns: "8.5rem 1fr auto", gap: 14, padding: "11px 0" }}>
                <dt className="meta meta-sm">Stack</dt>
                <dd style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>plinth face to tool flange</dd>
                <dd className="meta meta-sm num" style={{ margin: 0 }}>{el.total} mm</dd>
              </div>
            </dl>
          </div>

          <figure className="rv rv-d1" style={{ margin: 0 }}>
            <svg viewBox={`0 0 ${el.width} ${el.height}`} style={{ width: "100%", height: "auto" }} role="img"
              aria-label={`Side elevation of the link stack, drawn to scale, totalling ${el.total} millimetres`}>
              {/* Construction geometry: hairlines, lighter than the drawing. */}
              {/* Extension lines, drawn the way a dimension is set: out from the
                  part to where the value is written, and stopping there. They
                  used to run on to the frame edge past every label, which read
                  as ruled paper rather than as draughting. */}
              {el.links.map((l) => (
                <line key={`g${l.symbol}`} x1={el.x - 30} y1={l.y0} x2={el.x + 46} y2={l.y0} stroke="var(--hair)" strokeWidth={1} />
              ))}
              <line x1={el.x - 30} y1={el.links[el.links.length - 1].y1} x2={el.x + 46} y2={el.links[el.links.length - 1].y1} stroke="var(--hair)" strokeWidth={1} />

              {/* The drawing's own line, heavier so it does not read as one more
                  leader, and drawn in when the figure enters the viewport. */}
              <path
                className="draw"
                pathLength={1}
                d={`M${el.x} ${el.links[0].y0} L${el.x} ${el.links[el.links.length - 1].y1}`}
                stroke="var(--ink)" strokeWidth={2.5} fill="none"
              />
              {el.links.map((l) => (
                <g key={l.symbol}>
                  <rect x={el.x - 15} y={l.y1} width={30} height={l.h} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
                  <circle cx={el.x} cy={l.y1} r={2.6} fill="var(--accent)" />
                  <line x1={el.x + 19} y1={l.mid} x2={el.x + 52} y2={l.mid} stroke="var(--hair)" strokeWidth={1} />
                  <text x={el.x + 58} y={l.mid + 3.5} className="meta meta-sm" style={{ fontSize: 9.5, letterSpacing: "0.14em", fill: "var(--muted)" }}>
                    {l.symbol} {l.mm}
                  </text>
                </g>
              ))}
            </svg>
            <figcaption className="meta meta-sm muted" style={{ marginTop: 12 }}>
              {/* Called what it is. The bands are to scale in height, which is
                  the claim; their width is not a measurement. */}
              Link stack · to scale · 1 px = {(1 / el.scale).toFixed(2)} mm
            </figcaption>
          </figure>
        </div>
      </section>

      <CounterTravelStage />

      <FieldSwap />

      {/* ---- spec table ---------------------------------------------------- */}
      <section className="on-ground sec">
        <div className="wrap">
          <span className="meta meta-sm muted">Specification · lib/arm-spec.json</span>
          <h2 className="d rv" style={{ fontSize: "clamp(30px,4.4vw,62px)", marginTop: 18, maxWidth: "16ch" }}>
            Every figure here is the constant the geometry was built from.
          </h2>

          <div style={{ marginTop: 38, display: "grid", gap: "0 clamp(28px,5vw,72px)", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {[
              [["Model", spec.name], ["Axes", String(spec.axes)], ["Reach", `${spec.reach_mm} mm`],
               ["Height", `${spec.height_mm} mm`], ["Parts", String(spec.parts)], ["Closed surfaces", `${closed} / ${spec.parts}`]],
              [["Triangles", spec.triangles.toLocaleString("en-GB")], ["Export", `${(spec.glb_bytes / 1024).toFixed(0)} KB glb`],
               ["Gripper", spec.gripper.type], ["Jaw stroke", `${spec.gripper.stroke_mm} mm`],
               ["Finger", `${spec.gripper.finger_length_mm} mm`], ["Pad", `${spec.gripper.pad_thickness_mm} mm`]],
            ].map((col, ci) => (
              <dl key={ci} style={{ margin: 0 }}>
                {col.map(([k, v]) => (
                  <div key={k} className="rule" style={{ display: "flex", justifyContent: "space-between", gap: 18, padding: "13px 0" }}>
                    <dt style={{ fontSize: 14, color: "var(--ink-2)" }}>{k}</dt>
                    <dd className="meta meta-sm num" style={{ margin: 0 }}>{v}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
        </div>
      </section>

      {/* ---- close --------------------------------------------------------- */}
      <section className="on-stage" style={{ paddingTop: "clamp(72px,11vh,132px)", position: "relative", overflow: "clip" }}>
        <div className="wrap">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 30, alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <h2 className="d rv" style={{ fontSize: "clamp(30px,4.4vw,62px)", maxWidth: "13ch" }}>
                There is work open right now.
              </h2>
              <p className="meta meta-sm muted" style={{ marginTop: 18, textTransform: "none", letterSpacing: "0.02em" }}>
                Placement {Math.round(W_PLACEMENT * 100)}% · smoothness{" "}
                {Math.round(W_SMOOTHNESS * 100)}% · time against par{" "}
                {Math.round(W_EFFICIENCY * 100)}%. No hardware, no GPU.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Link href="/hub" className="pill pill-solid">Open the hub</Link>
              <Link href="/leaderboard" className="pill pill-line">See who has been paid</Link>
            </div>
          </div>

          <div className="rule" style={{ marginTop: 46, paddingTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 34px" }}>
            <span className="meta meta-sm muted">Avalanche Fuji · chain 43113</span>
            <Link href="/spec" className="meta meta-sm muted">THENAR-6 spec sheet</Link>
            <a href="/api/contract" className="meta meta-sm muted">Contract ABI</a>
            <span className="meta meta-sm muted" style={{ marginLeft: "auto" }}>Built at Monad Blitz Hyderabad</span>
          </div>
        </div>

        {/* Bookends the hero: the same word, cropped by the page's bottom edge. */}
        <div
          aria-hidden
          className="d d-tight"
          style={{
            marginTop: "clamp(28px,5vh,64px)",
            fontSize: "clamp(88px,20.5vw,304px)",
            transform: "translateY(0.19em)",
            textAlign: "center",
            userSelect: "none",
          }}
        >
          {BRAND}
        </div>
      </section>
    </div>
  );
}
