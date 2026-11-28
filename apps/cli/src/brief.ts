/**
 * pnpm brief  — morning brief ("check việc").
 * Runs the 4 reader agents in parallel, writes reports/brief-YYYY-MM-DD.html.
 * Read-only: the gate denies every write tool.
 */
import { readerAgents } from "@agenthub/core/agents";
import { loadConfig } from "@agenthub/core/config";
import type { HubEvent } from "@agenthub/core/events";
import { isBlocking, saveReport } from "@agenthub/core/report";
import { DENIED_PREFIX } from "@agenthub/core/security";
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
const unusable = new Set<string>();

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
    case "tool.completed": {
      const agent = callAgent.get(ev.callId) ?? "?";
      // A denied call already printed its ⛔ line.
      if (ev.error && !ev.error.startsWith(DENIED_PREFIX)) console.log(`    ✗ ${agent}: ${ev.error}`);
      if (ev.error && isBlocking(ev.error)) unusable.add(agent);
      break;
    }
    case "agent.completed": {
      const time = ev.durationMs ? ` (${(ev.durationMs / 1000).toFixed(1)}s)` : "";
      // The agent ended, but a blocking tool error means its source gave no data (the report lists it as failed).
      console.log(unusable.has(ev.agent) ? `  ⚠ ${ev.agent}${time}: không lấy được dữ liệu (xem báo cáo)` : `  ✓ ${ev.agent}${time}`);
      break;
    }
    case "agent.failed":
      unusable.add(ev.agent);
      console.log(`  ✗ ${ev.agent}: ${ev.error}`);
      break;
    case "message":
      if (ev.text.startsWith("Bị chặn")) console.log(`    ⛔ ${ev.agent}: ${ev.text}`);
      break;
  }
}
await runtime.stop();

// Items from an agent that later failed (e.g. schema error) are already excluded by the runtime.
const { report, file } = saveReport(cfg, events, Date.now() - t0);
console.log(`\n${report.items.length} mục, ${Object.keys(report.failures).length} lỗi, ${report.warnings?.length ?? 0} cảnh báo → ${file}`);
