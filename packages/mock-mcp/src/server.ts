/**
 * Fake MCP servers (stdio) backed by fixtures/data/*.json. Synthetic data only.
 *   node --import tsx packages/mock-mcp/src/server.ts workiq|ado|azure
 * Tool names follow docs/mcp-tools.md (real names from Step 0 at Work).
 * ponytail: input schemas are partly guessed (SDK does not expose real ones); real params come from the `args`
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
    // Real param (Work, 2026-11-25): `entityUrls`, relative Graph-style paths.
    { description: "Fetch one or more WorkIQ entities by path", inputSchema: { entityUrls: z.array(z.string()) }, annotations: readOnly },
    async ({ entityUrls }) => json(entityUrls.map((p) => entities[p] ?? { path: p, error: "not found" })),
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
  // Real ADO tools are grouped, with an `action` parameter. `wiql`, `get_batch`, `list_revisions`, `list_comments`, `my` and
  // their params were seen at Work (2026-11-25); `get`/`get_results` are from the descriptions.
  server.registerTool(
    "wit_query",
    {
      description: "Read operations on work item queries. Use 'action': 'get', 'get_results', 'wiql'",
      inputSchema: {
        action: z.enum(["get", "get_results", "wiql"]),
        project: z.string().optional(),
        query: z.string().optional(),
        id: z.string().optional(),
        wiql: z.string().optional(),
        top: z.number().optional(),
      },
      annotations: readOnly,
    },
    async ({ action, wiql = "" }) => {
      if (action === "get") return json(data.queries[0]);
      // WIQL has no subqueries; this is the real error text.
      if (/\(\s*SELECT/i.test(wiql)) return fail("Expecting constant value. The error is caused by «SELECT».");
      return json({ workItems: data.workItems });
    },
  );
  server.registerTool(
    "wit_work_item",
    {
      description: "Read operations on work items. Use 'action': 'get', 'get_batch', 'list_revisions', 'list_comments', 'my'",
      inputSchema: {
        action: z.enum(["get", "get_batch", "list_revisions", "list_comments", "my"]),
        project: z.string().optional(),
        id: z.number().optional(),
        ids: z.array(z.number()).optional(),
        fields: z.array(z.string()).optional(),
        workItemId: z.number().optional(),
        type: z.string().optional(),
        top: z.number().optional(),
        skip: z.number().optional(),
        expand: z.string().optional(),
      },
      annotations: readOnly,
    },
    async ({ action, id, ids, workItemId }) => {
      if (action === "get_batch") return json((ids ?? []).map(byId).filter(Boolean));
      if (action === "my") return json(data.workItems);
      const w = byId((action === "get" ? id : workItemId) ?? -1);
      if (!w) return fail(`Work item ${id ?? workItemId} not found`);
      if (action === "list_comments") return json(data.comments.filter((c: { workItemId: number }) => c.workItemId === w.id));
      return json(action === "get" ? w : [{ rev: 2, changedBy: w.changedBy, changedDate: w.changedDate, change: w.change }]);
    },
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
  // Real server (`--namespace monitor --read-only`) has one `monitor` tool that dispatches sub-commands
  // (`learn: true` lists them) plus subscription/group tools. Only a few sub-commands are mocked.
  // The real `monitor` has no readOnlyHint; the mock sets it because the real server runs read-only.
  // ponytail: optional params are the ones the model used at Work; the real list may be longer.
  type Params = Record<string, unknown>;
  const commands: Record<string, { required: string[]; optional: string[]; run: (p: Params) => unknown }> = {
    monitor_workspace_list: { required: [], optional: [], run: () => data.workspaces },
    monitor_table_list: { required: ["resource-group", "workspace"], optional: ["table-type"], run: () => data.tables },
    monitor_workspace_log_query: {
      required: ["workspace", "query", "table"],
      optional: ["hours", "limit"],
      run: (p) => {
        // ponytail: "valid KQL" = starts with a known table name and does not name a column `last`.
        const query = String(p.query);
        const table = query.trim().split(/[\s|]/)[0];
        if (!data.tables.includes(table)) {
          throw new Error(`{"status":400,"message":"Failed to resolve table or column expression named '${table}'"} ErrorCode: BadArgumentError`);
        }
        if (/(^|[\s,(])last\s*=/.test(query)) {
          throw new Error(
            `{"status":400,"message":"The request had some invalid properties\r\nStatus: 400 (Bad Request)\r\nErrorCode: BadArgumentError` +
              `\r\nInner: SyntaxError SYN0002 Query could not be parsed at 'last'"}`,
          );
        }
        return data.logs;
      },
    },
    monitor_activitylog_list: { required: ["resource-name"], optional: ["resource-group", "resource-type", "hours", "top"], run: () => data.activityLog },
  };
  const COMMON = ["subscription", "tenant"];
  server.registerTool(
    "monitor",
    {
      description: "Azure Monitor operations. Run with learn=true to list commands, then call with command and parameters.",
      inputSchema: {
        intent: z.string(),
        command: z.string().optional(),
        parameters: z.record(z.string(), z.unknown()).optional(),
        learn: z.boolean().optional(),
      },
      annotations: readOnly,
    },
    async ({ command, parameters = {}, learn }) => {
      if (learn || !command) return json(Object.entries(commands).map(([c, { required }]) => ({ command: c, required })));
      const cmd = commands[command];
      if (!cmd) return fail(`The command '${command}' is not available for the 'monitor' tool.`);
      const known = [...COMMON, ...cmd.required, ...cmd.optional];
      const unknown = Object.keys(parameters).filter((p) => !known.includes(p));
      if (unknown.length) return fail(`Request rejected due to unknown arguments: ${unknown.join(", ")}`);
      const missing = cmd.required.filter((p) => parameters[p] === undefined);
      if (missing.length) return fail(`Missing Required options: ${missing.map((p) => `--${p}`).join(", ")}`);
      // Real cause at Work: the server's identity could not see the workspace (403 one run, 404 the next).
      // ponytail: message tails after "\r\nSt..." / "please ref..." were truncated in the feedback; reconstructed.
      const denied = data.inaccessibleWorkspaces.find((w: { name: string }) => w.name === parameters.workspace);
      if (denied?.status === 403) {
        return fail(`{"status":403,"message":"The provided credentials have insufficient access to perform the requested operation\r\nStatus: 403 (Forbidden)\r\nErrorCode: InsufficientAccessError"}`);
      }
      if (denied?.status === 404) {
        return fail(`{"status":404,"message":"Could not find workspace with name ${denied.name}. To mitigate this issue, please refer to the troubleshooting guide."}`);
      }
      try {
        return json(cmd.run(parameters));
      } catch (e) {
        return fail((e as Error).message);
      }
    },
  );
  server.registerTool(
    "subscription_list",
    { description: "List all Azure subscriptions for the current account.", inputSchema: { tenant: z.string().optional() }, annotations: readOnly },
    async () => json(data.subscriptions),
  );
  server.registerTool(
    "group_list",
    {
      description: "List all resource groups in a subscription.",
      inputSchema: { subscription: z.string().optional(), tenant: z.string().optional() },
      annotations: readOnly,
    },
    async () => json(data.resourceGroups),
  );
  server.registerTool(
    "group_resource_list",
    {
      description: "List all resources in a resource group.",
      inputSchema: { "resource-group": z.string(), subscription: z.string().optional(), tenant: z.string().optional() },
      annotations: readOnly,
    },
    async (args) => json(data.resources.filter((r: { resourceGroup: string }) => r.resourceGroup === args["resource-group"])),
  );
  // Synthetic write tool (the real server hides writes with --read-only).
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
