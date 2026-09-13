import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Off on this machine: the dev cache's writes and compactions ran for a
    // minute at a time on a nearly full disk and stalled every request behind them.
    turbopackFileSystemCacheForDev: false,
  },
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
   * The app loads WebGL, fonts and models from itself and talks only to the
   * origins named in connect-src below: Arc's RPC endpoints, Blocky402 and the
   * Hedera mirror node for the corpus paywall, and WalletConnect. Naming them
   * means a script injected into a page cannot quietly ship data somewhere else.
   * `unsafe-eval` is required by the WASM/three toolchain and `unsafe-inline`
   * by Next's own inline bootstrap, so the policy is honest about what it does
   * and does not buy rather than pretending to be stricter than it is.
   */
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      // World ID's widget draws its icons from World's asset host.
      "img-src 'self' data: blob: https://world-id-assets.com",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      // Privy draws its sign-in and the embedded wallet in frames from its own
      // origin, behind a Cloudflare challenge; WalletConnect verifies from its.
      "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
      "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
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
        // Arc testnet, in the same order as RPC_ENDPOINTS in lib/chain.ts, with
        // the canonical host first. A host missing from this line is a host the
        // browser refuses, and the failover that was meant to survive an outage
        // fails on every page load instead.
        "https://rpc.blockdaemon.testnet.arc.io " +
        "https://rpc.quicknode.testnet.arc.io " +
        "https://rpc.testnet.arc.network " +
        "https://rpc.testnet.arc.io " +
        // Hedera, for the corpus paywall: x402 settles through Blocky402 and a
        // payer's balance is read from the mirror node before signing.
        "https://api.testnet.blocky402.com " +
        "https://testnet.mirrornode.hedera.com " +
        // Privy: sign-in, and the relay its embedded wallets reach RPCs through.
        "https://auth.privy.io https://*.rpc.privy.systems " +
        // World ID: the widget reaches the phone through World's bridge. Without
        // this the Selfie Check failed in the browser before any request left it.
        "https://bridge.worldcoin.org " +
        "wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org " +
        "https://explorer-api.walletconnect.com",
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
