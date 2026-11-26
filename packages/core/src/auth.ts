/**
 * Sign-in state of each source, for the dashboard's auth panel. Never returns a token: `az` is asked only for
 * the expiry time, `gh` only for its exit code.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentSpec } from "./agents.ts";

const exec = promisify(execFile);

/** Run `az` and return trimmed stdout. az is a .cmd shim on Windows; args are constants, so cmd /c is safe. */
export async function az(args: string[], configDir?: string, timeout = 60_000) {
  const [cmd, argv]: [string, string[]] = process.platform === "win32" ? ["cmd", ["/c", "az", ...args]] : ["az", args];
  const env = configDir ? { ...process.env, AZURE_CONFIG_DIR: configDir } : process.env;
  return (await exec(cmd, argv, { timeout, env })).stdout.trim();
}

export interface AuthStatus {
  /** MCP server key = source: workiq, ado, github, azure. */
  source: string;
  agent: string;
  status: "ok" | "error" | "mock" | "unknown";
  detail: string;
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
  return Promise.all(
    agents.flatMap((a) =>
      Object.keys(a.mcpServers).map(async (source): Promise<AuthStatus> => {
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
