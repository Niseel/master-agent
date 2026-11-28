/**
 * "Lấy danh sách tool" of one gate, for the user to tick read tools (milestone-1 §4). No prompt is sent: no AI Credits.
 * Runtime mock: the built-in gates' mock servers only (no real service is contacted). Otherwise: the Copilot SDK
 * connects the server (Entra sign-in through mcpAuth, like `pnpm list-tools`) and lists its tools.
 */
import type { MCPServerConfig } from "@github/copilot-sdk";
import type { HubConfig } from "./config.ts";
import { looksLikeWrite } from "./security.ts";

export interface ToolInfo {
  name: string;
  description: string;
  /** Looks like a write by its name: locked, never tickable. */
  write: boolean;
}

const info = (tools: { name: string; description?: string }[]): ToolInfo[] =>
  tools.map((t) => ({ name: t.name, description: (t.description ?? "").split(/\r?\n/)[0].slice(0, 200), write: looksLikeWrite(t.name) })).sort((a, b) => a.name.localeCompare(b.name));

export async function listGateTools(cfg: HubConfig, key: string, server: MCPServerConfig, mockPreset?: string): Promise<ToolInfo[]> {
  if (cfg.runtime === "mock") {
    if (!mockPreset) throw new Error("Runtime mock không kết nối cổng thật: chạy với AGENTHUB_RUNTIME=copilot để lấy tool của cổng này");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
    const s = server as { command: string; args?: string[]; cwd?: string };
    const client = new Client({ name: "agent-hub", version: "0" });
    await client.connect(new StdioClientTransport({ command: s.command, args: s.args ?? [], cwd: cfg.root }));
    try {
      return info((await client.listTools()).tools);
    } finally {
      await client.close();
    }
  }
  const { CopilotClient } = await import("@github/copilot-sdk");
  const { mcpAuth, waitForMcp } = await import("./runtime/sdk.ts");
  const client = new CopilotClient();
  await client.start();
  try {
    const session = await client.createSession({
      clientName: "agent-hub",
      mcpServers: { [key]: server },
      availableTools: [],
      includedBuiltinAgents: [],
      skipCustomInstructions: true,
      onPermissionRequest: () => ({ kind: "reject", feedback: "Chỉ lấy danh sách tool" }),
      onMcpAuthRequest: mcpAuth,
    });
    try {
      await waitForMcp(session, [key], 90_000, 2000);
      const st = (await session.rpc.mcp.list()).servers.find((x) => x.name === key);
      if (st?.status !== "connected") throw new Error(`Cổng ${key}: ${st?.status ?? "không thấy"}${st?.error ? ` — ${st.error}` : ""}`);
      return info((await session.rpc.mcp.listTools({ serverName: key })).tools);
    } finally {
      await session.disconnect().catch(() => {});
    }
  } finally {
    await client.stop();
  }
}
