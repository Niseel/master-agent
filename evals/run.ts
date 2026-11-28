/**
 * pnpm eval [--drafts] [--task <id>] — run check việc on every verified Task and score it with deepeval (milestone-1 §7).
 *
 * Each Task's synthetic data is served by packages/mock-mcp (AGENTHUB_FIXTURE_DIR); the agents run for real through
 * the Copilot SDK ("byok" runtime: the logged-in Copilot, or ANTHROPIC_API_KEY), so this costs model tokens / AI
 * Credits. Model under test: AGENTHUB_MODEL (default: Copilot's). Judge: AGENTHUB_JUDGE (evals/judge.ts).
 * Scores (no source data) go to evals/results/<time>.json. Exit 1 when a verified Task misses a threshold.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// Before deepeval loads: it reads these at import time.
process.env.DEEPEVAL_TELEMETRY_OPT_OUT ??= "1";
process.env.DEEPEVAL_CACHE_FOLDER ??= path.join(root, "reports", ".deepeval");
try {
  process.loadEnvFile();
} catch {}

const { evaluate, LLMTestCase } = await import("deepeval");
const { mockServer, readerAgents } = await import("../packages/core/src/agents.ts");
const { refOf } = await import("../packages/core/src/brief.ts");
const { loadConfig } = await import("../packages/core/src/config.ts");
const { summarize } = await import("../packages/core/src/report.ts");
const { createRuntime } = await import("../packages/core/src/runtime/index.ts");
const { judgeFrom } = await import("./judge.ts");
const { m1Metrics, THRESHOLDS } = await import("./metrics.ts");
const { loadTasks } = await import("./task.ts");
type HubEvent = import("../packages/core/src/events.ts").HubEvent;

const argv = process.argv.slice(2);
const drafts = argv.includes("--drafts");
const only = argv.includes("--task") ? argv[argv.indexOf("--task") + 1] : undefined;
const tasks = loadTasks(undefined, { drafts }).filter((t) => !only || t.id === only);
if (!tasks.length) {
  console.log(drafts ? "Không có Task nào trong evals/tasks/." : "Chưa có Task đã verify. Chạy thử với Task nháp: pnpm eval --drafts");
  process.exit(0);
}

const cfg = { ...(await loadConfig(root)), runtime: "byok" as const };
const judge = judgeFrom();
console.log(`▶ eval: ${tasks.length} Task, model=${cfg.model ?? "mặc định"}, judge=${judge.getModelName()}`);

const cases = [];
const credits: Record<string, number> = {};
for (const task of tasks) {
  const dir = mkdtempSync(path.join(tmpdir(), `agenthub-eval-${task.id}-`));
  for (const [server, data] of Object.entries(task.data)) writeFileSync(path.join(dir, `${server}.json`), JSON.stringify(data));
  // Agents whose servers all have data in this Task; every server is the mock, reading this Task's data.
  const agents = readerAgents(cfg)
    .filter((a) => Object.keys(a.mcpServers).every((k) => k in task.data))
    .map((a) => ({
      ...a,
      missingConfig: undefined,
      mcpServers: Object.fromEntries(
        Object.keys(a.mcpServers).map((k) => {
          const s = mockServer(cfg, k as "workiq" | "ado" | "azure" | "github");
          return [k, { ...s, env: { AGENTHUB_FIXTURE_DIR: dir } }];
        }),
      ),
    }));
  console.log(`  … ${task.id}: ${agents.map((a) => a.name).join(", ")}`);
  const rt = await createRuntime(cfg);
  const events: HubEvent[] = [];
  for await (const ev of rt.run({ prompt: "check việc", agents, budget: Math.max(30 * agents.length, cfg.maxAiCredits), window: "24h", now: task.now })) events.push(ev);
  await rt.stop();
  const { cards, usedAiCredits, failures } = summarize(events);
  credits[task.id] = usedAiCredits;
  if (Object.keys(failures).length) console.log(`    ✗ ${JSON.stringify(failures)}`);
  const denied = events.flatMap((e) => (e.type === "message" && e.text.startsWith("Bị chặn") ? [`${e.agent}: ${e.text.slice(9)}`] : []));
  const shown = cards.map((c) => ({ refs: c.items.map(refOf), isTodo: c.isTodo, phishing: c.phishing, title: c.title, summary: c.summary, detail: c.detail, todos: c.todos, important: c.important, urgent: c.urgent }));
  cases.push(
    new LLMTestCase({
      name: task.id,
      input: JSON.stringify(task.data),
      actualOutput: JSON.stringify(shown),
      expectedOutput: JSON.stringify(task.expected.todos.map((e) => ({ refs: e.refs, mustMention: e.mustMention }))),
      additionalMetadata: { task, cards, denied },
    }),
  );
}

const result = await evaluate(cases, m1Metrics(judge));
await (judge as { stop?: () => Promise<void> }).stop?.();

const rows = result.testResults.map((t) => ({
  task: t.name,
  status: tasks.find((x) => x.id === t.name)?.status,
  credits: credits[t.name],
  metrics: (t.metricsData ?? []).map((m) => ({ name: m.name, score: m.score ?? null, success: m.success ?? false, reason: m.reason ?? "" })),
}));
console.log("");
for (const r of rows) {
  console.log(`${r.task} (${r.status}, ${r.credits.toFixed(2)} credits)`);
  for (const m of r.metrics) console.log(`  ${m.success ? "✓" : "✗"} ${m.name}: ${m.score?.toFixed(2) ?? "–"} ${m.reason ? `— ${m.reason}` : ""}`);
}
const out = path.join(root, "evals", "results");
mkdirSync(out, { recursive: true });
const file = path.join(out, `${new Date().toISOString().slice(0, 19).replaceAll(":", "")}.json`);
writeFileSync(file, JSON.stringify({ model: cfg.model ?? null, judge: judge.getModelName(), thresholds: THRESHOLDS, drafts, rows }, null, 2));
console.log(`\n→ ${path.relative(root, file)}`);
const failed = rows.filter((r) => r.status === "verified" && r.metrics.some((m) => !m.success));
process.exit(failed.length ? 1 : 0);
