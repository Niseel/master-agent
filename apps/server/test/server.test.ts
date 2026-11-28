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

test("server: run over HTTP, events stream over SSE, a write tool is denied, report saved", async () => {
  const { hub, server, base, post } = await start("brief-ok");
  try {
    const sse = await fetch(`${base}/api/events`);
    assert.equal((await post("/api/run", { prompt: "check việc" })).status, 202);
    assert.equal((await post("/api/run", {})).status, 409, "one run at a time");

    const seen = await readSse(sse, (event, data) => event === "run" && data.status !== "running");
    assert.equal(seen[0].event, "state");
    const hub1 = seen.find((s) => s.event === "hub")!;
    assert.equal(typeof hub1.data.at, "number");
    const hubEvents = seen.filter((s) => s.event === "hub").map((s) => s.data.event as HubEvent);
    // brief-ok: code-reader tries a write (prompt injection in a PR comment); the gate denies it, nothing waits.
    assert.ok(hubEvents.some((e) => e.type === "message" && e.agent === "code-reader" && /Bị chặn.*github-add_issue_comment/.test(e.text)));
    assert.ok(hubEvents.some((e) => e.type === "agent.result"));
    const end = seen.at(-1)!.data;
    assert.equal(end.status, "done");
    assert.equal(end.report.items.length, 12);
    assert.equal(end.report.cards.length, 9);
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

test("server: only loopback Host, same-origin JSON requests; removed routes are 404", async () => {
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
    for (const p of ["/api/approvals/x", "/api/act", "/api/qa", "/api/qa/criteria"]) assert.equal((await post(p, {})).status, 404, p);
  } finally {
    server.close();
  }
});

test("server: stop ends the run as stopped", async () => {
  const { hub, server } = await start("brief-ok");
  try {
    const { done } = await hub.start("check việc");
    for (let i = 0; i < 200 && !hub.events.some((e) => e.type === "tool.started"); i++) await new Promise((r) => setTimeout(r, 20));
    await hub.stop();
    await done;
    assert.equal(hub.status, "stopped");
    assert.ok(!hub.events.some((e) => e.type === "agent.result" && e.agent === "cloud-reader"), "the rest of the run did not play");
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
    assert.match(page.headers.get("content-security-policy")!, /frame-ancestors 'self'/, "other sites cannot frame the dashboard");
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

test("server: run options are checked; card marks persist; the to-do list exports as Markdown", async () => {
  const { hub, server, post, base } = await start("brief-ok");
  try {
    assert.equal((await post("/api/run", { window: "1y" })).status, 400);
    assert.equal((await post("/api/run", { agents: [] })).status, 400, "at least one agent");
    assert.equal((await post("/api/run", { budget: -1 })).status, 400);
    assert.equal((await fetch(`${base}/api/export.md`)).status, 404, "no report yet");

    const { done } = await hub.start("check việc", { window: "3d", agents: ["board-reader", "comms-reader"] });
    await done;
    assert.ok(!hub.events.some((e) => "agent" in e && e.agent === "code-reader"), "only the chosen agents run");
    const card = hub.report!.report.cards.find((c) => c.key === "ado:1234")!;
    assert.deepEqual(card.items.map((i) => i.source), ["ado", "teams"], "merged across the two agents");

    assert.equal((await post("/api/cards", { key: card.key, status: "later" })).status, 400);
    assert.equal((await post("/api/cards", { key: card.key, todos: [{ text: "x" }] })).status, 400);
    assert.equal((await post("/api/cards", { key: card.key, status: "done" })).status, 200);
    const steps = [{ text: "Tự viết", done: false, struck: false }, { text: "Bỏ", done: false, struck: true }];
    assert.equal((await post("/api/cards", { key: card.key, todos: steps })).status, 200);
    assert.equal(hub.cardStates[card.key].status, "done", "editing todos keeps the mark");
    assert.equal(hub.cardStates[card.key].seen, card.updatedAt);
    assert.deepEqual(new Hub(hub.cfg).cardStates[card.key].todos, steps, "saved to disk");

    const md = await (await fetch(`${base}/api/export.md`)).text();
    assert.match(md, /- \[x\] \*\*\[#1234[\s\S]*- \[ \] ~~Bỏ~~/);
  } finally {
    server.close();
  }
});

test("server: gates and agents from the dashboard; mcp.json import keeps secrets out of the file; tools of a mock gate", async () => {
  const { hub, server, post, base } = await start("brief-ok");
  const store = new Map<string, string>();
  const secretHub = new Hub(hub.cfg, { get: (id) => store.get(id) ?? null, set: (id, v) => void store.set(id, v), delete: (id) => store.delete(id) });
  try {
    const put = (file: unknown) => fetch(`${base}/api/config`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ file }) });
    assert.equal((await put({ servers: { "Bad-Key": {} }, agents: {} })).status, 400);
    const file = structuredClone(hub.file);
    file.servers.ado.tools = ["wit_work_item", "wit_query"];
    file.agents["board-reader"].todoRule = "chỉ bug";
    delete file.agents["cloud-reader"];
    assert.equal((await put(file)).status, 200);
    assert.deepEqual(hub.agents.find((a) => a.name === "board-reader")?.readTools, ["ado-wit_work_item", "ado-wit_query"]);
    assert.ok(!hub.agents.some((a) => a.name === "cloud-reader"), "removed from the canvas");
    assert.equal(new Hub(hub.cfg).file.agents["board-reader"].todoRule, "chỉ bug", "saved to agenthub.local.json");

    const imported = await post("/api/import", { text: '{"servers":{"notes":{"type":"http","url":"https://n.example/mcp","headers":{"Authorization":"Bearer t0k3n"}}}}' });
    assert.deepEqual(await imported.json(), { added: ["notes"], secrets: ["notes_authorization"], skipped: [] });
    assert.ok(!JSON.stringify(hub.file).includes("t0k3n"), "the token is not kept");
    assert.equal((await post("/api/import", { text: "{oops" })).status, 400);

    const tools = (await (await post("/api/tools", { key: "ado" })).json()) as { tools: { name: string; write: boolean }[] };
    assert.ok(tools.tools.some((t) => t.name === "wit_work_item" && !t.write));
    assert.ok(tools.tools.some((t) => t.name === "repo_pull_request"));
    assert.equal((await post("/api/tools", { key: "notes" })).status, 400, "mock runtime never contacts a real server; missing secret first");

    // Secrets: only declared password inputs; the value never comes back in the state.
    secretHub.file = hub.file;
    assert.throws(() => secretHub.setSecret("other", "x"), /Không có ô bí mật/);
    secretHub.setSecret("notes_authorization", "abc");
    assert.equal(store.get("notes_authorization"), "abc");
    const state = JSON.stringify(secretHub.state());
    assert.ok(!state.includes('"abc"') && state.includes('"notes_authorization":true'));
  } finally {
    server.close();
  }
});

test("server: sign-in never runs a real CLI in the mock runtime", async () => {
  const { server, post } = await start("brief-ok");
  try {
    const r = await post("/api/login", { key: "ado" });
    assert.equal(r.status, 400);
    assert.match(((await r.json()) as { error: string }).error, /Runtime mock/);
    assert.equal((await post("/api/logout", { key: "github" })).status, 400);
  } finally {
    server.close();
  }
});
