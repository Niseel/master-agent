import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readerAgents } from "../../core/src/agents.ts";
import { loadConfig } from "../../core/src/config.ts";
import { decide } from "../../core/src/security.ts";

const root = path.resolve(import.meta.dirname, "../../..");

// Mock servers must mirror the real tool names: every allowlisted tool exists, every write tool is denied.
for (const [agentName, key] of [["comms-reader", "workiq"], ["board-reader", "ado"], ["cloud-reader", "azure"]] as const) {
  test(`mock ${key}: allowlist matches tools, write tools denied`, async () => {
    const cfg = { ...(await loadConfig(root)), runtime: "mock" as const };
    const agent = readerAgents(cfg).find((a) => a.name === agentName)!;
    const client = new Client({ name: "test", version: "0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", path.join(root, "packages/mock-mcp/src/server.ts"), key],
        cwd: root,
      }),
    );
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
