"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "@/lib/cn";

/**
 * One model, drawn only while it is near the viewport.
 *
 * Every tile used to be its own <Canvas>, which is its own WebGL context: the
 * inventory asked for 43 of them against a browser limit nearer 16, and past
 * that line the browser drops the oldest, so tiles go black in creation order.
 *
 * The fix was a single shared renderer with drei's View. It did not draw — the
 * tiles came back blank in a real browser — and a preview that renders nothing
 * is worse than one that costs a context. So: a canvas per tile again, but
 * mounted only while the tile is on screen, which bounds the live contexts to
 * what is actually visible rather than to the size of the library.
 *
 * `rootMargin` starts the load a screen early, so scrolling reveals a model
 * rather than an empty box that fills in late.
 *
 * That bound was still too loose to be one. Counted in a real browser on the
 * inventory: thirty canvases, sixteen alive and fourteen with their context
 * already taken away — because a screen of margin on a grid six tiles wide is
 * most of the library, and "visible" was never the limit that mattered. The
 * browser was still doing the evicting, still oldest-first, so the tiles that
 * went black were the ones at the top of the page the reader was looking at.
 *
 * So the limit is stated instead of hoped for. At most BUDGET tiles hold a
 * context, and when more want one the ones furthest from the middle of the
 * viewport give theirs up. The eviction is the same eviction; the difference
 * is that it now happens to whatever is furthest from being read, and a tile
 * that loses its slot unmounts and comes back rather than staying a dead
 * canvas that will never draw again.
 */

/**
 * How many previews may hold a WebGL context at once.
 *
 * Sixteen is the cap the browsers tested enforce, and the station or a hero
 * arm is a context too, so this leaves two spare rather than spending the lot
 * on thumbnails and blacking out the scene the page is actually about.
 *
 * It was ten first, which was too careful: it fixed the eviction and left the
 * last two tiles of a full screen blank, which is the same complaint in a
 * smaller size. Fourteen covers every viewport the grid produces here. A
 * screen wide enough to show more than fourteen tiles at once would start
 * dropping the furthest again — deliberately, at the edge, and to the tile
 * least likely to be read rather than to the one at the top of the page.
 */
const BUDGET = 14;

type Slot = { el: HTMLElement; grant: (on: boolean) => void; near: boolean; granted: boolean };
const slots = new Set<Slot>();

/** Distance from the middle of the viewport to the middle of the tile. The
 *  sort key, so "furthest from being read" is a measurement and not a guess. */
function distance(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  return Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2);
}

/**
 * Hand out the slots.
 *
 * Called whenever a tile enters or leaves; cheap enough at library size, and
 * it has to consider every tile at once because the decision is comparative —
 * one tile cannot know whether it deserves a context without the others.
 */
function reallocate() {
  const wanting = [...slots].filter((s) => s.near).sort((a, b) => distance(a.el) - distance(b.el));
  const keep = new Set(wanting.slice(0, BUDGET));
  for (const s of slots) {
    const want = keep.has(s);
    if (want !== s.granted) {
      s.granted = want;
      s.grant(want);
    }
  }
}
function ModelMesh({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const inner = scene.clone(true);

    // Z-up source, Y-up scene. Done before anything is measured, so the box
    // below is the box of the model as it will actually be seen rather than as
    // it was authored.
    inner.rotation.set(-Math.PI / 2, 0, 0);
    inner.updateMatrixWorld(true);

    // The library runs from a 12 mm pen to a 980 mm counter. A shared camera
    // can only frame all of that if every model is normalised to one box.
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());

    // Centre on the inner object, scale on a wrapper around it. Both on one
    // object cannot work and did not: three composes a transform as T·R·S, so
    // a position set here is applied after the rotation and without the scale,
    // and the model lands at −centre while its geometry sits at R·k·centre.
    // The difference is an offset, the tile spins about the origin, and an
    // object that is not on the origin orbits it — which is what these were
    // doing. A pen with its origin at the nib swung a body-length across the
    // tile every revolution and passed the camera close enough to fill it.
    inner.position.sub(centre);

    const outer = new THREE.Group();
    outer.add(inner);
    outer.scale.setScalar(1 / Math.max(size.x, size.y, size.z || 1));
    return outer;
  }, [scene]);

  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      if (ref.current) ref.current.rotation.y = ((t - start) / 1000) * 0.5;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <group ref={ref}>
      {/* No rotation here any more: the axis conversion is baked into the
          model above, before it was measured and centred. Setting it here as
          well would rotate the centred result about the tile's origin and put
          the orbit straight back. */}
      <primitive object={model} />
    </group>
  );
}

export function ModelView({ url, className }: { url: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // No IntersectionObserver (old browser, odd embedding) means draw it rather
    // than leave a blank tile — correctness first, context budget second. The
    // timeout keeps that out of the effect's synchronous pass.
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setNear(true), 0);
      return () => clearTimeout(t);
    }

    const slot: Slot = { el, grant: setNear, near: false, granted: false };
    slots.add(slot);

    const io = new IntersectionObserver(
      ([e]) => {
        slot.near = e.isIntersecting;
        reallocate();
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      slots.delete(slot);
      // Leaving would otherwise strand a slot: the tile is gone and its share
      // of the budget with it, so whatever is on screen now can have it.
      reallocate();
    };
  }, []);

  return (
    <div ref={box} className={cn("relative", className)}>
      {near ? (
        <Canvas
          camera={{ position: [1.5, 1.1, 1.6], fov: 34 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          style={{ position: "absolute", inset: 0 }}
        >
          <hemisphereLight args={["#9a9a9a", "#101010", 1.15]} />
          <directionalLight position={[2, 3, 2]} intensity={1.8} />
          <directionalLight position={[-2, 1, -1.5]} intensity={0.5} color="#FFB877" />
          <Suspense fallback={null}>
            <ModelMesh url={url} />
          </Suspense>
        </Canvas>
      ) : null}
    </div>
  );
}

/** Kept so providers.tsx does not need to know how previews are drawn. */
export function ModelStageProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
