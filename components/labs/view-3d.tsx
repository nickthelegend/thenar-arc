"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const ModelViewer = dynamic(() => import("@/components/labs/model-viewer").then((m) => m.ModelViewer), { ssr: false });
const ModelStage = dynamic(() => import("@/components/labs/model-viewer").then((m) => m.ModelStage), { ssr: false });

/** The model itself as a cover, for a product with no pictures yet. */
export function InlineModel({ url, zUp }: { url: string; zUp?: boolean }) {
  return <ModelStage url={url} zUp={zUp} className="aspect-[16/9] w-full" />;
}

/** A button that opens the product's model to turn and look at. */
export function View3D({ url, name, zUp }: { url: string; name: string; zUp?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/15 px-5 py-3 text-base text-white transition-colors duration-500 hover:bg-white/5 active:scale-[0.98]"
      >
        View in 3D
      </button>
      {open ? <ModelViewer url={url} name={name} zUp={zUp} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
