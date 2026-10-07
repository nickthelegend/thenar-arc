import type { Metadata, Viewport } from "next";
import { InstallShell } from "@/components/install";
import { LocaleReady } from "@/components/locale-ready";
import { Pulse } from "@/components/pulse";
import { DM_Mono, Poppins } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteNav } from "@/components/site-nav";
import { Conditions } from "@/components/conditions";
import { LOCALNET, appChain } from "@/lib/chain";
import "./globals.css";

/**
 * Two faces.
 *
 * Poppins carries everything a person reads: headlines, the wordmark, body.
 * Geometric and round, it is what the ThenarLabs look is set in, from the
 * company page to the station.
 *
 * DM Mono takes every measured value, label, address and hash. Mono here is
 * for measurement and data, never for prose and never as a costume.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-poppins",
  display: "swap",
});

// Data only, so it is fetched when a page shows data rather than preloaded on every page.
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  // Without this, Next cannot resolve the image to an absolute URL and
  // silently emits no og:image at all — the card looked configured and
  // unfurled to nothing.
  metadataBase: new URL("https://thenar.io"),
  title: "ThenarLabs — we build physical AI",
  description:
    "ThenarLabs builds robots, the teleoperation that drives them, and Thenar: the data foundry where people are paid on Monad for every run they record.",
  openGraph: {
    title: "ThenarLabs — we build physical AI",
    description:
      "Drive a robot arm, get measured against the datum, and get paid on Monad in the transaction that records the run.",
    type: "website",
    // A static file rather than the opengraph-image route convention. That
    // convention built locally, appeared in the routes manifest and produced
    // output in .next/server/app, and still returned 404 on the deployed
    // host with and without a pinned runtime. A file in public/ is served the
    // same way by every host, which is the only property that matters here.
    //
    // Redrawn by `node scripts/og.mjs`, which reads the figures from the
    // contract. The card carries the date they were read, because a share
    // card is a snapshot and must not imply the numbers are live.
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Thenar — crowdsourced robot manipulation data, settled on chain per run" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ThenarLabs — we build physical AI",
    description:
      "Drive a robot arm, get measured against the datum, and get paid on Monad in the transaction that records the run.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${poppins.variable} ${dmMono.variable}`}
    >
      <body className="min-h-dvh bg-ink-0 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-signal focus:px-3 focus:py-2 focus: focus:text-xs focus: focus:tracking-widest focus:text-ink-0"
        >
          Skip to content
        </a>
        <Providers>
          <LocaleReady>
            <SiteNav />
            {/* The copy across the site names Monad, where Thenar runs. A local
                build says, on every page, that this is not Monad. */}
            {LOCALNET ? (
              <div data-testid="localnet-banner" className="border-b border-rule bg-ink-1 px-5 py-1.5 text-center font-mono text-[12px] text-scribe-2">
                Local chain: every transaction here is on {appChain.name} ({appChain.id}) on this machine, not on Monad.{" "}
                <a href="/localnet" className="text-probe hover:underline">Wallet and faucet</a>
              </div>
            ) : null}
            <Conditions />
            <Pulse />
            <InstallShell />
            <main id="main">{children}</main>
          </LocaleReady>
        </Providers>
      </body>
    </html>
  );
}
