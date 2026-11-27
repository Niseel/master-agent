import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "@agenthub/core/config";
import type { HubEvent } from "@agenthub/core/events";
import { createHubServer, Hub } from "../src/server.ts";

const root = path.resolve(import.meta.dirname, "../../..");

async function start(scenario: string, webDir?: string) {
  process.env.AGENTHUB_RUNTIME = "mock";
  process.env.AGENTHUB_SCENARIO = scenario;
  const hub = new Hub(await loadConfig(root));
  const server = createHubServer(hub, webDir);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { hub, server, base, post };
}

/** Read SSE messages until `until` returns true. */
async function readSse(res: Response, until: (event: string, data: any) => boolean | Promise<boolean>) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  const seen: { event: string; data: any }[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return seen;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = block.match(/^event: (.*)$/m)![1];
      const data = JSON.parse(block.match(/^data: (.*)$/m)![1]);
      seen.push({ event, data });
      if (await until(event, data)) {
        await reader.cancel();
        return seen;
      }
    }
  }
}

test("server: run over HTTP, events stream over SSE, approval resolved from the browser, report saved", async () => {
  const { hub, server, base, post } = await start("brief-ok");
  try {
    const sse = await fetch(`${base}/api/events`);
    assert.equal((await post("/api/run", { prompt: "check việc" })).status, 202);
    assert.equal((await post("/api/run", {})).status, 409, "one run at a time");

    const seen = await readSse(sse, async (event, data) => {
      if (event === "hub" && data.event.type === "approval.requested") {
        assert.equal(typeof data.at, "number");
        assert.equal((await post(`/api/approvals/${data.event.id}`, { decision: "maybe" })).status, 400);
        assert.equal((await post(`/api/approvals/${data.event.id}`, { decision: "reject", feedback: "không" })).status, 200);
      }
      return event === "run" && data.status !== "running";
    });
    assert.equal(seen[0].event, "state");
    const hubEvents = seen.filter((s) => s.event === "hub").map((s) => s.data.event as HubEvent);
    assert.ok(hubEvents.some((e) => e.type === "approval.resolved" && e.decision === "reject"));
    assert.ok(hubEvents.some((e) => e.type === "agent.result"));
    const end = seen.at(-1)!.data;
    assert.equal(end.status, "done");
    assert.equal(end.report.items.length, 10);
    assert.ok(existsSync(end.report.file) && !end.report.file.startsWith(path.join(root, "reports")), "tests write reports to a temp dir");

    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.status, "done");
    assert.equal(state.events.length, hub.events.length);
    assert.equal(state.prompt, "check việc");
    assert.equal(state.events[0].event.type, hub.events[0].type);

    const report = await fetch(`${base}/report`);
    assert.equal(report.status, 200);
    assert.match(report.headers.get("content-security-policy")!, /default-src 'none'/, "report page runs no scripts");
    assert.match(await report.text(), /Check việc/);
    assert.deepEqual(state.agents.map((a: { name: string }) => a.name), hub.agents.map((a) => a.name));
  } finally {
    server.close();
  }
});

test("server: only loopback Host, same-origin JSON requests; approval without a run is 409", async () => {
  const { server, post, base } = await start("brief-ok");
  try {
    assert.equal((await post("/api/run", {}, { origin: "https://evil.example" })).status, 403);
    const form = await fetch(`${base}/api/run`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "prompt=x" });
    assert.equal(form.status, 415, "a cross-site form cannot start a run");
    // fetch() ignores a custom Host header, so use node:http (DNS rebinding sends the attacker's host name).
    const rebind = await new Promise<number>((ok, fail) =>
      request(`${base}/api/state`, { headers: { host: "evil.example" } }, (r) => ok(r.statusCode!)).on("error", fail).end(),
    );
    assert.equal(rebind, 403);
    assert.equal((await post("/api/approvals/nope", { decision: "approve" })).status, 409, "no run yet");
  } finally {
    server.close();
  }
});

test("server: act runs one writer on a brief item, after the brief; bad input is 400; the report stays", async () => {
  const { hub, server, post } = await start("brief-ok");
  try {
    const brief = await hub.start("check việc");
    for (let i = 0; i < 200 && !hub.events.some((e) => e.type === "approval.requested"); i++) await new Promise((r) => setTimeout(r, 20));
    hub.resolveApproval((hub.events.find((e) => e.type === "approval.requested") as { id: string }).id, "reject");
    await brief.done;
    const report = hub.report;
    const item = report!.report.items.find((i) => i.source === "teams")!;

    assert.equal((await post("/api/act", { agent: "comms-reader", item, instruction: "x" })).status, 400, "a reader cannot act");
    assert.equal((await post("/api/act", { agent: "comms-writer", item: { title: "x" }, instruction: "x" })).status, 400);
    assert.equal((await post("/api/act", { agent: "comms-writer", item, instruction: " " })).status, 400);

    const before = hub.events.length;
    const { done } = await hub.act("comms-writer", item, "Trả lời B: ngưỡng 2 triệu");
    assert.equal((await post("/api/act", { agent: "comms-writer", item, instruction: "x" })).status, 409, "one run at a time");
    for (let i = 0; i < 200 && !hub.events.slice(before).some((e) => e.type === "approval.requested"); i++) await new Promise((r) => setTimeout(r, 20));
    const req = hub.events.slice(before).find((e) => e.type === "approval.requested") as Extract<HubEvent, { type: "approval.requested" }>;
    assert.equal(req.tool, "workiq-create_entity");
    assert.deepEqual(hub.acts["comms-writer"], item, "the dashboard knows which item the writer acts on");
    assert.equal((await post(`/api/approvals/${req.id}`, { decision: "approve" })).status, 200);
    await done;

    // A rejection carries the user's reason to the dashboard.
    const before2 = hub.events.length;
    const second = await hub.act("comms-writer", item, "Trả lời lần 2");
    for (let i = 0; i < 200 && !hub.events.slice(before2).some((e) => e.type === "approval.requested"); i++) await new Promise((r) => setTimeout(r, 20));
    const req2 = hub.events.slice(before2).find((e) => e.type === "approval.requested") as { id: string };
    assert.equal((await post(`/api/approvals/${req2.id}`, { decision: "reject", feedback: "x" })).status, 200);
    await second.done;
    assert.ok(hub.events.slice(before2).some((e) => e.type === "approval.resolved" && e.decision === "reject" && e.feedback === "x"));
    assert.equal(hub.mode, "act");
    assert.ok(hub.events.length > before && hub.events[0].type === "agent.started", "brief events kept, act appended");
    assert.ok(hub.events.some((e) => e.type === "action.result" && e.link));
    assert.equal(hub.report, report, "an act run does not replace the brief report");
  } finally {
    server.close();
  }
});

test("server: qa run saves its report in its own dir; files served only from there, with a no-script CSP", async () => {
  const { hub, server, post, base } = await start("brief-ok");
  try {
    assert.equal((await post("/api/qa", { url: "file:///etc/passwd", criteria: "a" })).status, 400);
    assert.equal((await post("/api/qa", { url: "http://127.0.0.1:4317/report", criteria: " \n " })).status, 400);
    const { done } = await hub.startQa("http://127.0.0.1:4317/report", "- Mục cần xử lý nằm đầu báo cáo\n- Link mở tab mới\n- Footer ghi AI Credits");
    await done;
    assert.equal(hub.mode, "qa");
    assert.equal(hub.status, "done");
    const qa = hub.qa!;
    assert.match(qa.dir, /^qa-\d{4}-\d{2}-\d{2}-\d{6}-mock$/);
    assert.deepEqual(qa.report.result?.criteria.map((c) => c.status), ["pass", "fail", "pass"]);
    assert.equal(hub.report, null, "a qa run does not make a brief report");

    const page = await fetch(`${base}/qa/${qa.dir}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy")!, /default-src 'none'/);
    assert.match(await page.text(), /Có tiêu chí không đạt/);
    for (const bad of [`/qa/${qa.dir}/..%2F..%2Fpackage.json`, "/qa/..%2F/x", "/qa/brief/index.html", `/qa/${qa.dir}/nope.png`]) {
      assert.equal((await fetch(base + bad)).status, 404, bad);
    }
  } finally {
    server.close();
  }
});

test("server: acceptance criteria from a work item (ac-reader, read-only) for the qa form", async () => {
  const { hub, server, post } = await start("brief-ok");
  try {
    for (const bad of [0, -1, 1.5, "12"]) assert.equal((await post("/api/qa/criteria", { workItem: bad })).status, 400, String(bad));
    const ac = hub.agents.find((a) => a.name === "ac-reader")!;
    assert.deepEqual(ac.readTools, ["ado-wit_work_item"]);
    assert.equal(ac.kind, "reader");
    const { done } = await hub.startCriteria(1234);
    await done;
    assert.equal(hub.mode, "ac");
    assert.equal(hub.ac?.workItem, 1234);
    assert.equal(hub.ac?.criteria.length, 3);
    assert.equal(hub.report, null, "no brief report from it");
    assert.equal(hub.state().agents.find((a) => a.name === "ac-reader")?.output, "criteria", "the meter adds it on top of the brief");
  } finally {
    server.close();
  }
});

test("server: stop rejects pending approvals and ends the run as stopped", async () => {
  const { hub, server } = await start("brief-ok");
  try {
    const { done } = await hub.start("check việc");
    for (let i = 0; i < 200 && !hub.events.some((e) => e.type === "approval.requested"); i++) await new Promise((r) => setTimeout(r, 20));
    await hub.stop();
    await done;
    assert.equal(hub.status, "stopped");
    const resolved = hub.events.find((e) => e.type === "approval.resolved");
    assert.ok(!resolved || resolved.decision === "reject", "stop never approves");
  } finally {
    server.close();
  }
});

test("server: auth in mock runtime calls nothing real; dashboard files served with CSP, never outside dist", async () => {
  const web = mkdtempSync(path.join(tmpdir(), "agenthub-web-"));
  mkdirSync(path.join(web, "assets"));
  writeFileSync(path.join(web, "index.html"), "<!doctype html><title>hub</title>");
  writeFileSync(path.join(web, "assets", "app.js"), "console.log(1)");
  const { server, base } = await start("brief-ok", web);
  try {
    const auth = (await (await fetch(`${base}/api/auth`)).json()) as { source: string; status: string }[];
    assert.deepEqual(auth.map((a) => a.source).sort(), ["ado", "azure", "github", "workiq"]);
    assert.ok(auth.every((a) => a.status === "mock"));

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy")!, /frame-ancestors 'self'/, "other sites cannot frame the approve buttons");
    const js = await fetch(`${base}/assets/app.js`);
    assert.match(js.headers.get("content-type")!, /javascript/);
    assert.equal(await (await fetch(`${base}/some/route`)).text(), "<!doctype html><title>hub</title>", "SPA fallback");
    const escape = await new Promise<string>((ok, fail) =>
      request(`${base}/..%2f..%2fpackage.json`, (r) => {
        let b = "";
        r.on("data", (c) => (b += c)).on("end", () => ok(b));
      }).on("error", fail).end(),
    );
    assert.ok(!escape.includes("agent-hub"), "path traversal falls back to index.html");
    assert.equal((await fetch(`${base}/report`)).status, 404, "no report before a run");
  } finally {
    server.close();
  }
});

test("checkAuth: missing CLI and missing config are clear errors, never a token", async () => {
  process.env.AGENTHUB_RUNTIME = "copilot";
  const { checkAuth } = await import("@agenthub/core/auth");
  const cfg = { ...(await loadConfig(root)), runtime: "copilot" as const, azure: { subscriptions: [], workspaces: [] } };
  const { readerAgents } = await import("@agenthub/core/agents");
  const savedPath = process.env.PATH;
  process.env.PATH = "/nonexistent"; // no az, no gh
  try {
    const res = await checkAuth(readerAgents(cfg).filter((a) => a.name !== "board-reader"), "copilot");
    const by = Object.fromEntries(res.map((r) => [r.source, r]));
    assert.match(by.azure.detail, /Chưa cấu hình AZURE_SUBSCRIPTION/);
    assert.equal(by.github.status, "error");
    assert.match(by.github.detail, /Chưa cài lệnh `gh`/);
    assert.equal(by.workiq.status, "unknown");
  } finally {
    process.env.PATH = savedPath;
    process.env.AGENTHUB_RUNTIME = "mock";
  }
});
