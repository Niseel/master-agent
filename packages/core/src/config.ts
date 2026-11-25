import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type RuntimeKind = "mock" | "byok" | "copilot";

export interface HubConfig {
  runtime: RuntimeKind;
  /** Root of the repo (logs/, reports/, fixtures/ live here). */
  root: string;
  /** Default model. null = let Copilot pick. */
  model: string | null;
  /** Credit budget for one brief, split evenly across agents (sessionLimits.maxAiCredits). */
  maxAiCredits: number;
  /** Per-agent timeout. */
  timeoutMs: number;
  /** Mock runtime: which fixtures/scenarios/<name>.jsonl to replay. */
  scenario: string;
  ado: { org: string; project: string };
  github: { repos: string[] };
  /** Paired by index; a single subscription applies to every workspace. */
  azure: { subscriptions: string[]; workspaces: string[] };
  byok: { baseUrl: string; apiKey: string };
}

export type UserConfig = Partial<Omit<HubConfig, "root" | "byok">>;

/** Load agenthub.config.ts (optional) and apply env overrides. Env wins. */
export async function loadConfig(root = findRoot()): Promise<HubConfig> {
  const file = path.join(root, "agenthub.config.ts");
  const user: UserConfig = existsSync(file) ? (await import(pathToFileURL(file).href)).default : {};
  const env = process.env;
  const list = (v: string | undefined) => v?.split(",").map((s) => s.trim()).filter(Boolean);
  const runtime = (env.AGENTHUB_RUNTIME ?? user.runtime ?? "mock") as RuntimeKind;
  if (!["mock", "byok", "copilot"].includes(runtime)) throw new Error(`AGENTHUB_RUNTIME không hợp lệ: ${runtime}`);
  return {
    runtime,
    root,
    model: env.AGENTHUB_MODEL ?? user.model ?? null,
    maxAiCredits: Number(env.AGENTHUB_MAX_AI_CREDITS ?? user.maxAiCredits ?? 120),
    timeoutMs: Number(env.AGENTHUB_TIMEOUT_MS ?? user.timeoutMs ?? 150_000),
    scenario: env.AGENTHUB_SCENARIO ?? user.scenario ?? "brief-ok",
    ado: {
      org: env.ADO_ORG ?? user.ado?.org ?? "",
      project: env.ADO_PROJECT ?? user.ado?.project ?? "",
    },
    github: { repos: (env.GITHUB_REPOS?.split(",") ?? user.github?.repos ?? []).map(normalizeRepo).filter(Boolean) },
    azure: {
      subscriptions: list(env.AZURE_SUBSCRIPTION) ?? user.azure?.subscriptions ?? [],
      workspaces: list(env.AZURE_LOG_WORKSPACE) ?? user.azure?.workspaces ?? [],
    },
    byok: {
      baseUrl: env.BYOK_BASE_URL ?? "https://api.anthropic.com",
      apiKey: env.ANTHROPIC_API_KEY ?? "",
    },
  };
}

/** "https://github.com/o/r.git/" or " o/r " -> "o/r". */
export const normalizeRepo = (s: string) =>
  s.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/+$/, "").replace(/\.git$/i, "");

function findRoot(): string {
  let dir = process.cwd();
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
  return dir;
}
