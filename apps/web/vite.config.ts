import { defineConfig } from "vite";

// Built files are served by `pnpm hub` (apps/server). No dev server: build, then open http://127.0.0.1:4317.
export default defineConfig({
  build: { outDir: "dist", emptyOutDir: true },
});
