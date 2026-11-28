/**
 * Step 0 smoke test: one SDK session, one agent's MCP server, every raw SDK event printed.
 *   AGENTHUB_RUNTIME=copilot pnpm smoke                # comms-reader (Work IQ)
 *   AGENTHUB_RUNTIME=copilot pnpm smoke code-reader    # GitHub MCP
 *   AGENTHUB_RUNTIME=byok pnpm smoke cloud-reader      # mock Azure MCP at Home
 *   AGENTHUB_RUNTIME=copilot pnpm smoke code-reader --tools   # only list the tools the model sees, no prompt, no credits
 * Uses the real approval gate (no approveAll). Copy only event TYPES/shapes to docs, never data.
 */
import { CopilotClient } from "@github/copilot-sdk";
import { readerAgents } from "../packages/core/src/agents.ts";
import { loadConfig } from "../packages/core/src/config.ts";
import { MIN_SESSION_CREDITS, mcpAuth, sessionTools, waitForMcp } from "../packages/core/src/runtime/sdk.ts";
import { decide } from "../packages/core/src/security.ts";

try {
  process.loadEnvFile();
} catch {}

const cfg = await loadConfig();
if (cfg.runtime === "mock") throw new Error("Đặt AGENTHUB_RUNTIME=copilot (hoặc byok)");
const name = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "comms-reader";
const agent = readerAgents(cfg).find((a) => a.name === name);
if (!agent) throw new Error(`Không có agent ${name}`);
if (agent.missingConfig) throw new Error(agent.missingConfig);

const client = new CopilotClient();
await client.start();
console.log("auth:", JSON.stringify(await client.getAuthStatus()));

const session = await client.createSession({
  model: cfg.model ?? undefined,
  provider:
    cfg.runtime === "byok" && cfg.byok.apiKey
      ? { type: "anthropic", baseUrl: cfg.byok.baseUrl, apiKey: cfg.byok.apiKey }
      : undefined,
  systemMessage: { mode: "append", content: agent.prompt },
  mcpServers: agent.mcpServers,
  availableTools: sessionTools(agent),
  includedBuiltinAgents: [],
  skipCustomInstructions: true,
  sessionLimits: { maxAiCredits: MIN_SESSION_CREDITS },
  hooks: {
    onPreToolUse: ({ toolName }) => {
      const { decision, reason } = decide(agent, toolName);
      console.log(`[gate] ${toolName} → ${decision} (${reason})`);
      return { permissionDecision: decision, permissionDecisionReason: reason };
    },
  },
  onPermissionRequest: (req) => {
    if (req.kind !== "mcp") return { kind: "reject", feedback: "chỉ MCP" };
    const { decision, reason } = decide(agent, `${req.serverName}-${req.toolName}`);
    return decision === "allow" ? { kind: "approve-once" } : { kind: "reject", feedback: reason };
  },
  onMcpAuthRequest: mcpAuth,
});

session.on((ev) => {
  if (ev.type.endsWith("_delta")) return;
  console.log(`[${ev.type}]`, JSON.stringify(ev.data).slice(0, 300));
});

await waitForMcp(session, Object.keys(agent.mcpServers));
if (process.argv.includes("--tools")) {
  await session.rpc.tools.initializeAndValidate();
  const { tools } = await session.rpc.tools.getCurrentMetadata();
  const names = (tools ?? []).map((t) => (t.mcpServerName ? `${t.mcpServerName}-${t.mcpToolName}` : t.name));
  console.log(`\n=== tools model thấy (${names.length}) ===\n${names.join("\n")}`);
  const extra = names.filter((n) => decide(agent, n).decision !== "allow");
  console.log(extra.length ? `NGOÀI allowlist: ${extra.join(", ")}` : "Tất cả trong allowlist.");
  await session.disconnect();
  await client.stop();
  process.exit(extra.length ? 1 : 0);
}
const reply = await session.sendAndWait(
  { prompt: "Liệt kê tên các tool bạn có, rồi gọi thử MỘT tool đọc và tóm tắt kết quả trong 3 dòng." },
  180_000,
);
console.log("\n=== reply ===\n" + (reply?.data.content ?? "(trống)"));
await session.disconnect();
await client.stop();
