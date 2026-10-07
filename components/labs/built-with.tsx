import Image from "next/image";

/**
 * The tools Thenar is built on, by their own logos.
 *
 * Each file is the project's own mark, taken from its site, docs or
 * repository: Monad's wordmark from monad.xyz, Privy's from its docs, Mera's
 * mark from mera.category.xyz, Envio's wordmark from its docs, Qwen's mark and
 * wordmark, x402's from x402.org, the Immersive Web's WebXR logo from its
 * samples repository, and DeepMind's MuJoCo wordmark from the MuJoCo
 * repository. Dark lettering was turned white for this page; nothing else
 * about any of them was changed.
 */
type Logo = { name: string; href: string; parts: { src: string; w: number; h: number }[]; label?: string };

const LOGOS: Logo[] = [
  { name: "Monad", href: "https://www.monad.xyz", parts: [{ src: "/labs/logos/monad.svg", w: 126, h: 24 }] },
  { name: "Privy", href: "https://www.privy.io", parts: [{ src: "/labs/logos/privy.png", w: 107, h: 24 }] },
  // Mera has a mark and no wordmark; its name is set as its own site sets it, Georgia italic.
  { name: "Mera", href: "https://github.com/category-labs/mera", parts: [{ src: "/labs/logos/mera.svg", w: 24, h: 24 }], label: "mera" },
  { name: "Envio", href: "https://envio.dev", parts: [{ src: "/labs/logos/envio.png", w: 100, h: 24 }] },
  {
    name: "Qwen", href: "https://qwen.ai",
    parts: [{ src: "/labs/logos/qwen-mark.svg", w: 24, h: 24 }, { src: "/labs/logos/qwen-text.svg", w: 75, h: 24 }],
  },
  { name: "x402", href: "https://www.x402.org", parts: [{ src: "/labs/logos/x402.svg", w: 62, h: 24 }] },
  { name: "WebXR", href: "https://immersiveweb.dev", parts: [{ src: "/labs/logos/webxr.svg", w: 95, h: 24 }] },
  { name: "MuJoCo", href: "https://mujoco.org", parts: [{ src: "/labs/logos/mujoco.svg", w: 110, h: 24 }] },
];

function Mark({ logo }: { logo: Logo }) {
  return (
    <a
      href={logo.href}
      target="_blank"
      rel="noreferrer"
      aria-label={logo.name}
      className="flex shrink-0 items-center gap-2 opacity-70 transition-opacity duration-300 hover:opacity-100 focus-visible:opacity-100"
    >
      {logo.parts.map((p) => (
        <Image key={p.src} src={p.src} alt="" width={p.w} height={p.h} unoptimized className="h-6 w-auto" />
      ))}
      {logo.label ? (
        <span className="font-[Georgia,serif] text-xl italic leading-none text-white">{logo.label}</span>
      ) : null}
    </a>
  );
}

export function BuiltWith() {
  return (
    <div className="relative mt-5 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
      <div className="flex w-max animate-[labs-marquee_32s_linear_infinite] items-center gap-14 hover:[animation-play-state:paused] motion-reduce:animate-none">
        {[...LOGOS, ...LOGOS].map((l, i) => (
          // The second copy only makes the loop seamless; it is not read twice.
          <div key={i} aria-hidden={i >= LOGOS.length || undefined}>
            <Mark logo={l} />
          </div>
        ))}
      </div>
    </div>
  );
}
