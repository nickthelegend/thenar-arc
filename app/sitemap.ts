import type { MetadataRoute } from "next";

// Two canonical origins: the company (thenar.io) and the app (app.thenar.io).
// The Railway deployment is the backend; pointing crawlers at it would index
// the same pages twice.
const LABS = process.env.NEXT_PUBLIC_LABS_ORIGIN || "https://thenar.io";
const BASE = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://app.thenar.io";
const PRODUCTS = ["thenar", "quest", "arms", "hotaru", "band", "jx1", "jx0", "duck", "gt240"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${LABS}/`, lastModified: now, priority: 1 },
    { url: `${LABS}/products`, lastModified: now, priority: 0.9 },
    ...PRODUCTS.map((id) => ({ url: `${LABS}/products/${id}`, lastModified: now, priority: 0.7 })),
    { url: `${BASE}/`, lastModified: now, priority: 1 },
    { url: `${BASE}/hub`, lastModified: now, priority: 0.9 },
    { url: `${BASE}/foundry`, lastModified: now, priority: 0.8 },
    { url: `${BASE}/leaderboard`, lastModified: now, priority: 0.7 },
    { url: `${BASE}/spec`, lastModified: now, priority: 0.7 },
    { url: `${BASE}/spec/so101`, lastModified: now, priority: 0.7 },
    { url: `${BASE}/contracts`, lastModified: now, priority: 0.7 },
    { url: `${BASE}/post`, lastModified: now, priority: 0.6 },
    { url: `${BASE}/portfolio`, lastModified: now, priority: 0.5 },
  ];
}
