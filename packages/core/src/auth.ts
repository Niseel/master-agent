/**
 * Sign-in state of each source, for the dashboard's auth panel. Never returns a token: `az` is asked only for
 * the expiry time, `gh` only for its exit code.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gateProblem, type AgentSpec } from "./agents.ts";
import type { HubConfig } from "./config.ts";
import { effectiveConfig, GATE_KINDS, type HubFile } from "./hub-config.ts";
import type { SignIn } from "./login.ts";
import type { SecretStore } from "./secrets.ts";

const exec = promisify(execFile);

/** Run `az` and return trimmed stdout. az is a .cmd shim on Windows; args are constants, so cmd /c is safe. */
export async function az(args: string[], configDir?: string, timeout = 60_000) {
  const [cmd, argv]: [string, string[]] = process.platform === "win32" ? ["cmd", ["/c", "az", ...args]] : ["az", args];
  const env = configDir ? { ...process.env, AZURE_CONFIG_DIR: configDir } : process.env;
  return (await exec(cmd, argv, { timeout, env })).stdout.trim();
}

export interface AuthStatus {
  /** Gate (MCP server) key. */
  source: string;
  agent: string;
  status: "ok" | "error" | "mock" | "unknown";
  detail: string;
  /** How to sign in from the dashboard; "token" = fill the gate's secrets on its form. */
  signIn?: SignIn | "token" | null;
}

/** First useful line of a failed command, short. */
const firstLine = (e: unknown) => {
  const err = e as { stderr?: string; message?: string; code?: string; path?: string };
  if (err.code === "ENOENT") return `Chưa cài lệnh \`${err.path}\` (hoặc không có trong PATH)`;
  const text = (err.stderr || err.message || String(e)).split(/\r?\n/).find((l) => l.trim()) ?? "";
  return text.trim().slice(0, 240);
};

const isMock = (a: AgentSpec) =>
  Object.values(a.mcpServers).some((s) => "args" in s && s.args?.some((x) => x.includes("mock-mcp")));

/** Cheap checks, no AI Credits. Work IQ has no check without a model call: its EULA/consent errors show up in a run. */
export async function checkAuth(agents: AgentSpec[], runtime: string): Promise<AuthStatus[]> {
  const token = (scope: string[], configDir?: string) =>
    az(["account", "get-access-token", ...scope, "--query", "expiresOn", "-o", "tsv"], configDir, 30_000).then(
      (exp) => ({ status: "ok" as const, detail: `Token còn hạn tới ${exp}` }),
    );
  const checks: Record<string, () => Promise<Pick<AuthStatus, "status" | "detail">>> = {
    github: () => exec("gh", ["auth", "status", "--hostname", "github.com"], { timeout: 30_000 }).then(() => ({ status: "ok", detail: "gh đã đăng nhập" })),
    ado: () => token(["--scope", "https://mcp.dev.azure.com/.default"], process.env.ADO_AZURE_CONFIG_DIR),
    azure: () => token([]),
    workiq: async () => ({ status: "unknown", detail: "Kiểm khi chạy (EULA, admin consent)" }),
  };
  // One row per server: two agents may share one (board-reader and adorepo-reader both use `ado`).
  const seen = new Set<string>();
  return Promise.all(
    agents.flatMap((a) =>
      Object.keys(a.mcpServers).filter((k) => !seen.has(k) && seen.add(k)).map(async (source): Promise<AuthStatus> => {
        const base = { source, agent: a.name };
        if (runtime === "mock") return { ...base, status: "mock", detail: "Runtime mock: phát lại kịch bản, không gọi dịch vụ thật" };
        if (isMock(a)) return { ...base, status: "mock", detail: "MCP giả (packages/mock-mcp), không cần đăng nhập" };
        if (a.missingConfig) return { ...base, status: "error", detail: a.missingConfig };
        const check = checks[source];
        if (!check) return { ...base, status: "unknown", detail: "Không có cách kiểm" };
        try {
          return { ...base, ...(await check()) };
        } catch (e) {
          return { ...base, status: "error", detail: firstLine(e) };
        }
      }),
    ),
  );
}

/**
 * Sign-in state of every gate in the config (milestone-1 §4). Built-in gates: the CLI check above, with the gate's own
 * az profile when set. Custom gates: ok once every secret it needs is in the keychain (the server is only reached in a run).
 */
export async function checkGates(cfg: HubConfig, file: HubFile, secrets: SecretStore): Promise<AuthStatus[]> {
  const eff = effectiveConfig(cfg, file);
  const token = (scope: string[], configDir?: string) =>
    az(["account", "get-access-token", ...scope, "--query", "expiresOn", "-o", "tsv"], configDir, 30_000).then(
      (exp) => ({ status: "ok" as const, detail: `Token còn hạn tới ${exp}` }),
    );
  return Promise.all(
    Object.entries(file.servers).map(async ([key, g]): Promise<AuthStatus> => {
      const signIn: AuthStatus["signIn"] = g.preset ? GATE_KINDS.find((k) => k.preset === g.preset)!.signIn : "token";
      const base = { source: key, agent: "", signIn };
      if (cfg.runtime === "mock") return { ...base, status: "mock", detail: "Runtime mock: phát lại kịch bản, không gọi dịch vụ thật" };
      if (!g.preset) {
        const ids = [...JSON.stringify(g).matchAll(/\$\{input:([A-Za-z0-9_.-]+)\}/g)].map((m) => m[1]);
        const missing = ids.filter((id) => file.inputs.find((i) => i.id === id)?.password && !secrets.get(id));
        if (missing.length) return { ...base, status: "error", detail: `Thiếu giá trị bí mật: ${missing.join(", ")}. Nhập ở form của cổng (tab Cấu hình).` };
        return { ...base, signIn: ids.length ? "token" : null, status: "unknown", detail: ids.length ? "Đã có bí mật; cổng được kiểm khi chạy" : "Không cần đăng nhập, hoặc cổng tự xử lý; kiểm khi chạy" };
      }
      const problem = gateProblem(g.preset, eff);
      if (problem && g.preset !== "ado") return { ...base, status: "error", detail: problem };
      try {
        if (g.preset === "github") {
          await exec("gh", ["auth", "status", "--hostname", "github.com"], { timeout: 30_000 });
          return { ...base, status: "ok", detail: "gh đã đăng nhập" };
        }
        if (g.preset === "ado") return { ...base, ...(await token(["--scope", "https://mcp.dev.azure.com/.default"], g.account || process.env.ADO_AZURE_CONFIG_DIR)) };
        if (g.preset === "azure") return { ...base, ...(await token([], g.account)) };
        return { ...base, status: "unknown", detail: "Kiểm khi chạy (đăng nhập Microsoft 365, EULA, admin consent)" };
      } catch (e) {
        return { ...base, status: "error", detail: firstLine(e) };
      }
    }),
  );
}

