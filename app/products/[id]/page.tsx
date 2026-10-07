import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabsNav } from "@/components/labs/labs-nav";
import { LabsFooter } from "@/components/labs/labs-footer";
import { Reveal } from "@/components/labs/reveal";
import { InlineModel, View3D } from "@/components/labs/view-3d";
import { PRODUCTS, productById, repoUrl, type Product } from "@/lib/products";
import { appHref } from "@/lib/site";

export const revalidate = 3600;

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = productById((await params).id);
  return p ? { title: `${p.name} — ThenarLabs`, description: p.line } : {};
}

const has = (p?: string) => Boolean(p && existsSync(path.join(process.cwd(), "public", p)));

type Repo = { description: string | null; stargazers_count: number; pushed_at: string; language: string | null; html_url: string };

/** The repository as GitHub describes it, at most an hour old. Absent if GitHub will not say. */
async function repoInfo(repo: string): Promise<Repo | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
    });
    return r.ok ? ((await r.json()) as Repo) : null;
  } catch {
    return null;
  }
}

const STATUS_TONE: Record<Product["status"], string> = {
  Live: "border-go/40 text-go",
  Shipped: "border-go/40 text-go",
  "Open hardware": "border-signal/40 text-signal",
  Building: "border-white/20 text-scribe-2",
  "In design": "border-white/15 text-scribe-3",
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const product = productById((await params).id);
  if (!product) notFound();
  const images = product.images.filter((i) => has(i.src));
  const model = has(product.model) ? product.model : undefined;
  const info = await repoInfo(product.repo);
  const [cover, ...gallery] = images;
  const next = PRODUCTS[(PRODUCTS.indexOf(product) + 1) % PRODUCTS.length];

  return (
    <div className="relative overflow-hidden bg-black text-white">
      <LabsNav />
      <section className="mx-auto max-w-[1200px] px-6 pb-10 pt-36">
        <Link href="/products" className="text-sm text-scribe-3 transition-colors hover:text-white">← All products</Link>
        <Reveal fade className="mt-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs ${STATUS_TONE[product.status]}`}>{product.status}</span>
            <span className="text-sm text-scribe-3">{product.kind}</span>
          </div>
          <h1 className="heading-glow mt-5 text-5xl font-medium leading-none tracking-tight sm:text-7xl">{product.name}</h1>
          <p className="mt-5 max-w-[640px] text-lg text-scribe-2 sm:text-xl">{product.line}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={repoUrl(product)}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-lilac px-5 py-3 text-base font-semibold text-black transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.98]"
            >
              View on GitHub
            </a>
            {product.href ? (
              <Link
                href={appHref(product.href)}
                className="rounded-lg border border-white/15 px-5 py-3 text-base text-white transition-colors duration-500 hover:bg-white/5"
              >
                {product.hrefLabel ?? "Open"}
              </Link>
            ) : null}
            {model && cover ? <View3D url={model} name={product.name} zUp={product.zUp} /> : null}
          </div>
        </Reveal>
      </section>

      {!cover && model ? (
        <Reveal className="mx-auto max-w-[1200px] px-6">
          <figure className="overflow-hidden rounded-3xl border border-white/10 bg-[#08080A]">
            <InlineModel url={model} zUp={product.zUp} />
            <figcaption className="px-6 py-4 text-sm text-scribe-3">{product.name}, from its CAD. Drag to turn it.</figcaption>
          </figure>
        </Reveal>
      ) : null}
      {cover ? (
        <Reveal className="mx-auto max-w-[1200px] px-6">
          <figure className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0D]">
            <Image src={cover.src} alt={cover.caption} width={1600} height={1000} priority className="h-auto w-full" unoptimized={cover.src.endsWith(".webp")} />
            <figcaption className="px-6 py-4 text-sm text-scribe-3">{cover.caption}</figcaption>
          </figure>
        </Reveal>
      ) : null}

      <section className="mx-auto grid max-w-[1200px] gap-4 px-6 py-16 lg:grid-cols-[1.4fr_1fr]">
        <Reveal className="rounded-3xl border border-white/10 bg-[#0B0B0D] p-8">
          <p className="text-sm text-scribe-3">About</p>
          <p className="mt-4 text-base leading-relaxed text-white/90">{product.body}</p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {product.facts.map((f) => (
              <li key={f} className="rounded-full border border-white/10 px-3 py-1 text-xs text-scribe-2">{f}</li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={100}>
          <a
            href={repoUrl(product)}
            target="_blank"
            rel="noreferrer"
            className="group flex h-full flex-col rounded-3xl border border-white/10 bg-[#0B0B0D] p-8 transition-colors duration-500 hover:border-white/25"
          >
            <p className="flex items-center gap-2 text-sm text-scribe-3">
              <svg viewBox="0 0 16 16" className="size-4 fill-current" aria-hidden><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
              GitHub
            </p>
            <p className="mt-4 font-mono text-lg text-white">{product.repo}</p>
            {info?.description ? <p className="mt-3 text-sm text-scribe-2">{info.description}</p> : null}
            <div className="mt-auto flex flex-wrap gap-x-6 gap-y-2 pt-8 text-sm text-scribe-3">
              {info?.language ? <span>{info.language}</span> : null}
              {info ? <span>★ {info.stargazers_count}</span> : null}
              {info ? <span>Updated {new Date(info.pushed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span> : null}
              <span className="text-white transition-transform duration-500 group-hover:translate-x-1">Open the repository →</span>
            </div>
          </a>
        </Reveal>
      </section>

      {gallery.length ? (
        <section className="mx-auto max-w-[1200px] px-6 pb-20">
          <Reveal><h2 className="text-3xl font-medium tracking-tight">From the repository</h2></Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {gallery.map((img, i) => (
              <Reveal key={img.src} delay={(i % 2) * 100} className={img.wide ? "sm:col-span-2" : ""}>
                <figure className="overflow-hidden rounded-3xl border border-white/10 bg-[#0B0B0D]">
                  <Image src={img.src} alt={img.caption} width={1200} height={900} className="h-auto w-full" unoptimized />
                  <figcaption className="px-6 py-4 text-sm text-scribe-3">{img.caption}</figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mx-auto max-w-[1200px] px-6 pb-28">
        <Link
          href={`/products/${next.id}`}
          className="group flex items-center justify-between rounded-3xl border border-white/10 bg-[#0B0B0D] p-8 transition-colors duration-500 hover:border-white/25"
        >
          <span>
            <span className="text-sm text-scribe-3">Next</span>
            <span className="mt-1 block text-2xl font-medium">{next.name}</span>
          </span>
          <span className="text-2xl text-scribe-2 transition-transform duration-500 group-hover:translate-x-1">→</span>
        </Link>
      </section>
      <LabsFooter />
    </div>
  );
}
