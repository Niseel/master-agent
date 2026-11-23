/**
 * Fake MCP servers (stdio) backed by fixtures/data/*.json. Synthetic data only.
 *   node --import tsx packages/mock-mcp/src/server.ts workiq|azure
 * ponytail: tool names are placeholders until docs/mcp-tools.md has the real ones from Step 0.
 * Each server also exposes one WRITE tool, so tests can prove reader agents are blocked from it.
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
const readOnly = { readOnlyHint: true };

const kind = process.argv[2];
const server = new McpServer({ name: `mock-${kind}`, version: "0.1.0" });

if (kind === "workiq") {
  const data = load("workiq");
  server.registerTool(
    "mail_list_unread",
    { description: "List unread Outlook mail", inputSchema: { hours: z.number().optional() }, annotations: readOnly },
    async () => json(data.mail),
  );
  server.registerTool(
    "teams_list_unread",
    { description: "List unread Teams messages", inputSchema: { hours: z.number().optional() }, annotations: readOnly },
    async () => json(data.teams),
  );
  server.registerTool(
    "mail_send",
    { description: "Send an email", inputSchema: { to: z.string(), subject: z.string(), body: z.string() } },
    async () => json({ error: "mock: mail_send must never be reached by a reader agent" }),
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
    async () => json({ error: "mock: write tool must never be reached by a reader agent" }),
  );
} else {
  console.error("Usage: server.ts workiq|azure");
  process.exit(1);
}

await server.connect(new StdioServerTransport());
