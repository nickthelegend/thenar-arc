import type { MetadataRoute } from "next";

const BASE = "https://web-production-2d1d0.up.railway.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, priority: 1 },
    { url: `${BASE}/hub`, lastModified: now, priority: 0.9 },
    { url: `${BASE}/foundry`, lastModified: now, priority: 0.8 },
    { url: `${BASE}/leaderboard`, lastModified: now, priority: 0.7 },
    { url: `${BASE}/spec`, lastModified: now, priority: 0.7 },
    { url: `${BASE}/post`, lastModified: now, priority: 0.6 },
    { url: `${BASE}/portfolio`, lastModified: now, priority: 0.5 },
  ];
}
