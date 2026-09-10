/** Installs the TypeScript resolver for `node --test`. See resolve-ts.mjs. */
import { register } from "node:module";
register("./resolve-ts.mjs", import.meta.url);
