import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { LabsNav } from "@/components/labs/labs-nav";
import { LabsFooter } from "@/components/labs/labs-footer";
import { Reveal } from "@/components/labs/reveal";
import { ProductList } from "@/components/labs/product-list";
import { PRODUCTS } from "@/lib/products";

export const metadata: Metadata = {
  title: "Products — ThenarLabs",
  description:
    "Everything ThenarLabs has built and is building: Thenar on Monad, Thenar Quest, the Thenar Arms SO-101 pair, the JX1 and JX0 humanoids and the Thenar Duck.",
};

/** Which models and posters are actually in public/, so the page never offers a 3D view it cannot load. */
const has = (p?: string) => Boolean(p && existsSync(path.join(process.cwd(), "public", p)));

export default function ProductsPage() {
  const products = PRODUCTS.map((p) => ({
    ...p,
    images: p.images.filter((i) => has(i.src)),
    poster: has(p.poster) ? p.poster : undefined,
  }));
  return (
    <div className="relative overflow-hidden bg-black text-white">
      <LabsNav />
      <section className="mx-auto max-w-[1200px] px-6 pb-12 pt-40">
        <Reveal fade>
          <p className="text-sm text-scribe-3">Products</p>
          <h1 className="heading-glow mt-4 max-w-[760px] text-5xl font-medium leading-none tracking-tight sm:text-7xl">
            Everything we build,
            <br />
            live and in progress
          </h1>
          <p className="mt-6 max-w-[600px] text-base text-scribe-2 sm:text-lg">
            Software you can use today on Monad, and robots whose CAD, print files and firmware are open on GitHub.
          </p>
        </Reveal>
      </section>
      <ProductList products={products} />
      <LabsFooter />
    </div>
  );
}
