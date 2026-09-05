import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Axon — the data foundry for physical AI",
    short_name: "Axon",
    description:
      "Teleoperate a robot arm in the browser. Every accepted trajectory is measured, recorded, and paid in the same Monad transaction.",
    start_url: "/hub",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#FF6A00",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
