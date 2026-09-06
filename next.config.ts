import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],

  /**
   * The frontend and the backend are deployed separately: the API routes own a
   * SQLite file on a persistent volume, which a serverless host cannot keep, so
   * they stay on Railway and the frontend proxies to them.
   *
   * These have to be `beforeFiles` — the default `afterFiles` phase runs only
   * when nothing on the filesystem matched, and the API routes are on the
   * filesystem in both deployments, so they would answer locally and the proxy
   * would never fire. With BACKEND_ORIGIN unset the app serves its own API,
   * which is exactly what the Railway deployment should do.
   */
  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN?.replace(/\/$/, "");
    return {
      beforeFiles: backend
        ? [{ source: "/api/:path*", destination: `${backend}/api/:path*` }]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
