import type { Metadata, Viewport } from "next";
import { LocaleReady } from "@/components/locale-ready";
import { Pulse } from "@/components/pulse";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { DM_Mono, Hanken_Grotesk, Press_Start_2P } from "next/font/google";
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
 * Hanken Grotesk carries display and body — a geometric grotesque with the
 * same neutral warmth the category reads as native. DM Mono takes every
 * measured value, label, address and hash; mono here is for measurement and
 * data, never for prose. Press Start 2P is the pixel voice, used only on the
 * wordmark and the payout figure, where the product is allowed to shout.
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

const pixel = Press_Start_2P({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-pixel",
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
      className={`${grotesk.variable} ${dmMono.variable} ${pixel.variable}`}
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
            <main id="main">{children}</main>
          </LocaleReady>
        </Providers>
      </body>
    </html>
  );
}
