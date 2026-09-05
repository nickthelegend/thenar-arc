import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Saira_Condensed } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const saira = Saira_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-saira",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Axon — the data foundry for physical AI",
  description:
    "Teleoperate a robot arm in the browser. Every accepted trajectory is measured, recorded, and paid in the same Monad transaction.",
};

export const viewport: Viewport = {
  themeColor: "#0C1520",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${saira.variable} ${archivo.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-ink-1 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-brass focus:px-3 focus:py-2 focus:font-mono focus:text-xs focus:uppercase focus:tracking-widest focus:text-ink-0"
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
