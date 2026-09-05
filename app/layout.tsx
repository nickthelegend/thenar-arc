import type { Metadata, Viewport } from "next";
import { DM_Mono, Hanken_Grotesk, Press_Start_2P } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteNav } from "@/components/site-nav";
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
  title: "Thenar — the data foundry for physical AI",
  description:
    "Teleoperate a robot arm in the browser. Every accepted trajectory is measured, recorded, and paid in the same Monad transaction.",
  openGraph: {
    title: "Thenar — the data foundry for physical AI",
    description:
      "Drive a robot arm, get measured against the datum, and get paid on Monad in the transaction that records the run.",
    type: "website",
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
      <body className="min-h-dvh bg-ink-0 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-signal focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-widest focus:text-ink-0"
        >
          Skip to content
        </a>
        <Providers>
          <SiteNav />
          <main id="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
