import type { UserConfig } from "./packages/core/src/config.ts";

// User settings. Environment variables (.env) override every value here.
// Do not put secrets in this file; it is committed.
export default {
  // "mock" (Home default) | "byok" (Home, real SDK) | "copilot" (Work)
  runtime: "mock",
  // null = Copilot picks. At Work, set a model the org allows (see docs/step0-results.md).
  model: null,
  // AI Credit cap for one brief, split evenly across the agents that run. It is a cap, not the spend
  // (Work runs: ~35 for 4 agents). The runtime needs at least 30 per session, so 5 agents => at least 150.
  maxAiCredits: 150,
  timeoutMs: 150_000,
  ado: { org: "", project: "" },
  github: { repos: [] },
  // Paired by index; one subscription applies to every workspace.
  azure: { subscriptions: [], workspaces: [] },
} satisfies UserConfig;
