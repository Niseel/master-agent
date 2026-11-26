import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readerAgents, writerAgents } from "@agenthub/core/agents";
import { loadConfig } from "@agenthub/core/config";
import { MockRuntime } from "@agenthub/core/runtime/mock";
import { derive, pending, type AgentInfo, type Timed } from "../src/state.ts";

const root = path.resolve(import.meta.dirname, "../../..");

/** Replay a mock scenario the way the dashboard receives it. */
async function replay(scenario: string) {
  process.env.AGENTHUB_RUNTIME = "mock";
  process.env.AGENTHUB_SCENARIO = scenario;
  const cfg = await loadConfig(root);
  const specs = readerAgents(cfg);
  const agents: AgentInfo[] = specs.map((a) => ({ ...a, servers: Object.keys(a.mcpServers), missingConfig: a.missingConfig ?? null }));
  const rt = new MockRuntime(cfg);
  const events: Timed[] = [];
  let t = 0;
  for await (const event of rt.run({ prompt: "check việc", agents: specs, budget: 120 })) {
    events.push({ at: (t += 10), event });
    if (event.type === "approval.requested") rt.resolveApproval(event.id, "reject");
  }
  return { agents, events };
}

test("dashboard state: brief-ok ends with every agent done or warned, credits summed, approval resolved", async () => {
  const { agents, events } = await replay("brief-ok");
  const v = derive(agents, events);
  assert.deepEqual(Object.values(v.servers).map((s) => s.active), [0, 0, 0, 0], "no edge left animated");
  assert.equal(v.agents["comms-reader"].status, "done", "a denied call is not an error of the source");
  assert.equal(v.agents["cloud-reader"].status, "warning", "one workspace 403 is a warning");
  assert.equal(v.servers.azure.status, "warning");
  assert.equal(v.servers.ado.status, "done", "a WIQL error the model retried past does not mark the server");
  assert.ok(v.agents["board-reader"].calls.some((c) => c.hint?.includes("@Follows")), "but the call log keeps it with its hint");
  assert.equal(v.usedAiCredits, 31.5);
  assert.equal(pending(v).length, 0);
  assert.equal(v.approvals[0].decision, "reject");
  assert.ok(v.agents["comms-reader"].calls.some((c) => c.denied), "denied call kept in the agent's log");
  assert.equal(Object.values(v.agents).reduce((n, a) => n + a.items, 0), 10);
});

test("dashboard state: login and EULA errors need the user; mid-run state shows running and in-flight calls", async () => {
  const { agents, events } = await replay("brief-auth");
  const v = derive(agents, events);
  for (const name of ["comms-reader", "board-reader", "cloud-reader"]) {
    assert.equal(v.agents[name].status, "needs-action", name);
    assert.ok(v.agents[name].hint, `${name} has a hint`);
  }
  assert.equal(v.servers.azure.status, "needs-action");
  assert.match(v.agents["cloud-reader"].hint!, /az account get-access-token/);
  assert.equal(v.agents["code-reader"].status, "done");

  const firstCall = events.findIndex((e) => e.event.type === "tool.started");
  const mid = derive(agents, events.slice(0, firstCall + 1));
  assert.equal(mid.agents["comms-reader"].status, "running");
  assert.equal(mid.edges["comms-reader>workiq"].active, 1, "edge animates while the call is in flight");
});

test("dashboard state: missing config and failed agents", async () => {
  const { agents, events } = await replay("brief-failures");
  const v = derive(agents, events);
  assert.equal(v.agents["comms-reader"].status, "needs-action", "AADSTS65001 needs IT consent");
  assert.equal(v.agents["board-reader"].status, "failed", "timeout");
  const cfgMissing = derive([{ name: "x", displayName: "X", kind: "reader", servers: ["azure"], missingConfig: "Chưa cấu hình AZURE_SUBSCRIPTION" }], []);
  assert.equal(cfgMissing.agents.x.status, "needs-action");
  assert.match(cfgMissing.agents.x.hint!, /\.env/);
});

test("dashboard state: a writer run appended to the brief shows its result; repeated ids resolve the open approval", async () => {
  const { agents, events } = await replay("brief-ok");
  const cfg = await loadConfig(root);
  const writers = writerAgents(cfg);
  const all: AgentInfo[] = [...agents, ...writers.map((a) => ({ ...a, servers: Object.keys(a.mcpServers), missingConfig: a.missingConfig ?? null }))];
  const briefItems = derive(agents, events).agents["code-reader"].items;
  let t = events.at(-1)!.at;
  for (const decision of ["reject", "approve"] as const) {
    const rt = new MockRuntime(cfg);
    for await (const event of rt.run({ prompt: "Trả lời B", agents: writers, budget: 30, scenario: "act-comms-writer" })) {
      events.push({ at: (t += 10), event });
      if (event.type === "approval.requested") rt.resolveApproval(event.id, decision);
    }
  }
  const v = derive(all, events);
  assert.equal(v.agents["comms-writer"].status, "done", "a rejected earlier run does not stick");
  assert.ok(v.agents["comms-writer"].action?.link, "last run sent");
  assert.deepEqual(v.approvals.map((a) => a.decision), ["reject", "reject", "approve"]);
  assert.equal(v.agents["code-reader"].items, briefItems, "brief state kept");
  assert.equal(v.usedAiCredits, 31.5 + 3.2, "writer credits add to the brief total");
});
