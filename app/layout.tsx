import type { Metadata, Viewport } from "next";
import { InstallShell } from "@/components/install";
import { LocaleReady } from "@/components/locale-ready";
import { Pulse } from "@/components/pulse";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { Archivo, DM_Mono, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteNav } from "@/components/site-nav";
import { Conditions } from "@/components/conditions";
// Before globals.css on purpose: RainbowKit ships resets that otherwise
// outrank Tailwind and collapse the station viewport to 300x150.
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

/**
 * Three faces, each with one job.
 *
 * Archivo carries display: the headlines and the wordmark. It is a grotesque
 * drawn for signage, so it has weight and tight apertures where a neutral UI
 * face has neither, and at 4rem it reads as something stamped on an instrument
 * rather than set in a template. That is the whole reason it is here — the
 * page previously ran its headlines in the same unopinionated face as its
 * paragraphs, which is why the type had no voice at any size.
 *
 * Hanken Grotesk carries body. Rounder and warmer than Archivo, which is what
 * makes the pairing read as two decisions rather than one face at two sizes.
 *
 * DM Mono takes every measured value, label, address and hash. Mono here is
 * for measurement and data, never for prose and never as a costume.
 *
 * There was a fourth: Press Start 2P, an arcade face, setting the wordmark in
 * the corner of every page. A protocol that settles real money and calls
 * itself a measuring instrument does not have a video-game logo. It is gone,
 * and the mark now sits beside its own name set in the display face.
 */
const grotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-grotesk",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

// The landing page's metadata voice. Plex Mono is drawn for technical setting
// and holds up at 10-12px with wide positive tracking, which is the entire job
// it does there: a constant layer of small type pinned to edges, counterweight
// to poster-scale display.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  // Without this, Next cannot resolve the image to an absolute URL and
  // silently emits no og:image at all — the card looked configured and
  // unfurled to nothing.
  metadataBase: new URL("https://thenar.io"),
  title: "Thenar — the data foundry for physical AI",
  description:
    "Teleoperate a robot arm in the browser. Every accepted trajectory is measured, recorded, and paid in the same Avalanche transaction.",
  openGraph: {
    title: "Thenar — the data foundry for physical AI",
    description:
      "Drive a robot arm, get measured against the datum, and get paid on Avalanche in the transaction that records the run.",
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
    title: "Thenar — the data foundry for physical AI",
    description:
      "Drive a robot arm, get measured against the datum, and get paid on Avalanche in the transaction that records the run.",
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
      className={`${grotesk.variable} ${dmMono.variable} ${archivo.variable} ${plexMono.variable}`}
    >
      <head>
        {/* Before the first paint, or the default theme renders for a frame and
            the chosen one arrives after it. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-ink-0 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-signal focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-widest focus:text-ink-0"
        >
          Skip to content
        </a>
        <Providers>
          <LocaleReady>
            <SiteNav />
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
