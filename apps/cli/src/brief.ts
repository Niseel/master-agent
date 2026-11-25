/**
 * pnpm brief  — morning brief ("check việc").
 * Runs the 4 reader agents in parallel, writes reports/brief-YYYY-MM-DD.html.
 * Read-only: any approval request is rejected automatically.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readerAgents } from "@agenthub/core/agents";
import { loadConfig } from "@agenthub/core/config";
import type { HubEvent } from "@agenthub/core/events";
import { renderReport, summarize } from "@agenthub/core/report";
import { createRuntime } from "@agenthub/core/runtime/index";

try {
  process.loadEnvFile();
} catch {} // .env is optional

const cfg = await loadConfig();
const agents = readerAgents(cfg);
const runtime = await createRuntime(cfg);
const t0 = Date.now();
const events: HubEvent[] = [];
const callAgent = new Map<string, string>();

console.log(`▶ check việc — runtime=${cfg.runtime}, budget=${cfg.maxAiCredits} credits, ${agents.length} agent`);
process.on("SIGINT", () => void runtime.stop().then(() => process.exit(130)));

// Console progress only; the report is built from `events` by summarize().
for await (const ev of runtime.run({ prompt: process.argv.slice(2).join(" ") || "check việc", agents, budget: cfg.maxAiCredits })) {
  events.push(ev);
  switch (ev.type) {
    case "agent.started":
      console.log(`  … ${ev.agent}`);
      break;
    case "tool.started":
      console.log(`    ↳ ${ev.agent} → ${ev.server}/${ev.tool}`);
      callAgent.set(ev.callId, ev.agent);
      break;
    case "tool.completed":
      if (ev.error) console.log(`    ✗ ${callAgent.get(ev.callId) ?? "?"}: ${ev.error}`);
      break;
    case "agent.completed":
      console.log(`  ✓ ${ev.agent}${ev.durationMs ? ` (${(ev.durationMs / 1000).toFixed(1)}s)` : ""}`);
      break;
    case "agent.failed":
      console.log(`  ✗ ${ev.agent}: ${ev.error}`);
      break;
    case "approval.requested":
      console.log(`  ⛔ ${ev.agent} xin gọi ${ev.tool} — tự từ chối (brief chỉ-đọc)`);
      runtime.resolveApproval(ev.id, "reject", "Brief là chế độ chỉ-đọc");
      break;
    case "message":
      if (ev.text.startsWith("Bị chặn")) console.log(`    ⛔ ${ev.agent}: ${ev.text}`);
      break;
  }
}
await runtime.stop();

// Items from an agent that later failed (e.g. schema error) are already excluded by the runtime.
const { items, failures, warnings, blocked, usedAiCredits } = summarize(events);
const date = new Date().toISOString().slice(0, 10);
const html = renderReport({
  date,
  runtime: cfg.runtime,
  items,
  failures,
  warnings,
  blocked,
  usedAiCredits,
  maxAiCredits: cfg.maxAiCredits,
  durationMs: Date.now() - t0,
});
const out = path.join(cfg.root, "reports", `brief-${date}.html`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`\n${items.length} mục, ${Object.keys(failures).length} lỗi, ${warnings?.length ?? 0} cảnh báo → ${out}`);
