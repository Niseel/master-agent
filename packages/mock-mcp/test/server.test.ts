import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readerAgents } from "../../core/src/agents.ts";
import { loadConfig } from "../../core/src/config.ts";
import { decide } from "../../core/src/security.ts";

const root = path.resolve(import.meta.dirname, "../../..");

async function connect(key: string) {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", path.join(root, "packages/mock-mcp/src/server.ts"), key],
      cwd: root,
    }),
  );
  return client;
}

/** Call a tool, return [isError, text]. */
async function call(client: Client, name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return [Boolean(r.isError), r.content[0].text] as const;
}

// Mock servers must mirror the real tool names: every allowlisted tool exists, every write tool is denied.
for (const [agentName, key] of [["comms-reader", "workiq"], ["board-reader", "ado"], ["cloud-reader", "azure"]] as const) {
  test(`mock ${key}: allowlist matches tools, write tools denied`, async () => {
    const cfg = { ...(await loadConfig(root)), runtime: "mock" as const };
    const agent = readerAgents(cfg).find((a) => a.name === agentName)!;
    const client = await connect(key);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => `${key}-${t.name}`);
      if (agent.readTools !== "*") for (const t of agent.readTools) assert.ok(names.includes(t), `${t} missing in mock`);
      for (const t of tools) {
        if (!t.annotations?.readOnlyHint) assert.equal(decide(agent, `${key}-${t.name}`).decision, "deny", t.name);
      }
      // Read tools answer with fixture data.
      const first = tools.find((t) => t.annotations?.readOnlyHint && !t.inputSchema.required?.length)
        ?? tools.find((t) => t.name === "retrieve" || t.name === "wit_query")!;
      const args = first.name === "retrieve" ? { query: "x" } : first.name === "wit_query" ? { action: "get_results" } : {};
      const r = await client.callTool({ name: first.name, arguments: args });
      assert.ok(!r.isError, first.name);
    } finally {
      await client.close();
    }
  });
}

// Error texts copied from the real servers (docs/work-feedback.md, 2026-11-25).
test("mock errors match real servers", async () => {
  const ado = await connect("ado");
  const azure = await connect("azure");
  const workiq = await connect("workiq");
  try {
    const sub = await call(ado, "wit_query", { action: "wiql", project: "p", wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.Id] IN (SELECT [System.Id] FROM WorkItems)" });
    assert.deepEqual(sub, [true, "Expecting constant value. The error is caused by «SELECT»."]);
    assert.equal((await call(ado, "wit_query", { action: "wiql", project: "p", wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.Id] IN (@Follows)" }))[0], false);

    const monitor = (command: string, parameters: Record<string, unknown>) => call(azure, "monitor", { intent: "t", command, parameters });
    const q = { workspace: "law-orders", table: "AppExceptions", query: "AppExceptions | take 5" };
    assert.deepEqual(await monitor("monitor_workspace_log_query", { ...q, "resource-group": "rg" }), [true, "Request rejected due to unknown arguments: resource-group"]);
    assert.match((await monitor("monitor_workspace_log_query", { ...q, query: "Nope | take 5" }))[1], /BadArgumentError/);
    assert.equal((await monitor("monitor_workspace_log_query", { ...q, hours: 24 }))[0], false);
    assert.equal((await monitor("monitor_table_list", { "resource-group": "rg-orders", workspace: "law-orders" }))[0], false);
    assert.deepEqual(await monitor("monitor_activitylog_list", { "resource-group": "rg-orders" }), [true, "Missing Required options: --resource-name"]);
    assert.match((await call(azure, "monitor", { intent: "t", command: "workspace_list" }))[1], /is not available for the 'monitor' tool/);

    const [err, text] = await call(workiq, "fetch", { entityUrls: ["/me/messages/m1"] });
    assert.ok(!err && text.includes("[Prod]"));
  } finally {
    await Promise.all([ado.close(), azure.close(), workiq.close()]);
  }
});
