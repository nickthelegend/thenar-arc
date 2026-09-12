/**
 * Where Thenar's corpus security lives on Hedera, and the Asset Tokenization
 * Studio deployment it was issued through.
 *
 * No imports, on purpose: scripts/ats-deploy.mjs loads this file with Node,
 * outside the Next build, so it can only hold what Node can read on its own.
 *
 * The factory and resolver are the ones the Studio's own web app points at on
 * testnet (apps/ats/web/.env.example). Nothing here is deployed by Thenar
 * except the security itself: the business logic behind it is Hedera's.
 */
export const ATS = {
  network: "testnet",
  chainId: 296,
  rpc: "https://testnet.hashio.io/api",
  mirror: "https://testnet.mirrornode.hedera.com/api/v1",
  hashscan: "https://hashscan.io/testnet",
  factory: { id: "0.0.9213391", evm: "0xd1f118a40f3b02883d35909ef2517e7edd78379d" },
  resolver: { id: "0.0.9212226", evm: "0xba2d5fc2083a0b8f164c50e65d782087fba18e0a" },
  /** The resolver's configuration key for equities. */
  equityConfigId: "0x0000000000000000000000000000000000000000000000000000000000000001",
  /** A single-partition security keeps its whole supply in partition 1. */
  partition: "0x0000000000000000000000000000000000000000000000000000000000000001",
} as const;

/** The roles the issuer needs, as the Studio hashes them. */
export const ATS_ROLE = {
  admin: "0x0000000000000000000000000000000000000000000000000000000000000000",
  issuer: "0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f",
  controlList: "0x6ed9a91e996c6475ecdc28ecbdbe9bd1122fc62b30cdbe6da8271884b51ec74d",
  corporateActions: "0xa1acfc499025c99f55059195e6276f639d34a18aad7b8121b9192b7f438c55cd",
} as const;

/** Set once scripts/ats-deploy.mjs has issued the security. */
export const CORPUS_SECURITY = (process.env.NEXT_PUBLIC_CORPUS_SECURITY || undefined) as `0x${string}` | undefined;
export const CORPUS_SECURITY_ID = process.env.NEXT_PUBLIC_CORPUS_SECURITY_ID || undefined;

/**
 * Shares one accepted run earns at a perfect score.
 *
 * Scaled by the score the verifier signed, so a clean run is worth more of the
 * corpus than a scrappy one, and the cap table reads as the contribution record.
 */
export const SHARES_PER_RUN = 100;
