/**
 * Step 0 helper: connect every agent's MCP servers through the Copilot SDK and write the
 * real tool names to docs/mcp-tools.md (structure only, no data).
 *   AGENTHUB_RUNTIME=copilot pnpm list-tools
 * No prompt is sent, so this uses no AI Credits.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { CopilotClient } from "@github/copilot-sdk";
import { readerAgents } from "../packages/core/src/agents.ts";
import { loadConfig } from "../packages/core/src/config.ts";
import { looksLikeWrite } from "../packages/core/src/security.ts";

try {
  process.loadEnvFile();
} catch {}

const cfg = await loadConfig();
if (cfg.runtime === "mock") throw new Error("Đặt AGENTHUB_RUNTIME=copilot (hoặc byok) để liệt kê tool thật");
const agents = readerAgents(cfg).filter((a) => !a.missingConfig);
const servers = Object.assign({}, ...agents.map((a) => a.mcpServers));

const client = new CopilotClient();
await client.start();
const session = await client.createSession({
  mcpServers: servers,
  availableTools: ["mcp:*"],
  skipCustomInstructions: true,
  onPermissionRequest: () => ({ kind: "reject", feedback: "list-tools không gọi tool" }),
});

// Wait until no server is still pending (max 90s).
let list = await session.rpc.mcp.list();
for (let i = 0; i < 45 && list.servers.some((s) => s.name in servers && s.status === "pending"); i++) {
  await sleep(2000);
  list = await session.rpc.mcp.list();
}

const lines = [
  "# MCP tools",
  "",
  `> Sinh bởi \`pnpm list-tools\` lúc ${new Date().toISOString()} (runtime=${cfg.runtime}). Chỉ thông tin cấu trúc.`,
  "> Cột **Loại** là đoán theo tên — hãy sửa tay `read`/`write` rồi chép tên `read` vào `readTools` trong `packages/core/src/agents.ts`.",
  "",
];
for (const a of agents) {
  for (const key of Object.keys(a.mcpServers)) {
    const st = list.servers.find((s) => s.name === key);
    lines.push(`## ${key} (agent: ${a.name}) — status: ${st?.status ?? "không thấy"}${st?.error ? ` — lỗi: ${st.error}` : ""}`, "");
    if (st?.status !== "connected") {
      lines.push("_Không lấy được danh sách tool._", "");
      continue;
    }
    const { tools } = await session.rpc.mcp.listTools({ serverName: key });
    lines.push("| Runtime name | Loại (đoán) | Mô tả |", "|---|---|---|");
    for (const t of tools) {
      const desc = (t.description ?? "").split("\n")[0].replaceAll("|", "\\|").slice(0, 120);
      lines.push(`| \`${key}-${t.name}\` | ${looksLikeWrite(t.name) ? "write" : "read"} | ${desc} |`);
    }
    lines.push("");
  }
}

const out = path.join(cfg.root, "docs/mcp-tools.md");
writeFileSync(out, lines.join("\n"));
console.log(`Đã ghi ${out}`);
console.log(list.servers.map((s) => `  ${s.name}: ${s.status}${s.error ? ` (${s.error})` : ""}`).join("\n"));
await session.disconnect();
await client.stop();
