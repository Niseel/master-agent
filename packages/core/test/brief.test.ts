import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { readerAgents } from "../src/agents.ts";
import { AgentResult } from "../src/brief.ts";
import { loadConfig } from "../src/config.ts";
import type { HubEvent } from "../src/events.ts";
import { hint, isBlocking, renderReport, summarize } from "../src/report.ts";
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
  const blocked = ev.find((e) => e.type === "tool.started" && e.tool === "do_action") as { callId: string } | undefined;
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
  for (const f of ["brief-ok", "brief-failures", "brief-auth"]) {
    const text = readFileSync(path.join(root, "fixtures/scenarios", `${f}.jsonl`), "utf8");
    for (const line of text.split("\n").filter(Boolean)) JSON.parse(line);
  }
});

test("mock e2e: EULA / VS30063 tool errors and built-in github-mcp-server are reported", async () => {
  const ev = await run("brief-auth");
  const errors = ev.flatMap((e) => (e.type === "tool.completed" && e.error ? [e.error] : []));
  assert.ok(errors.some((e) => /EULA/.test(e)) && errors.some((e) => /VS30063/.test(e)));
  const blocked = ev.flatMap((e) => (e.type === "message" && e.text.startsWith("Bị chặn") ? [e.text] : []));
  assert.ok(blocked.some((t) => t.includes("github-mcp-server-get_me")), "built-in GitHub tool blocked");
  assert.ok(blocked.some((t) => t.includes("workiq-accept_eula")), "agent may not accept the EULA itself");

  const html = renderReport({
    date: "2026-11-23",
    runtime: "mock",
    usedAiCredits: 0,
    maxAiCredits: 120,
    durationMs: 0,
    failures: { "comms-reader": `Tool lỗi: ${errors[0]}`, "board-reader": `Tool lỗi: ${errors[1]}` },
    blocked,
    items: [],
  });
  assert.ok(html.includes("npx -y @microsoft/workiq accept-eula"));
  assert.ok(html.includes("ADO_AZURE_CONFIG_DIR"));
  assert.ok(html.includes("<h2>Đã chặn</h2>"));
});

test("summarize: retried model errors are not failures; blocking errors drop the agent's items", async () => {
  const ok = summarize(await run("brief-ok"));
  assert.equal(ok.items.length, 10);
  assert.deepEqual(ok.failures, {}, "unknown arguments / WIQL errors were retried");

  const auth = summarize(await run("brief-auth"));
  assert.deepEqual(Object.keys(auth.failures).sort(), ["board-reader", "comms-reader"]);
  assert.match(auth.failures["comms-reader"], /^Tool lỗi: .*EULA/);
  assert.ok(!auth.items.some((i) => /EULA/.test(i.title)), "EULA item only restated the tool error");
  assert.equal(auth.items.length, 1);
  assert.equal(auth.blocked?.length, 2);
  assert.equal(auth.usedAiCredits, 4.2);
});

test("report hints: config and model mistakes", () => {
  for (const [error, want] of [
    ["Chưa cấu hình AZURE_SUBSCRIPTION / AZURE_LOG_WORKSPACE", ".env"],
    ["Chưa cấu hình đúng AZURE_SUBSCRIPTION: 1 giá trị cho mọi workspace", ".env"],
    ["Request rejected due to unknown arguments: resource-group", "cloud-reader"],
    ['{"status":400} ErrorCode: BadArgumentError', "KQL"],
    ["Expecting constant value. The error is caused by «SELECT».", "@Follows"],
    ['{"status":403} InsufficientAccessError', "az login"],
    ["Could not find workspace 'w2'", "az login"],
  ]) assert.ok(hint(error)?.includes(want), error);
  assert.equal(isBlocking("Request rejected due to unknown arguments: x"), false);
  assert.equal(isBlocking("VS30063: You are not authorized"), true);
});
