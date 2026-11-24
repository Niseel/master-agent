/**
 * Fake MCP servers (stdio) backed by fixtures/data/*.json. Synthetic data only.
 *   node --import tsx packages/mock-mcp/src/server.ts workiq|ado|azure
 * Tool names follow docs/mcp-tools.md (real names from Step 0 at Work).
 * ponytail: input schemas are guessed (SDK does not expose real ones); fix them from the `args`
 * recorded in logs/audit-*.jsonl at Work.
 * Each server also exposes WRITE tools, so tests can prove reader agents are blocked from them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = (name: string) => JSON.parse(readFileSync(path.join(root, "fixtures/data", `${name}.json`), "utf8"));
const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (text: string) => ({ isError: true, content: [{ type: "text" as const, text }] });
const readOnly = { readOnlyHint: true };
const NEVER = "mock: write tool must never be reached by a reader agent";

const kind = process.argv[2];
const server = new McpServer({ name: `mock-${kind}`, version: "0.2.0" });

if (kind === "workiq") {
  const data = load("workiq");
  // Entities by WorkIQ path. ponytail: path format guessed.
  const entities: Record<string, unknown> = Object.fromEntries([
    ...data.mail.map((m: { id: string }) => [`/me/messages/${m.id}`, { kind: "mail", ...m }]),
    ...data.teams.map((t: { id: string }) => [`/me/chats/messages/${t.id}`, { kind: "teams", ...t }]),
  ]);
  const all = () => Object.entries(entities).map(([p, e]) => ({ path: p, ...(e as object) }));
  server.registerTool(
    "retrieve",
    { description: "Search the user's M365 work data (mail, Teams messages)", inputSchema: { query: z.string() }, annotations: readOnly },
    async () => json(all()),
  );
  server.registerTool(
    "ask",
    { description: "Ask Microsoft 365 Copilot about emails, meetings, Teams", inputSchema: { question: z.string(), agentId: z.string().optional() }, annotations: readOnly },
    async () => json({ answer: "Kết quả tìm được (mock):", items: all() }),
  );
  server.registerTool(
    "fetch",
    { description: "Fetch one or more WorkIQ entities by path", inputSchema: { paths: z.array(z.string()) }, annotations: readOnly },
    async ({ paths }) => json(paths.map((p) => entities[p] ?? { path: p, error: "not found" })),
  );
  server.registerTool(
    "search_paths",
    { description: "Search available WorkIQ entity paths", inputSchema: { query: z.string() }, annotations: readOnly },
    async () => json({ paths: ["/me/messages", "/me/chats/messages", ...Object.keys(entities)] }),
  );
  server.registerTool(
    "get_schema",
    { description: "Get the request/response schema for a WorkIQ path", inputSchema: { path: z.string(), operation: z.string().optional() }, annotations: readOnly },
    async ({ path: p }) => json({ path: p, fields: ["id", "from", "subject", "receivedAt", "body", "webLink"] }),
  );
  server.registerTool(
    "do_action",
    { description: "Run a WorkIQ action, including write operations", inputSchema: { path: z.string(), action: z.string(), body: z.unknown().optional() } },
    async () => json({ error: NEVER }),
  );
  server.registerTool(
    "accept_eula",
    { description: "Accept the End User License Agreement (EULA) to enable WorkIQ tools", inputSchema: {} },
    async () => json({ error: NEVER }),
  );
} else if (kind === "ado") {
  const data = load("ado");
  type WorkItem = { id: number };
  const byId = (id: number) => data.workItems.find((w: WorkItem) => w.id === id);
  // Real ADO tools are grouped, with an `action` parameter. ponytail: action enums guessed from descriptions.
  server.registerTool(
    "wit_query",
    {
      description: "Read operations on work item queries. Use 'action': 'get', 'get_results'",
      inputSchema: { action: z.enum(["get", "get_results"]), project: z.string().optional(), query: z.string().optional(), id: z.string().optional() },
      annotations: readOnly,
    },
    async ({ action }) => json(action === "get" ? data.queries[0] : { workItems: data.workItems }),
  );
  server.registerTool(
    "wit_work_item",
    {
      description: "Read operations on work items. Use 'action': 'get', 'get_batch'",
      inputSchema: { action: z.enum(["get", "get_batch"]), id: z.number().optional(), ids: z.array(z.number()).optional() },
      annotations: readOnly,
    },
    async ({ action, id, ids }) =>
      action === "get" ? (byId(id ?? -1) ? json(byId(id!)) : fail(`Work item ${id} not found`)) : json((ids ?? []).map(byId).filter(Boolean)),
  );
  server.registerTool(
    "wit_backlog",
    {
      description: "Read operations on backlogs. Use 'action': 'list', 'list_work_items'",
      inputSchema: { action: z.enum(["list", "list_work_items"]), project: z.string(), team: z.string() },
      annotations: readOnly,
    },
    async ({ action }) => json(action === "list" ? data.backlogs : data.workItems),
  );
  server.registerTool(
    "work",
    { description: "Read operations on iterations. Use 'action': 'list_iterations'", inputSchema: { action: z.enum(["list_iterations"]), project: z.string() }, annotations: readOnly },
    async () => json(data.iterations),
  );
  server.registerTool(
    "search_workitem",
    { description: "Get Work Item search results for a given search text", inputSchema: { searchText: z.string() }, annotations: readOnly },
    async ({ searchText }) => json(data.workItems.filter((w: { title: string }) => w.title.toLowerCase().includes(searchText.toLowerCase()))),
  );
  server.registerTool(
    "core_list_projects",
    { description: "Retrieve a list of projects in your organization", inputSchema: {}, annotations: readOnly },
    async () => json(data.projects),
  );
  server.registerTool(
    "core_list_project_teams",
    { description: "Retrieve a list of teams for a project", inputSchema: { project: z.string() }, annotations: readOnly },
    async () => json(data.teams),
  );
  server.registerTool(
    "wit_add_work_item_comment",
    { description: "Add a comment to a work item", inputSchema: { id: z.number(), comment: z.string() } },
    async () => json({ error: NEVER }),
  );
} else if (kind === "azure") {
  const data = load("azure");
  server.registerTool(
    "monitor_alerts_list",
    { description: "List active Azure Monitor alerts", inputSchema: {}, annotations: readOnly },
    async () => json(data.alerts),
  );
  server.registerTool(
    "monitor_logs_query",
    { description: "Run a KQL query on Log Analytics", inputSchema: { query: z.string() }, annotations: readOnly },
    async () => json(data.logs),
  );
  server.registerTool(
    "monitor_alert_dismiss",
    { description: "Dismiss an alert", inputSchema: { id: z.string() } },
    async () => json({ error: NEVER }),
  );
} else {
  console.error("Usage: server.ts workiq|ado|azure");
  process.exit(1);
}

await server.connect(new StdioServerTransport());
