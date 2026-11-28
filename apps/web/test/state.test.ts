import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readerAgents, writerAgents } from "@agenthub/core/agents";
import { qaAgent } from "@agenthub/core/qa";
import { loadConfig } from "@agenthub/core/config";
import { MockRuntime } from "@agenthub/core/runtime/mock";
import { BriefItem } from "@agenthub/core/brief";
import { authState, derive, outcomeText, pending, sameItem, todoGroups, workItemItem, writerOutcome, type AgentInfo, type Timed } from "../src/state.ts";

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

  // Found at Work run 9: qa credits were left out of the meter.
  const qaSpec = qaAgent(cfg, { url: "http://127.0.0.1:4317/report", criteria: ["a", "b", "c"] }, "/tmp/qa");
  for await (const event of new MockRuntime(cfg).run({ prompt: "x", agents: [qaSpec], budget: 30, scenario: "qa-ok" })) events.push({ at: (t += 10), event });
  const withQa = derive([...all, { ...qaSpec, servers: ["playwright"], missingConfig: null }], events);
  assert.equal(withQa.usedAiCredits, 31.5 + 3.2 + 4.8);
  assert.equal(withQa.agents.qa.qa?.criteria.length, 3);
});

test("todoGroups: action items as before, plus items of sources with a writer; original indexes kept", async () => {
  const { events } = await replay("brief-ok");
  const items = events.flatMap(({ event }) => (event.type === "agent.result" ? event.items : []));
  const writerFor = { teams: "comms-writer", outlook: "comms-writer", ado: "board-writer", github: "code-writer" };
  const g = todoGroups(items, writerFor);
  assert.deepEqual(g.action.map((x) => x.i), items.flatMap((it, i) => (it.actionRequired ? [i] : [])));
  assert.ok(g.other.length && g.other.every(({ item, i }) => !item.actionRequired && item.source !== "azure" && items[i] === item));
  assert.ok(g.other.some(({ item }) => item.source === "ado"), "an ADO item that needs nothing can still be handed to board-writer");
  assert.ok(items.some((it) => it.source === "azure" && !it.actionRequired), "fixture has such an Azure item");
  assert.ok(!g.other.some(({ item }) => item.source === "azure"), "Azure has no writer");
});

test("writer outcome: a rejection shows its reason and 'nothing sent'; an approval shows what was sent", async () => {
  const cfg = await loadConfig(root);
  const writers = writerAgents(cfg);
  const infos: AgentInfo[] = writers.map((a) => ({ ...a, servers: Object.keys(a.mcpServers), missingConfig: null }));
  const run = async (decision: "approve" | "reject", events: Timed[] = []) => {
    let t = events.at(-1)?.at ?? 0;
    const rt = new MockRuntime(cfg);
    for await (const event of rt.run({ prompt: "x", agents: writers, budget: 30, scenario: "act-board-writer" })) {
      events.push({ at: (t += 10), event });
      if (event.type === "approval.requested") {
        const mid = writerOutcome(derive(infos, events), "board-writer");
        assert.deepEqual(mid, { kind: "waiting", pending: 1 });
        rt.resolveApproval(event.id, decision, decision === "reject" ? "Sai nội dung" : undefined);
      }
    }
    return events;
  };
  const rejected = await run("reject");
  const v = derive(infos, rejected);
  assert.equal(v.approvals[0].feedback, "Sai nội dung");
  assert.ok(v.approvals[0].resolvedAt! > v.approvals[0].at);
  const o = writerOutcome(v, "board-writer");
  assert.equal(o.kind, "nothing-sent");
  assert.equal(outcomeText(o), "Bị từ chối 1 yêu cầu, không gửi gì");
  assert.equal(o.kind === "nothing-sent" && o.blocked, 0, "the rejected call is not also a gate block");

  const both = await run("approve", rejected);
  const o2 = writerOutcome(derive(infos, both), "board-writer");
  assert.equal(o2.kind, "sent", "only the latest run counts");
  assert.equal(outcomeText(o2), "Đã gửi 1");
  assert.equal(writerOutcome(derive(infos, both), "comms-writer").kind, "idle");
});

test("writer outcome: no approval asked (Work run 11, no recipient) shows the agent's reason and the blocked calls", () => {
  const infos: AgentInfo[] = [{ name: "comms-writer", displayName: "Soạn Teams", kind: "writer", servers: ["workiq"], missingConfig: null }];
  const ev: Timed[] = [
    { at: 1, event: { type: "agent.started", agent: "comms-writer", at: "" } },
    { at: 2, event: { type: "tool.started", agent: "comms-writer", server: "builtin", tool: "workiq-call_function_placeholder", callId: "c1" } },
    { at: 3, event: { type: "tool.completed", callId: "c1", ok: false, error: "Denied by preToolUse hook: x" } },
    { at: 4, event: { type: "action.result", agent: "comms-writer", summary: "Thiếu người nhận", link: null } },
    { at: 5, event: { type: "agent.completed", agent: "comms-writer" } },
  ];
  const o = writerOutcome(derive(infos, ev), "comms-writer");
  assert.deepEqual(o, { kind: "nothing-sent", rejected: [], summary: "Thiếu người nhận", blocked: 1 });
  assert.equal(outcomeText(o), "Không gửi gì: Thiếu người nhận");
});

test("work item typed by the user: a valid ADO BriefItem for board-writer", () => {
  const item = workItemItem(1234);
  assert.ok(BriefItem.safeParse(item).success);
  assert.equal(item.title, "Work item #1234");
  assert.ok(sameItem(item, workItemItem(1234)) && !sameItem(item, workItemItem(1235)));
});

test("sign-in chip: an unknown source turns ok after a successful call on it", () => {
  const infos: AgentInfo[] = [{ name: "comms-writer", displayName: "x", kind: "writer", servers: ["workiq"], missingConfig: null }];
  const ev: Timed[] = [
    { at: 1, event: { type: "agent.started", agent: "comms-writer", at: "" } },
    { at: 2, event: { type: "tool.started", agent: "comms-writer", server: "workiq", tool: "search_paths", callId: "c1" } },
  ];
  assert.equal(authState("unknown", derive(infos, ev), "workiq"), "unknown", "not finished yet");
  ev.push({ at: 3, event: { type: "tool.completed", callId: "c1", ok: true } });
  assert.equal(authState("unknown", derive(infos, ev), "workiq"), "ok");
  assert.equal(authState("error", derive(infos, ev), "workiq"), "error", "a checked state is kept");
});
