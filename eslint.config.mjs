import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MediaPipe's WASM glue, copied from node_modules on install; not ours to lint.
    "public/vision/wasm/**",
    // Local builds and the local chain's working files.
    ".next-*/**",
    ".localnet/**",
    "indexer/generated/**",
    // Written by the Envio CLI.
    "indexer/.envio/**",
    "indexer/envio-env.d.ts",
    "indexer/node_modules/**",
    // The CRE workflow's compiled bundle and its own dependencies.
    "cre/**/dist/**",
    "cre/**/node_modules/**",
  ]),
]);

export default eslintConfig;
