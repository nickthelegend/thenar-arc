"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { A4_GAP_MM, apply, checkQuad, checkScan, footprint, groundCentre, homography, invert, sheetCorners, type Pt, type ScannedScene } from "@/lib/scan";
import { detect, loadDetector, sampleColour, propFor } from "@/lib/detect";

/**
 * Scan the real table into a task.
 *
 * Point a camera at the bench, freeze a frame (or upload a photo), click the
 * four corners of a sheet of A4 lying in front of the arm, and every object on
 * the table has a position in millimetres in the arm's own frame. The detector
 * names what it recognises; anything it misses is one click to add. Choosing
 * the object to move and the one to put it on hands the page a scene it writes
 * into the task's name on chain.
 */
export type ScannedObject = {
  id: number; label: string; score: number | null; px: Pt; mm: Pt | null; colour: string; prop: string | null;
  /** The detector's box, for a detected object: its footprint centre is measured from it (lib/scan.ts groundCentre). */
  box?: { x: number; y: number; w: number; h: number };
};
export type ScanResult = { scene: ScannedScene; pick: ScannedObject; place: ScannedObject };

const CORNERS = sheetCorners();

export function ScanPanel({ onScene }: { onScene: (r: ScanResult | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const nextId = useRef(1);

  const [frozen, setFrozen] = useState(false);
  const [live, setLive] = useState(false);
  const [corners, setCorners] = useState<Pt[]>([]);
  const [objects, setObjects] = useState<ScannedObject[]>([]);
  const [H, setH] = useState<number[] | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [place, setPlace] = useState<number | null>(null);
  const [addLabel, setAddLabel] = useState("block");
  const [status, setStatus] = useState<{ text: string; tone: "plain" | "good" | "bad" }>({ text: "Start the camera, or upload a photo of the table.", tone: "plain" });
  const say = (text: string, tone: "plain" | "good" | "bad" = "plain") => setStatus({ text, tone });

  // Warm the model while the funder sets up the sheet.
  useEffect(() => { loadDetector().catch(() => {}); }, []);
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  // A detected object is measured from its box; one added by a click is where
  // the click was, because that is the point the person chose.
  const measure = useCallback((list: ScannedObject[], h: number[] | null) =>
    list.map((o) => {
      if (!h) return { ...o, mm: null, px: o.box ? footprint(o.box) : o.px };
      if (!o.box) return { ...o, mm: apply(h, o.px) };
      // The marker moves to the centre it measured, so the picture and the numbers agree.
      const mm = groundCentre(h, o.box, { w: frame.current?.width ?? 0, h: frame.current?.height ?? 0 });
      return { ...o, mm, px: apply(invert(h), mm) };
    }), []);

  // ---- camera and photo ----------------------------------------------------------

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return say(window.isSecureContext ? "This browser gives pages no camera. Upload a photo instead." : "The camera needs HTTPS or localhost.", "bad");
    }
    say("Waiting for camera permission: allow it in the browser's prompt.");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      const n = (e as Error).name;
      return say(n === "NotAllowedError" ? "Camera permission was refused. Allow it in the address bar, or upload a photo." : n === "NotFoundError" ? "No camera was found. Upload a photo instead." : `The camera failed: ${(e as Error).message}`, "bad");
    }
    const v = video.current!;
    v.srcObject = stream.current;
    await v.play();
    setLive(true);
    setFrozen(false);
    say("Camera on. Lay a sheet of A4 in front of the arm, then freeze the frame.");
    const loop = () => {
      if (!stream.current || !frame.current) return;
      if (v.videoWidth) draw(v, v.videoWidth, v.videoHeight);
      requestAnimationFrame(loop);
    };
    loop();
  };

  const draw = (src: CanvasImageSource, w: number, h: number) => {
    const c = frame.current!, o = overlay.current!;
    if (c.width !== w || c.height !== h) {
      c.width = o.width = w;
      c.height = o.height = h;
    }
    c.getContext("2d", { willReadFrequently: true })!.drawImage(src, 0, 0);
  };

  const scan = async () => {
    setCorners([]);
    setH(null);
    setPick(null);
    setPlace(null);
    onScene(null);
    setFrozen(true);
    say("Looking for objects…");
    try {
      const found = await detect(frame.current!);
      const list = found.map((d) => ({ id: nextId.current++, label: d.label, score: d.score, px: footprint(d.box), box: d.box, mm: null, colour: sampleColour(frame.current!, d.box), prop: propFor(d.label) }));
      setObjects(list);
      say(`${list.length ? `Found ${list.map((o) => o.label).join(", ")}. ` : "Nothing recognised; you can add objects by clicking. "}Now click the sheet's near-left corner, the one nearest the arm.`);
    } catch (e) {
      setObjects([]);
      say(`The detector did not load: ${(e as Error).message}`, "bad");
    }
  };

  const freeze = async () => {
    const v = video.current!;
    if (!v.videoWidth) return say("The camera has not delivered a frame yet.", "bad");
    draw(v, v.videoWidth, v.videoHeight);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLive(false);
    await scan();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return say("That file is not an image.", "bad");
    const img = new Image();
    img.src = URL.createObjectURL(file);
    try {
      await img.decode();
    } catch {
      return say("That image could not be read.", "bad");
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLive(false);
    draw(img, img.naturalWidth, img.naturalHeight);
    URL.revokeObjectURL(img.src);
    await scan();
  };

  // ---- clicks -----------------------------------------------------------------------

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!frozen) return say("Freeze a frame or upload a photo first.", "bad");
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
    if (!H) {
      const next = [...corners, p];
      if (next.length < 4) {
        setCorners(next);
        return say(`Now the ${CORNERS[next.length].name} corner.`);
      }
      const bad = checkQuad(next);
      if (bad) {
        setCorners([]);
        return say(`${bad} Start again at the near-left corner.`, "bad");
      }
      const h = homography(next, CORNERS);
      setCorners(next);
      setH(h);
      setObjects((list) => measure(list, h));
      return say("Sheet found. Choose the object to move and the one to put it on.", "good");
    }
    const label = addLabel.trim().slice(0, 32) || "object";
    const o: ScannedObject = { id: nextId.current++, label, score: null, px: p, mm: apply(H, p), colour: sampleColour(frame.current!, { x: p.x - 12, y: p.y - 24, w: 24, h: 24 }), prop: propFor(label) };
    setObjects((list) => [...list, o]);
  };

  // ---- the scene ----------------------------------------------------------------------

  /** Hand the page the scene the current choice makes, or null when there is none. */
  const emit = (p: number | null, q: number | null, list: ScannedObject[]) => {
    const a = list.find((o) => o.id === p), b = list.find((o) => o.id === q);
    if (!a?.mm || !b?.mm) return onScene(null);
    const scene: ScannedScene = { pick: [a.mm.x / 1000, a.mm.y / 1000], place: [b.mm.x / 1000, b.mm.y / 1000] };
    const why = checkScan(scene);
    if (why) {
      say(why, "bad");
      return onScene(null);
    }
    say(`Move the ${a.label} (${Math.round(a.mm.x)}, ${Math.round(a.mm.y)} mm) onto the ${b.label} (${Math.round(b.mm.x)}, ${Math.round(b.mm.y)} mm).`, "good");
    onScene({ scene, pick: a, place: b });
  };

  const choose = (role: "pick" | "place", id: number) => {
    const p = role === "pick" ? id : pick === id ? null : pick;
    const q = role === "place" ? id : place === id ? null : place;
    setPick(p);
    setPlace(q);
    emit(p, q, objects);
  };

  const remove = (id: number) => {
    const list = objects.filter((x) => x.id !== id);
    const p = pick === id ? null : pick, q = place === id ? null : place;
    setObjects(list);
    setPick(p);
    setPlace(q);
    emit(p, q, list);
  };

  // Overlay: the sheet, the arm's base, and each object with its position.
  useEffect(() => {
    const o = overlay.current;
    if (!o) return;
    const g = o.getContext("2d")!;
    g.clearRect(0, 0, o.width, o.height);
    const lw = Math.max(2, o.width / 400);
    g.lineWidth = lw;
    g.font = `${Math.max(14, o.width / 60)}px "DM Mono", ui-monospace, monospace`;
    if (corners.length) {
      g.strokeStyle = "#E8B04A";
      g.fillStyle = "rgba(232,176,74,0.14)";
      g.beginPath();
      corners.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      if (corners.length === 4) {
        g.closePath();
        g.fill();
      }
      g.stroke();
      corners.forEach((p, i) => {
        g.fillStyle = "#E8B04A";
        g.fillRect(p.x - lw * 3, p.y - lw * 3, lw * 6, lw * 6);
        g.fillText(String(i + 1), p.x + lw * 4, p.y - lw * 4);
      });
    }
    if (H) {
      const base = apply(homography(CORNERS, corners), { x: 0, y: 0 });
      g.fillStyle = "#7FA6F0";
      const inside = base.x >= 0 && base.y >= 0 && base.x <= o.width && base.y <= o.height;
      if (inside) g.fillText("+ arm base", base.x, base.y);
      else g.fillText(`arm base ${base.y > o.height ? "below" : "above"} the picture`, Math.min(o.width - 260, Math.max(lw * 4, base.x)), Math.min(o.height - lw * 4, Math.max(lw * 14, base.y)));
    }
    for (const x of objects) {
      const role = x.id === pick ? "MOVE" : x.id === place ? "ONTO" : "";
      g.strokeStyle = g.fillStyle = role === "MOVE" ? "#E0685C" : role ? "#5FC38A" : "#F2EEE6";
      g.fillRect(x.px.x - lw * 3, x.px.y - lw * 3, lw * 6, lw * 6);
      g.fillText(`${role ? role + " " : ""}${x.label}${x.mm ? ` ${Math.round(x.mm.x)},${Math.round(x.mm.y)}` : ""}`, x.px.x + lw * 5, x.px.y - lw * 4);
    }
  }, [corners, objects, H, pick, place]);

  const reach = (o: ScannedObject) => {
    if (!o.mm) return null;
    const r = Math.hypot(o.mm.x, o.mm.y);
    return r > 408 ? "out of reach" : r < 80 ? "too close to the base" : null;
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="list-decimal pl-5 text-[13px] leading-relaxed text-scribe-3">
        <li>Lay a sheet of A4 flat in front of the arm, long side pointing away, near edge centred {A4_GAP_MM / 10} cm ahead of the base.</li>
        <li>Point a camera at the bench and freeze a frame, or upload a photo. Then click the sheet&rsquo;s corners: near left, near right, far right, far left.</li>
        <li>Choose the object to move and the one to put it on.</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={live ? freeze : start} className={btn}>{live ? "Freeze frame" : "Start camera"}</button>
        <label className={cn(btn, "cursor-pointer")}>
          Upload photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {H ? <button type="button" onClick={() => { setCorners([]); setH(null); setObjects((l) => measure(l, null)); setPick(null); setPlace(null); onScene(null); say("Click the sheet's near-left corner."); }} className={btn}>Re-mark the sheet</button> : null}
      </div>
      <video ref={video} playsInline muted className="hidden" />
      <div className={cn("relative self-start border border-rule bg-ink-2", !frozen && !live && "hidden")}>
        <canvas ref={frame} className="block max-h-[60vh] max-w-full" />
        <canvas ref={overlay} onClick={click} aria-label="The table. Click the sheet's corners, then anything to add." className="absolute left-0 top-0 h-full w-full cursor-crosshair" />
      </div>
      <p role="status" className={cn("font-mono text-[12px]", status.tone === "bad" ? "text-reject" : status.tone === "good" ? "text-go" : "text-scribe-3")}>{status.text}</p>
      {H ? (
        <label className="flex flex-wrap items-center gap-2 font-mono text-[12px] text-scribe-3">
          Name for objects you click to add
          <input value={addLabel} onChange={(e) => setAddLabel(e.target.value)} maxLength={32} className="border border-rule bg-ink-2 px-2 py-1 text-scribe" />
        </label>
      ) : null}
      {objects.length ? (
        <ul className="flex flex-col divide-y divide-rule border border-rule">
          {objects.map((o) => {
            const far = reach(o);
            return (
              <li key={o.id} className={cn("flex items-center gap-3 px-3 py-2", far && "opacity-60")}>
                <span className="h-3 w-3 border border-rule" style={{ background: o.colour }} />
                <span className="flex-1 text-[13px]">
                  <span className="text-scribe">{o.label}</span>{" "}
                  <span className="font-mono text-[12px] text-scribe-3">
                    {o.score !== null ? `${Math.round(o.score * 100)}%` : "added"}
                    {o.mm ? ` · ${Math.round(o.mm.x)} mm ahead, ${Math.abs(Math.round(o.mm.y))} mm ${o.mm.y >= 0 ? "left" : "right"}` : " · mark the sheet to measure"}
                    {far ? ` · ${far}` : ""}
                  </span>
                </span>
                <button type="button" disabled={!o.mm || !!far} onClick={() => choose("pick", o.id)} aria-pressed={pick === o.id} className={cn(chip, pick === o.id && "border-reject text-reject")}>Move</button>
                <button type="button" disabled={!o.mm || !!far} onClick={() => choose("place", o.id)} aria-pressed={place === o.id} className={cn(chip, place === o.id && "border-go text-go")}>Onto</button>
                <button type="button" onClick={() => remove(o.id)} aria-label={`Remove ${o.label}`} className={chip}>Remove</button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

const btn = "border border-rule-strong px-3 py-1.5 text-[12px] text-scribe transition-colors hover:border-signal hover:text-signal";
const chip = "border border-rule px-2 py-1 text-[12px] text-scribe-3 transition-colors hover:border-rule-strong hover:text-scribe disabled:opacity-40";
