/**
 * pnpm dashboard — build apps/web with Vite's API, then start the hub (apps/server/src/main.ts).
 * No nested `pnpm` call: at Work pnpm runs as `corepack pnpm` and a bare `pnpm` is not on PATH (Work run 9).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const web = path.resolve(import.meta.dirname, "../apps/web");
// vite is a dependency of apps/web only: resolve it from there.
const vite: { build(cfg: { root: string; logLevel?: "warn" }): Promise<unknown> } = await import(pathToFileURL(createRequire(path.join(web, "package.json")).resolve("vite")).href);
await vite.build({ root: web, logLevel: "warn" });
console.log("Đã build apps/web");
await import("../apps/server/src/main.ts");
