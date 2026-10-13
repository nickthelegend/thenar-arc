import type { NextConfig } from "next";

const NETWORK = (process.env.NEXT_PUBLIC_ARC_NETWORK ?? "testnet").toLowerCase();
const FORK = NETWORK === "fork";
const FORK_RPC = process.env.NEXT_PUBLIC_FORK_RPC || process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:9000";
const ARC_RPC = process.env.NEXT_PUBLIC_ARC_RPC;

const nextConfig: NextConfig = {
  // A fork build goes beside the testnet one (NEXT_DIST_DIR=.next-fork), not over it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Whether the server can list an address's calls from Arc's Blockscout
  // explorer, so pages do not ask a question whose answer is fixed at build
  // time. Blockscout needs no key; only a local fork has no index.
  env: { NEXT_PUBLIC_INDEX_CONFIGURED: FORK ? "" : "1" },
  experimental: {
    cpus: 2,
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
   * origins named in connect-src below: Arc's RPC endpoints (or the fork's),
   * Circle's Iris attestation service for CCTP withdrawals, the destination
   * chains' public RPCs, Privy, and WalletConnect. x402 settles in-process on
   * this server, so no facilitator origin is needed. Naming them
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
      "img-src 'self' data: blob:",
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
        // A GLB's embedded textures are handed to the image decoder as blob:
        // URLs that GLTFLoader fetches. Same-document only, and without it
        // every textured model on the site loads grey or not at all.
        "blob: " +
        // Arc, in the same order as RPC_ENDPOINTS in lib/chain.ts. A host
        // missing from this line is a host the browser refuses.
        (FORK
          // A fork build still reads the real testnet for the finality strip, P-256 and Memo probes.
          ? `${FORK_RPC} https://rpc.testnet.arc.io wss://rpc.testnet.arc.io ${ARC_RPC ? `${ARC_RPC} ` : ""}`
          : `https://rpc.testnet.arc.io https://rpc.mainnet.arc.io wss://rpc.testnet.arc.io wss://rpc.mainnet.arc.io ${ARC_RPC ? `${ARC_RPC} ` : ""}`) +
        // CCTP V2: Circle's Iris attests a burn on Arc; /portfolio polls it.
        "https://iris-api-sandbox.circle.com https://iris-api.circle.com " +
        // Where a withdrawal is minted and a CCIP licence order is sent from:
        // the destination chains' public RPCs, read by the browser's wallet client.
        "https://sepolia.base.org https://mainnet.base.org https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com " +
        "https://sepolia-rollup.arbitrum.io https://arb1.arbitrum.io " +
        // Privy: sign-in, and the relay its embedded wallets reach RPCs through.
        "https://auth.privy.io https://*.rpc.privy.systems " +
        "wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org " +
        "https://explorer-api.walletconnect.com " +
        // The arm relay (scripts/arm-relay.mjs) on the operator's own machine:
        // the station mirrors a run onto their SO-101 through it. Loopback
        // only, so a page can reach an arm on this desk and nowhere else. Any
        // port: 8787 by default, another when it is taken (?relay=…).
        "ws://localhost:* ws://127.0.0.1:*",
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
          // The camera for this origin only: /post scans the real table into a
          // task. Every other origin, and every other sensor, stays refused.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
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
