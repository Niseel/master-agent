import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "@agenthub/core/config";
import type { HubEvent } from "@agenthub/core/events";
import { createHubServer, Hub } from "../src/server.ts";

const root = path.resolve(import.meta.dirname, "../../..");

async function start(scenario: string) {
  process.env.AGENTHUB_RUNTIME = "mock";
  process.env.AGENTHUB_SCENARIO = scenario;
  const hub = new Hub(await loadConfig(root));
  const server = createHubServer(hub);
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
      if (event === "hub" && data.type === "approval.requested") {
        assert.equal((await post(`/api/approvals/${data.id}`, { decision: "maybe" })).status, 400);
        assert.equal((await post(`/api/approvals/${data.id}`, { decision: "reject", feedback: "không" })).status, 200);
      }
      return event === "run" && data.status !== "running";
    });
    assert.equal(seen[0].event, "state");
    const hubEvents = seen.filter((s) => s.event === "hub").map((s) => s.data as HubEvent);
    assert.ok(hubEvents.some((e) => e.type === "approval.resolved" && e.decision === "reject"));
    assert.ok(hubEvents.some((e) => e.type === "agent.result"));
    const end = seen.at(-1)!.data;
    assert.equal(end.status, "done");
    assert.equal(end.report.items.length, 10);
    assert.ok(existsSync(end.report.file) && !end.report.file.startsWith(path.join(root, "reports")), "tests write reports to a temp dir");

    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.status, "done");
    assert.equal(state.events.length, hub.events.length);
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
