import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thenar — the data foundry for physical AI",
    short_name: "Thenar",
    description:
      "Teleoperate a robot arm in the browser. Every accepted trajectory is measured, recorded, and paid in the same Avalanche transaction.",
    start_url: "/hub",
    display: "standalone",
    background_color: "#000000",
    // The product's accent. This was #FF6A00 — the orange replaced in the
    // redesign — so an installed app still opened with the old brand in its
    // title bar and splash screen.
    theme_color: "#2B50E0",
    // An SVG alone is not an installable icon: Android wants a 192 and a 512
    // PNG, and without a maskable variant it crops the mark into whatever
    // silhouette the launcher uses. Redrawn at each size by scripts/icons.mjs.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    orientation: "any",
    categories: ["productivity", "utilities"],
  };
}
