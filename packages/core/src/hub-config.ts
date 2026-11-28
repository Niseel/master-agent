/**
 * Gates (MCP servers) and agents the user manages on the dashboard (milestone-1 §4). Kept in agenthub.local.json
 * (gitignored: org, project and workspace names are company data), shaped like VS Code's mcp.json (`servers`, `inputs`)
 * plus `agents` and `values`. No file = the built-in gates and agents, settings from .env (how Work runs today).
 * Secrets never go in the file: a value written `${input:<id>}` is filled at run time (inputs marked `password` come
 * from the OS keychain, see secrets.ts).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { MCPServerConfig } from "@microsoft/copilot-sdk";
import { z } from "zod";
import { gateProblem, gateServer, GATE_TOOLS, readerAgents, readerPrompt, type AgentSpec, type GatePreset } from "./agents.ts";
import { normalizeRepo, type HubConfig } from "./config.ts";
import { looksLikeWrite } from "./security.ts";

const KEY = /^[a-z][a-z0-9_]{0,30}$/;
const NAME = /^[a-z][a-z0-9-]{0,40}$/;

export const Gate = z.object({
  /** Built-in kind; absent = a server the user added (custom, or imported from mcp.json). */
  preset: z.enum(["workiq", "ado", "github", "azure"]).optional(),
  label: z.string().max(80).optional(),
  description: z.string().max(300).optional(),
  // VS Code mcp.json fields, for custom gates.
  type: z.enum(["stdio", "http"]).optional(),
  command: z.string().max(500).optional(),
  args: z.array(z.string().max(500)).max(50).optional(),
  env: z.record(z.string(), z.string().max(2000)).optional(),
  url: z.string().max(1000).optional(),
  headers: z.record(z.string(), z.string().max(2000)).optional(),
  /** Read tools the user ticked (server-relative names). Absent = the preset's default list; a custom gate needs a list. */
  tools: z.array(z.string().max(200)).max(300).optional(),
  /** Microsoft gates: own az profile dir (absolute path), when this gate signs in as another account. */
  account: z.string().max(500).optional(),
});
export type Gate = z.infer<typeof Gate>;

export const AgentEntry = z.object({
  /** Built-in agent it starts from (comms-reader, board-reader, …); absent = custom. */
  preset: z.string().max(60).optional(),
  displayName: z.string().max(80).optional(),
  description: z.string().max(300).optional(),
  /** Gate keys this agent reads through. */
  servers: z.array(z.string().regex(KEY)).max(10),
  /** Custom agents: who it is ("Bạn là agent đọc …"). */
  role: z.string().max(2000).optional(),
  /** What to read; replaces the preset's. */
  task: z.string().max(6000).optional(),
  /** When an item is a to-do; replaces the preset's. */
  todoRule: z.string().max(2000).optional(),
  model: z.string().max(100).optional(),
  enabled: z.boolean().optional(),
});
export type AgentEntry = z.infer<typeof AgentEntry>;

export const Input = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.-]{1,60}$/),
  description: z.string().max(300).optional(),
  /** Secret: the value lives in the OS keychain, never in this file. */
  password: z.boolean().optional(),
});

export const HubFile = z.object({
  servers: z.record(z.string().regex(KEY), Gate),
  agents: z.record(z.string().regex(NAME), AgentEntry),
  inputs: z.array(Input).max(100).default([]),
  /** Values of non-secret inputs and of preset fields, e.g. { "ado.org": "contoso" }. */
  values: z.record(z.string(), z.string().max(2000)).default({}),
  /** Servers imported from mcp.json, not on the canvas yet. */
  catalog: z.record(z.string().regex(KEY), Gate).default({}),
});
export type HubFile = z.infer<typeof HubFile>;

export const hubFilePath = (root: string) => process.env.AGENTHUB_HUB_FILE || path.join(root, "agenthub.local.json");

/** The built-in setup: 4 gates, 5 agents, values from .env (HubConfig). */
export function defaultHubFile(cfg: HubConfig): HubFile {
  return {
    servers: { workiq: { preset: "workiq" }, ado: { preset: "ado" }, github: { preset: "github" }, azure: { preset: "azure" } },
    agents: Object.fromEntries(
      readerAgents(cfg).map((a) => [a.name, { preset: a.name, servers: Object.keys(a.mcpServers) }]),
    ),
    inputs: [],
    values: {},
    catalog: {},
  };
}

export function loadHubFile(cfg: HubConfig): HubFile {
  const file = hubFilePath(cfg.root);
  if (!existsSync(file)) return defaultHubFile(cfg);
  const parsed = HubFile.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${path.basename(file)} không hợp lệ: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function saveHubFile(cfg: HubConfig, file: HubFile) {
  writeFileSync(hubFilePath(cfg.root), JSON.stringify(file, null, 2) + "\n");
}

/** HubConfig with the preset gates' values applied (the file wins over .env). */
export function effectiveConfig(cfg: HubConfig, file: HubFile): HubConfig {
  const v = file.values;
  const list = (s: string | undefined) => s?.split(",").map((x) => x.trim()).filter(Boolean);
  return {
    ...cfg,
    ado: { org: v["ado.org"] || cfg.ado.org, project: v["ado.project"] || cfg.ado.project },
    github: { repos: list(v["github.repos"])?.map(normalizeRepo) ?? cfg.github.repos },
    azure: { subscriptions: list(v["azure.subscriptions"]) ?? cfg.azure.subscriptions, workspaces: list(v["azure.workspaces"]) ?? cfg.azure.workspaces },
  };
}

/** Server config of one gate, or a reason it cannot run. */
export function gateConfig(cfg: HubConfig, key: string, g: Gate): { server?: MCPServerConfig; problem?: string } {
  if (g.preset) {
    const server = gateServer(g.preset, cfg);
    // Azure MCP signs in as the az account of this gate's profile (AzureCliCredential reads AZURE_CONFIG_DIR).
    if (g.preset === "azure" && g.account && server.type === "stdio") server.env = { ...server.env, AZURE_CONFIG_DIR: g.account };
    return { server, problem: gateProblem(g.preset, cfg) };
  }
  if (g.type === "stdio" && g.command) return { server: { type: "stdio", command: g.command, args: g.args ?? [], env: g.env, tools: ["*"], timeout: 60_000 } };
  if (g.type === "http" && g.url && /^https?:\/\//.test(g.url)) return { server: { type: "http", url: g.url, headers: g.headers, tools: ["*"], timeout: 60_000 } };
  return { problem: `Cổng ${key} thiếu ${g.type === "http" ? "URL http(s)" : "lệnh chạy (command)"}` };
}

/** Ticked read tools of a gate (server-relative). Write-looking names never pass, whatever the file says. */
export const gateTools = (g: Gate) => (g.tools ?? (g.preset ? GATE_TOOLS[g.preset] : [])).filter((t) => !looksLikeWrite(t));

/**
 * The agents a run uses. A preset agent keeps its prompt and task, with its tools limited to what its gates allow;
 * a custom agent gets every ticked tool of its gates. Gate keys may differ from the preset's (e.g. a second ADO gate).
 */
export function buildAgents(cfg: HubConfig, file: HubFile): AgentSpec[] {
  const eff = effectiveConfig(cfg, file);
  const presets = new Map(readerAgents(eff).map((a) => [a.name, a]));
  return Object.entries(file.agents)
    .filter(([, e]) => e.enabled !== false)
    .map(([name, e]) => {
      const base = e.preset ? presets.get(e.preset) : undefined;
      const problems: string[] = [];
      if (e.preset && !base) problems.push(`Không có agent mẫu "${e.preset}"`);
      if (!e.servers.length) problems.push("Chưa nối cổng nào");
      const mcpServers: Record<string, MCPServerConfig> = {};
      const readTools: string[] = [];
      for (const key of e.servers) {
        const g = file.servers[key];
        if (!g) {
          problems.push(`Không có cổng ${key}`);
          continue;
        }
        const { server, problem } = gateConfig(eff, key, g);
        if (problem) problems.push(problem);
        if (server) mcpServers[key] = server;
        const allowed = gateTools(g);
        // A preset agent keeps its own subset (e.g. board-reader: work items, not PRs) of what the gate allows.
        const own = base ? (base.readTools === "*" ? allowed : base.readTools.map((t) => t.slice(t.indexOf("-") + 1))) : allowed;
        const tools = own.filter((t) => allowed.includes(t));
        if (!tools.length) problems.push(`Cổng ${key} chưa chọn tool nào cho agent này`);
        readTools.push(...tools.map((t) => `${key}-${t}`));
      }
      // An empty field on the form means "not set".
      const todoRule = e.todoRule?.trim() || base?.todoRule || "mục cần tôi trả lời, quyết định hoặc làm gì đó.";
      const ownRole = e.role?.trim();
      const role = ownRole || (base ? undefined : `Bạn là agent "${e.displayName ?? name}" đọc dữ liệu qua các tool được cấp.`);
      return {
        ...(base ?? {}),
        name,
        displayName: e.displayName ?? base?.displayName ?? name,
        description: e.description ?? base?.description ?? "",
        todoRule,
        // A preset keeps its role text (it carries tool hints from Work); only the to-do rule changes.
        prompt: base && !ownRole ? base.prompt.replace(/Việc cần làm \(isTodo = true\) khi: [\s\S]*$/, `Việc cần làm (isTodo = true) khi: ${todoRule}`) : readerPrompt(role!, todoRule),
        task: e.task?.trim() || base?.task || "Liệt kê các mục trong khoảng thời gian được giao. ref = định danh của mục trong nguồn.",
        mcpServers,
        readTools,
        model: e.model ?? base?.model,
        missingConfig: [...new Set([...problems, ...(base?.missingConfig ? [base.missingConfig] : [])])].join("; ") || undefined,
      } satisfies AgentSpec;
    });
}

export interface Field {
  /** Key in HubFile.values. */
  key: string;
  label: string;
  /** The four questions every field answers (milestone-1 §4). */
  what: string;
  fill: string;
  where: string;
  why: string;
  placeholder?: string;
  /** URL that shows where to find the value. */
  link?: string;
}

export interface GateKind {
  preset: GatePreset;
  label: string;
  description: string;
  fields: Field[];
  /** How the user signs in (step 4). */
  signIn: "microsoft" | "github" | "workiq";
  /** Read tools ticked by default. */
  tools: string[];
}

/** Built-in gates for the catalog, with help on every field. */
const KINDS: Omit<GateKind, "tools">[] = [
  {
    preset: "workiq",
    label: "Outlook + Teams (Work IQ)",
    description: "Đọc mail và tin nhắn Teams của bạn qua Microsoft 365 Copilot (Work IQ).",
    fields: [],
    signIn: "workiq",
  },
  {
    preset: "ado",
    label: "Azure DevOps",
    description: "Work item, board, pull request và pipeline trên Azure DevOps (chỉ đọc).",
    signIn: "microsoft",
    fields: [
      {
        key: "ado.org",
        label: "Tổ chức (organization)",
        what: "Tên tổ chức Azure DevOps của bạn.",
        fill: "Chỉ phần tên, ví dụ contoso (không cần https://).",
        where: "Mở Azure DevOps trên trình duyệt: tên nằm ngay sau dev.azure.com/ trên thanh địa chỉ.",
        why: "Để nối tới đúng MCP server của tổ chức (https://mcp.dev.azure.com/<tên>).",
        placeholder: "contoso",
        link: "https://dev.azure.com",
      },
      {
        key: "ado.project",
        label: "Project",
        what: "Project chứa board và repo bạn làm việc hằng ngày.",
        fill: "Tên project đúng như trên Azure DevOps, ví dụ Orders.",
        where: "Azure DevOps → trang chủ tổ chức → danh sách Projects; hoặc phần sau tên tổ chức trên thanh địa chỉ.",
        why: "Agent chỉ đọc work item, PR và build trong project này, đỡ tốn credit.",
        placeholder: "Orders",
      },
    ],
  },
  {
    preset: "github",
    label: "GitHub",
    description: "Pull request, review và workflow run trên GitHub (chỉ đọc).",
    signIn: "github",
    fields: [
      {
        key: "github.repos",
        label: "Repo",
        what: "Các repo cần theo dõi.",
        fill: "Dạng owner/repo, nhiều repo cách nhau dấu phẩy. Để trống = mọi repo bạn tham gia.",
        where: "Mở repo trên GitHub: owner/repo là phần sau github.com/ trên thanh địa chỉ.",
        why: "Giới hạn phạm vi đọc: nhanh hơn, ít credit hơn, ít mục không liên quan.",
        placeholder: "contoso/orders, contoso/payments",
        link: "https://github.com",
      },
    ],
  },
  {
    preset: "azure",
    label: "Azure Monitor",
    description: "Lỗi production trong Log Analytics và activity log (chỉ đọc).",
    signIn: "microsoft",
    fields: [
      {
        key: "azure.subscriptions",
        label: "Subscription ID",
        what: "ID của subscription chứa các workspace Log Analytics.",
        fill: "Một ID dùng cho mọi workspace, hoặc mỗi workspace một ID theo cùng thứ tự, cách nhau dấu phẩy.",
        where: "Azure Portal → Subscriptions → cột Subscription ID; hoặc trang Overview của workspace.",
        why: "Azure MCP cần subscription để tìm workspace và đọc log.",
        link: "https://portal.azure.com/#view/Microsoft_Azure_Billing/SubscriptionsBlade",
      },
      {
        key: "azure.workspaces",
        label: "Workspace Log Analytics",
        what: "Tên các workspace chứa log của dịch vụ bạn phụ trách.",
        fill: "Tên workspace, nhiều cái cách nhau dấu phẩy.",
        where: "Azure Portal → Log Analytics workspaces → cột Name.",
        why: "Agent chỉ đọc lỗi trong các workspace này.",
        link: "https://portal.azure.com/#browse/Microsoft.OperationalInsights%2Fworkspaces",
      },
    ],
  },
];
export const GATE_KINDS: GateKind[] = KINDS.map((k) => ({ ...k, tools: GATE_TOOLS[k.preset] }));

/** Built-in agents for the catalog: which gate kinds each needs. */
export function agentKinds(cfg: HubConfig) {
  return readerAgents(cfg).map((a) => ({
    preset: a.name,
    displayName: a.displayName,
    description: a.description,
    todoRule: a.todoRule,
    needs: Object.keys(a.mcpServers) as GatePreset[],
  }));
}

const SECRETISH = /token|secret|password|passwd|api[-_]?key|authorization|cookie|credential|pat\b/i;

/**
 * Servers from a VS Code mcp.json (or settings.json "mcp" block): JSONC comments and trailing commas allowed.
 * Secret-looking env/header values are not imported: they become `${input:<server>_<name>}` (password) for the
 * user to fill through the sign-in screen, so a token never lands in agenthub.local.json.
 */
export function importMcpJson(text: string): { catalog: Record<string, Gate>; inputs: z.infer<typeof Input>[]; skipped: string[] } {
  const clean = text
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? "")
    .replace(/,(\s*[}\]])/g, "$1");
  const json = JSON.parse(clean) as { servers?: Record<string, Record<string, unknown>>; mcp?: { servers?: Record<string, Record<string, unknown>> } };
  const servers = json.servers ?? json.mcp?.servers ?? {};
  const catalog: Record<string, Gate> = {};
  const inputs: z.infer<typeof Input>[] = [];
  const skipped: string[] = [];
  for (const [name, s] of Object.entries(servers)) {
    const key = name.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "").slice(0, 30) || "server";
    const type = s.type === "http" || s.type === "sse" || (!s.type && typeof s.url === "string") ? "http" : s.command ? "stdio" : null;
    if (!type) {
      skipped.push(`${name}: không rõ kiểu (cần command hoặc url)`);
      continue;
    }
    const scrub = (rec: unknown) =>
      rec && typeof rec === "object"
        ? Object.fromEntries(
            Object.entries(rec as Record<string, unknown>).map(([k, v]) => {
              const val = String(v);
              if (!SECRETISH.test(k) || /\$\{input:/.test(val)) return [k, val];
              const id = `${key}_${k.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
              inputs.push({ id, description: `${name}: ${k}`, password: true });
              return [k, val.replace(/^(Bearer\s+)?.*$/i, (_m, bearer) => `${bearer ?? ""}\${input:${id}}`)];
            }),
          )
        : undefined;
    catalog[key] = Gate.parse({
      label: name,
      type,
      ...(type === "stdio" ? { command: String(s.command), args: Array.isArray(s.args) ? s.args.map(String) : [], env: scrub(s.env) } : { url: String(s.url), headers: scrub(s.headers) }),
    });
  }
  return { catalog, inputs, skipped };
}
