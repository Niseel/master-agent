import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readerAgents } from "../src/agents.ts";
import { AgentResult } from "../src/brief.ts";
import { loadConfig } from "../src/config.ts";
import type { HubEvent } from "../src/events.ts";
import { renderReport } from "../src/report.ts";
import { MockRuntime } from "../src/runtime/mock.ts";

const root = path.resolve(import.meta.dirname, "../../..");

test("BriefItem schema rejects bad items", () => {
  assert.equal(AgentResult.safeParse({ items: [{ source: "azure", title: "x", priority: "urgent" }] }).success, false);
  assert.equal(AgentResult.safeParse({ items: [] }).success, true);
});

async function run(scenario: string, onApproval: "approve" | "reject" = "reject") {
  process.env.AGENTHUB_RUNTIME = "mock";
  process.env.AGENTHUB_SCENARIO = scenario;
  const cfg = await loadConfig(root);
  const rt = new MockRuntime(cfg);
  const events: HubEvent[] = [];
  for await (const e of rt.run({ prompt: "check việc", agents: readerAgents(cfg), budget: 5 })) {
    events.push(e);
    if (e.type === "approval.requested") rt.resolveApproval(e.id, onApproval);
  }
  return events;
}

test("mock e2e: write tool from reader is blocked, approval rejected, results valid", async () => {
  const ev = await run("brief-ok");
  const blocked = ev.find((e) => e.type === "tool.started" && e.tool === "mail_send") as { callId: string } | undefined;
  assert.ok(blocked);
  assert.deepEqual(ev.find((e) => e.type === "tool.completed" && e.callId === blocked.callId), {
    type: "tool.completed",
    callId: blocked.callId,
    ok: false,
  });
  assert.ok(ev.some((e) => e.type === "approval.resolved" && e.decision === "reject"));
  const items = ev.flatMap((e) => (e.type === "agent.result" ? e.items : []));
  assert.equal(items.length, 10);
  assert.ok(items.some((i) => i.title.startsWith("[Nghi lừa đảo]")));
});

test("mock e2e: failures don't break the run; bad schema becomes agent.failed", async () => {
  const ev = await run("brief-failures");
  const failed = ev.filter((e) => e.type === "agent.failed").map((e) => (e as { agent: string }).agent);
  assert.deepEqual(failed.sort(), ["board-reader", "cloud-reader", "code-reader", "comms-reader"]);
  assert.equal(ev.filter((e) => e.type === "agent.result").length, 0);
});

test("report: action items first, links only http(s), HTML escaped", () => {
  const html = renderReport({
    date: "2026-11-23",
    runtime: "mock",
    usedAiCredits: 1,
    maxAiCredits: 5,
    durationMs: 1000,
    failures: { "board-reader": "<b>auth</b>" },
    items: [
      { source: "teams", title: "<script>x</script>", summary: "s", priority: "high", actionRequired: true, suggestedAction: null, link: "javascript:alert(1)", timestamp: null },
      { source: "github", title: "PR", summary: "s", priority: "low", actionRequired: false, suggestedAction: null, link: "https://github.com/x", timestamp: null },
    ],
  });
  assert.ok(!html.includes("<script>x"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("&lt;b&gt;auth"));
  assert.ok(html.indexOf("Cần bạn xử lý") < html.indexOf("<h2>GitHub"));
});

test("scenario files are valid JSONL", () => {
  for (const f of ["brief-ok", "brief-failures"]) {
    const text = readFileSync(path.join(root, "fixtures/scenarios", `${f}.jsonl`), "utf8");
    for (const line of text.split("\n").filter(Boolean)) JSON.parse(line);
  }
});
