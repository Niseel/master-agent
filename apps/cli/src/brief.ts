/**
 * pnpm brief  — morning brief ("check việc").
 * Runs the 4 reader agents in parallel, writes reports/brief-YYYY-MM-DD.html.
 * Read-only: any approval request is rejected automatically.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readerAgents } from "@agenthub/core/agents";
import type { BriefItem } from "@agenthub/core/brief";
import { loadConfig } from "@agenthub/core/config";
import { renderReport } from "@agenthub/core/report";
import { createRuntime } from "@agenthub/core/runtime/index";

try {
  process.loadEnvFile();
} catch {} // .env is optional

const cfg = await loadConfig();
const agents = readerAgents(cfg);
const runtime = await createRuntime(cfg);
const t0 = Date.now();
const items: BriefItem[] = [];
const failures: Record<string, string> = {};
const usedBy: Record<string, number> = {};
let usedTotal = 0;

console.log(`▶ check việc — runtime=${cfg.runtime}, budget=${cfg.maxAiCredits} credits, ${agents.length} agent`);
process.on("SIGINT", () => void runtime.stop().then(() => process.exit(130)));

for await (const ev of runtime.run({ prompt: process.argv.slice(2).join(" ") || "check việc", agents, budget: cfg.maxAiCredits })) {
  switch (ev.type) {
    case "agent.started":
      console.log(`  … ${ev.agent}`);
      break;
    case "tool.started":
      console.log(`    ↳ ${ev.agent} → ${ev.server}/${ev.tool}`);
      break;
    case "agent.result":
      items.push(...ev.items);
      break;
    case "agent.completed":
      if (!failures[ev.agent]) console.log(`  ✓ ${ev.agent}${ev.durationMs ? ` (${(ev.durationMs / 1000).toFixed(1)}s)` : ""}`);
      break;
    case "agent.failed":
      failures[ev.agent] = ev.error;
      console.log(`  ✗ ${ev.agent}: ${ev.error}`);
      break;
    case "approval.requested":
      console.log(`  ⛔ ${ev.agent} xin gọi ${ev.tool} — tự từ chối (brief chỉ-đọc)`);
      runtime.resolveApproval(ev.id, "reject", "Brief là chế độ chỉ-đọc");
      break;
    case "usage":
      if (ev.agent) usedBy[ev.agent] = ev.usedAiCredits;
      else usedTotal = ev.usedAiCredits;
      break;
    case "message":
      if (ev.text.startsWith("Bị chặn")) console.log(`    ⛔ ${ev.agent}: ${ev.text}`);
      break;
  }
}
await runtime.stop();

// Items from an agent that later failed (e.g. schema error) are already excluded by the runtime.
const date = new Date().toISOString().slice(0, 10);
const html = renderReport({
  date,
  runtime: cfg.runtime,
  items,
  failures,
  usedAiCredits: Math.max(usedTotal, Object.values(usedBy).reduce((a, b) => a + b, 0)),
  maxAiCredits: cfg.maxAiCredits,
  durationMs: Date.now() - t0,
});
const out = path.join(cfg.root, "reports", `brief-${date}.html`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`\n${items.length} mục, ${Object.keys(failures).length} lỗi → ${out}`);
