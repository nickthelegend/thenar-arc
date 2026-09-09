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
  /**
   * Headers a browser should get whatever else happens.
   *
   * The app loads WebGL, fonts and models from itself and talks to exactly two
   * origins it does not own: the Avalanche RPC and Glacier. Naming them means a
   * script injected into a page cannot quietly ship data somewhere else.
   * `unsafe-eval` is required by the WASM/three toolchain and `unsafe-inline`
   * by Next's own inline bootstrap, so the policy is honest about what it does
   * and does not buy rather than pretending to be stricter than it is.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "connect-src 'self' https://api.avax-test.network https://glacier-api.avax.network https://testnet-rpc.monad.xyz wss://relay.walletconnect.com https://explorer-api.walletconnect.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");

    return [
      /**
       * The read API is public, and until now it was public only in the sense
       * that it was not authenticated — no page on another origin could
       * actually call it. Everything it returns is already on chain or already
       * rendered on this site, so there is nothing here to protect by
       * accident.
       *
       * Reads only, and deliberately by omission rather than by rule: allowing
       * the origin without allowing methods or headers means a cross-origin
       * GET succeeds while anything that needs a preflight — every POST here
       * sends JSON, which always preflights — is refused by the browser. The
       * writes stay same-origin without a second list to keep in step.
       */
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Vary", value: "Origin" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },

  async rewrites() {
    const backend = process.env.BACKEND_ORIGIN?.replace(/\/$/, "");
    return {
      beforeFiles: backend
        ? [
            // The bare path as well as everything under it. `/api/:path*` does
            // not match `/api`, so the catalogue fell through to a trailing-
            // slash redirect and never reached the backend at all.
            { source: "/api", destination: `${backend}/api` },
            { source: "/api/:path*", destination: `${backend}/api/:path*` },
          ]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
