import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { Product } from "@/lib/products";
import { Reveal } from "@/components/labs/reveal";

const STATUS_TONE: Record<Product["status"], string> = {
  Live: "border-go/40 text-go",
  Shipped: "border-go/40 text-go",
  "Open hardware": "border-signal/40 text-signal",
  Building: "border-white/20 text-scribe-2",
  "In design": "border-white/15 text-scribe-3",
};

/** Every product as a card: its real cover from the repository, what it is, and a way in. */
export function ProductList({ products }: { products: Product[] }) {
  return (
    <section className="mx-auto grid max-w-[1200px] gap-4 px-6 pb-32 md:grid-cols-2">
      {products.map((p, i) => {
        const cover = p.images[0] ?? (p.poster ? { src: p.poster, caption: p.name } : undefined);
        return (
          <Reveal key={p.id} as="article" delay={(i % 2) * 100}>
            <Link
              href={`/products/${p.id}`}
              className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0D] transition-colors duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/25"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-[#111114]">
                {cover ? (
                  <Image
                    src={cover.src}
                    alt={cover.caption}
                    fill
                    sizes="(min-width: 768px) 600px, 100vw"
                    unoptimized
                    className={cn(
                      p.images[0] ? "object-cover" : "object-contain p-8",
                      "transition-transform duration-1000 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-[1.03]",
                    )}
                  />
                ) : null}
              </div>
              <div className="flex flex-1 flex-col p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("rounded-full border px-3 py-1 text-xs", STATUS_TONE[p.status])}>{p.status}</span>
                  <span className="text-xs text-scribe-3">{p.kind}</span>
                </div>
                <h2 className="mt-5 text-3xl font-medium tracking-tight">{p.name}</h2>
                <p className="mt-3 text-sm text-scribe-2">{p.line}</p>
                <span className="mt-auto flex items-center justify-between pt-8 text-sm">
                  <span className="font-mono text-xs text-scribe-3">github.com/{p.repo}</span>
                  <span className="text-white transition-transform duration-500 group-hover:translate-x-1">Open →</span>
                </span>
              </div>
            </Link>
          </Reveal>
        );
      })}
    </section>
  );
}
