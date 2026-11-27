import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import type { HubEvent } from "../src/events.ts";
import { acReader, parseCriteria, PLAYWRIGHT_MCP_VERSION, QA_TOOLS, qaAgent, saveQaReport } from "../src/qa.ts";
import { MockRuntime } from "../src/runtime/mock.ts";
import { sessionTools } from "../src/runtime/sdk.ts";
import { decide, originOf } from "../src/security.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const input = { url: "http://127.0.0.1:4317/report", criteria: ["Mục cần xử lý nằm đầu báo cáo", "Link mở tab mới", "Footer ghi AI Credits"] };

test("qa gate: listed browser tools only, navigate only to the site under test", () => {
  const qa = qaAgent({ root }, input, "/tmp/qa");
  const nav = (url: unknown) => decide(qa, "playwright-browser_navigate", { url }).decision;
  assert.equal(nav("http://127.0.0.1:4317/other?x=1"), "allow");
  assert.equal(nav("http://127.0.0.1:9999/"), "deny", "other port = other origin");
  assert.equal(nav("https://example.com/"), "deny");
  assert.equal(nav("file:///etc/passwd"), "deny");
  assert.equal(nav("javascript:alert(1)"), "deny");
  assert.equal(nav(undefined), "deny", "no args, no navigate");
  for (const t of ["browser_evaluate", "browser_run_code_unsafe", "browser_file_upload", "browser_drop", "browser_tabs", "browser_network_requests"]) {
    assert.equal(decide(qa, `playwright-${t}`, {}).decision, "deny", t);
  }
  assert.equal(decide(qa, "playwright-browser_click", {}).decision, "allow");
  assert.equal(decide(qa, "github-get_me", {}).decision, "deny", "other server");
  assert.deepEqual(sessionTools(qa), QA_TOOLS.map((t) => `mcp:${t}`));
  assert.equal(originOf("not a url"), null);
});

test("qa agent: pinned Playwright MCP, headless, isolated, one allowed origin, files in its own dir", () => {
  const qa = qaAgent({ root }, input, "/tmp/qa-1");
  const pw = qa.mcpServers.playwright as { args: string[]; workingDirectory: string };
  assert.ok(pw.args.includes(`@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`));
  for (const flag of ["--headless", "--isolated", "--caps=devtools"]) assert.ok(pw.args.includes(flag), flag);
  assert.equal(pw.args[pw.args.indexOf("--allowed-origins") + 1], "http://127.0.0.1:4317");
  assert.equal(pw.args[pw.args.indexOf("--output-dir") + 1], "/tmp/qa-1");
  assert.equal(pw.workingDirectory, "/tmp/qa-1");
  assert.equal(qa.kind, "tester");
  assert.match(qa.task, /1\. Mục cần xử lý[\s\S]*3\. Footer/);
  assert.match(qa.task, /Gọi từng tool MỘT/);
  assert.match(qa.task, /target=_blank/);
  assert.throws(() => qaAgent({ root }, { ...input, url: "file:///x" }, "/tmp/qa"));
});

test("parseCriteria drops list markers and blank lines", () => {
  assert.deepEqual(parseCriteria("- a\n\n2. b\nAC3: c\n* d \n"), ["a", "b", "c", "d"]);
  assert.equal(parseCriteria("x\n".repeat(30)).length, 20);
});

test("mock e2e qa: denied tools reach the model as denied calls; report shows pass/fail, links only files that exist", async () => {
  process.env.AGENTHUB_RUNTIME = "mock";
  const cfg = await loadConfig(root);
  const dir = mkdtempSync(path.join(tmpdir(), "agenthub-qa-"));
  writeFileSync(path.join(dir, "ac-1.png"), "png");
  writeFileSync(path.join(dir, "qa.webm"), "webm");
  writeFileSync(path.join(dir, "qa-1.webm"), "webm"); // a target=_blank tab at Work run 9; sorts first
  const rt = new MockRuntime(cfg);
  const events: HubEvent[] = [];
  for await (const e of rt.run({ prompt: "Nghiệm thu", agents: [qaAgent(cfg, input, dir)], budget: 30, scenario: "qa-ok" })) events.push(e);

  const denied = events.filter((e) => e.type === "tool.completed" && e.error?.startsWith("Denied by preToolUse hook"));
  assert.equal(denied.length, 2, "browser_evaluate and the navigate to another site");
  assert.ok(events.some((e) => e.type === "qa.result"));
  assert.ok(events.some((e) => e.type === "agent.completed" && e.agent === "qa"));

  const { file, report } = saveQaReport(cfg, dir, input, events, 2400);
  const html = readFileSync(file, "utf8");
  assert.deepEqual(report.files.sort(), ["ac-1.png", "qa-1.webm", "qa.webm"]);
  assert.match(html, /2 đạt · 1 không đạt · 0 không kiểm được/);
  assert.match(html, /<img src="ac-1\.png"/);
  assert.ok(!html.includes('src="ac-2.png"'), "missing file not linked");
  assert.ok(!html.includes("etc/passwd"), "a path from the model is never linked");
  assert.match(html, /<video controls preload="metadata" src="qa\.webm">/, "the run's video, not the extra tab's");
  assert.match(html, /Video khác \(tab phụ\): <a href="qa-1\.webm">/);
  assert.match(html, /Có tiêu chí không đạt/);
});

test("qa report: no result means every criterion is blocked, with the error", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "agenthub-qa-"));
  const { report, file } = saveQaReport({ runtime: "mock" }, dir, { url: "http://x/<b>", criteria: ["a", "b"] }, [{ type: "agent.failed", agent: "qa", error: "Không mở được <trang>" }], 10);
  const html = readFileSync(file, "utf8");
  assert.equal(report.result, null);
  assert.match(html, /0 đạt · 0 không đạt · 2 không kiểm được/);
  assert.match(html, /Không mở được &lt;trang&gt;/);
  assert.ok(html.includes("http://x/&lt;b&gt;") && !html.includes("http://x/<b>"), "escaped");
});

test("ac-reader: read-only ADO (header kept), only wit_work_item; mock returns criteria", async () => {
  const real = acReader({ ...(await loadConfig(root)), runtime: "copilot", ado: { org: "o", project: "p" } }, 1234);
  assert.equal((real.mcpServers.ado as { headers?: Record<string, string> }).headers?.["X-MCP-Readonly"], "true");
  assert.equal(real.kind, "reader");
  assert.equal(decide(real, "ado-wit_work_item", { action: "get" }).decision, "allow");
  for (const t of ["ado-wit_query", "ado-wit_work_item_write", "ado-wit_work_item_comment_write"]) assert.equal(decide(real, t).decision, "deny", t);
  assert.match(real.task, /work item 1234/);

  process.env.AGENTHUB_RUNTIME = "mock";
  const cfg = await loadConfig(root);
  const events: HubEvent[] = [];
  for await (const e of new MockRuntime(cfg).run({ prompt: "x", agents: [acReader(cfg, 1234)], budget: 30, scenario: "ac-reader" })) events.push(e);
  const r = events.find((e) => e.type === "criteria.result") as { criteria: string[] };
  assert.equal(r.criteria.length, 3);
});
