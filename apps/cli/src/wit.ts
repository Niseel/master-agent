/**
 * pnpm wit <id> — read every field of one ADO work item (wit-reader).
 * The runtime calls `wit_work_item` itself (no model turn, no AI Credits); only if that fails does the model read it.
 * Prints to this terminal only: never paste the output into the repo (company data).
 */
import { loadConfig } from "@agenthub/core/config";
import type { HubEvent } from "@agenthub/core/events";
import { createRuntime } from "@agenthub/core/runtime/index";
import { witReader } from "@agenthub/core/wit";

try {
  process.loadEnvFile();
} catch {} // .env is optional

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
  console.error("Cách dùng: pnpm wit <số work item>");
  process.exit(2);
}
const cfg = await loadConfig();
const agent = witReader(cfg, id);
if (agent.missingConfig) {
  console.error(`✗ ${agent.missingConfig}`);
  process.exit(1);
}
const runtime = await createRuntime(cfg);
const events: HubEvent[] = [];
for await (const ev of runtime.run({ prompt: "", agents: [agent], budget: 30, scenario: "wit-reader" })) {
  events.push(ev);
  if (ev.type === "message") console.log(`  ${ev.text}`);
  if (ev.type === "tool.completed" && ev.error) console.log(`  ✗ ${ev.error}`);
  if (ev.type === "agent.failed") console.log(`  ✗ ${ev.error}`);
}
await runtime.stop();

const credits = events.reduce((sum, e) => (e.type === "usage" ? Math.max(sum, e.usedAiCredits) : sum), 0);
const item = events.find((e) => e.type === "workitem.result")?.item;
console.log(`runtime=${cfg.runtime}, AI Credits: ${credits.toFixed(2)}`);
if (!item) process.exit(1);
for (const [k, v] of Object.entries(item)) {
  const shown = Array.isArray(v) ? (v.length ? `\n    - ${v.join("\n    - ")}` : "[]") : String(v ?? "–").replaceAll("\n", "\n    ");
  console.log(`  ${k}: ${shown}`);
}
