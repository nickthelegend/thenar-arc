import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both are native or WebAssembly and must not be bundled: better-sqlite3 is
  // a compiled addon, and mujoco ships an eight-megabyte .wasm its own loader
  // resolves beside itself.
  serverExternalPackages: ["better-sqlite3", "mujoco"],

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
      /**
       * Every origin this app is allowed to talk to, named.
       *
       * The two fallback RPCs belong here for the reason the policy exists:
       * adding an endpoint to lib/chain.ts and not to this line means the
       * browser refuses the request, and the failover that was supposed to
       * survive an outage instead fails on every page load. It did — the whole
       * page sweep went red the moment the secondaries were wired in, which is
       * the policy doing its job.
       *
       * Kept in the same order as RPC_ENDPOINTS so the two lists can be read
       * against each other.
       */
      "connect-src 'self' " +
        "https://api.avax-test.network " +
        "https://avalanche-fuji-c-chain-rpc.publicnode.com " +
        "https://avalanche-fuji.drpc.org " +
        "https://glacier-api.avax.network " +
        "wss://relay.walletconnect.com https://explorer-api.walletconnect.com",
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
