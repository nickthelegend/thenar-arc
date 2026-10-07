/**
 * Let `node --test` load the app's TypeScript directly.
 *
 * Node strips types on its own now, so the only thing standing between a plain
 * `node` test and lib/ is resolution: the source writes `./bench` and `@/lib/x`
 * the way the bundler expects, and Node's ESM resolver wants a real filename.
 * This adds the two rules the bundler applies — try `.ts`, and read `@/` as the
 * repo root — and nothing else.
 *
 * The point is that the scorer gets tested as the code that actually runs,
 * rather than as a copy of it kept in a test file. A copy is how a scoring rule
 * ends up passing its own tests while disagreeing with the thing that signs.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { existsSync } from "node:fs";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const asTs = resolvePath(ROOT, `${specifier.slice(2)}.ts`);
    if (existsSync(asTs)) return next(pathToFileURL(asTs).href, context);
  }
  if (specifier.startsWith(".")) {
    try {
      return await next(specifier, context);
    } catch (e) {
      if (e?.code !== "ERR_MODULE_NOT_FOUND") throw e;
      return next(`${specifier}.ts`, context);
    }
  }
  return next(specifier, context);
}
