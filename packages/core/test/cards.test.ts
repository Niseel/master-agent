import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readerAgents } from "../src/agents.ts";
import { cardsMarkdown, mergeCards, quadrant, sortCards, viewCards, type CardStates } from "../src/cards.ts";
import { loadConfig } from "../src/config.ts";
import { summarize } from "../src/report.ts";
import { MockRuntime } from "../src/runtime/mock.ts";
import type { HubEvent } from "../src/events.ts";
import { item } from "./helpers.ts";

const root = path.resolve(import.meta.dirname, "../../..");

test("quadrant: Eisenhower 1 do, 2 schedule, 3 quick or delegate, 4 later", () => {
  assert.deepEqual([quadrant(true, true), quadrant(true, false), quadrant(false, true), quadrant(false, false)], [1, 2, 3, 4]);
});

test("mergeCards: same work across sources becomes one card; the work item or PR leads; phishing never merges", () => {
  const cards = mergeCards([
    item({ source: "teams", ref: "t1", isTodo: true, urgent: true, related: ["ado:1234"], todos: ["chat step"], timestamp: "2026-11-23T07:00:00Z" }),
    item({ source: "ado", ref: "1234", important: true, priority: 2, dueDate: "2026-11-28", timestamp: "2026-11-22T16:00:00Z" }),
    item({ source: "ado", ref: "orders!42", related: ["ado:1234"], priority: 3, dueDate: "2026-11-27" }),
    // Two chats about a PR that this run did not return still merge through the shared ref.
    item({ source: "teams", ref: "t2", related: ["github:orders#87"] }),
    item({ source: "outlook", ref: "m5", related: ["github:orders#87"] }),
    item({ source: "outlook", ref: "m2", phishing: true, related: ["ado:1234"] }),
  ]);
  assert.equal(cards.length, 3);
  const story = cards.find((c) => c.key === "ado:1234")!;
  assert.deepEqual(story.items.map((i) => i.ref), ["1234", "orders!42", "t1"], "work item first, chat last");
  assert.equal(story.isTodo, true, "a to-do if any of its items is");
  assert.equal(story.quadrant, 1, "important from the work item, urgent from the chat");
  assert.equal(story.priority, 2);
  assert.equal(story.dueDate, "2026-11-27", "earliest deadline");
  assert.deepEqual(story.todos, ["chat step"], "first item that has steps");
  assert.equal(story.updatedAt, "2026-11-23T07:00:00Z");
  assert.equal(cards.find((c) => c.key === "teams:t2")?.items.length, 2);
  assert.equal(cards.find((c) => c.phishing)?.items.length, 1, "phishing stays alone");
});

test("sortCards: quadrant, then ADO Priority, then deadline", () => {
  const cards = mergeCards([
    item({ source: "ado", ref: "a", important: true, priority: 3 }),
    item({ source: "ado", ref: "b", important: true, priority: 1, dueDate: "2026-12-10" }),
    item({ source: "ado", ref: "c", important: true, priority: 1, dueDate: "2026-12-01" }),
    item({ source: "ado", ref: "d", important: true, urgent: true }),
    item({ source: "ado", ref: "e" }),
  ]);
  assert.deepEqual(sortCards(cards).map((c) => c.items[0].ref), ["d", "c", "b", "a", "e"]);
});

test("viewCards: done stays done until the source changes; edits replace the suggestion; state found by any ref", () => {
  const cards = mergeCards([
    item({ source: "ado", ref: "1", isTodo: true, todos: ["x"], timestamp: "2026-11-23T08:00:00Z" }),
    item({ source: "ado", ref: "2", isTodo: true, timestamp: "2026-11-23T08:00:00Z" }),
    item({ source: "teams", ref: "t", isTodo: true, related: ["ado:3"], timestamp: "2026-11-23T09:00:00Z" }),
    item({ source: "ado", ref: "4", isTodo: true }),
  ]);
  const states: CardStates = {
    "ado:1": { status: "done", at: "x", seen: "2026-11-23T08:00:00Z", todos: [{ text: "mine", done: true, struck: false }] },
    "ado:2": { status: "done", at: "x", seen: "2026-11-22T08:00:00Z" },
    // Saved under the chat's ref when the card had no work item; today the work item leads.
    "teams:t": { status: "hidden", at: "x", seen: "2026-11-23T09:00:00Z" },
  };
  const v = Object.fromEntries(viewCards(cards, states, new Set(["ado:4"])).map((c) => [c.key, c]));
  assert.equal(v["ado:1"].state, "done");
  assert.deepEqual(v["ado:1"].steps, [{ text: "mine", done: true, struck: false }]);
  assert.equal(v["ado:2"].state, "updated", "changed after it was marked done");
  assert.equal(v["teams:t"].state, "hidden");
  assert.deepEqual(v["ado:4"].steps, []);
  assert.equal(v["ado:4"].isNew, false);
  assert.equal(v["ado:1"].isNew, true);
});

test("brief-ok (mock): 12 items become 9 cards; story #1234 merges board, repos and Teams", async () => {
  process.env.AGENTHUB_RUNTIME = "mock";
  process.env.AGENTHUB_SCENARIO = "brief-ok";
  const cfg = await loadConfig(root);
  const events: HubEvent[] = [];
  for await (const e of new MockRuntime(cfg).run({ prompt: "check việc", agents: readerAgents(cfg), budget: 150 })) events.push(e);
  const { cards } = summarize(events);
  assert.equal(cards.length, 9);
  assert.deepEqual(cards.find((c) => c.key === "ado:1234")?.items.map((i) => `${i.source}:${i.ref}`), ["ado:1234", "ado:orders!42", "teams:t1"]);
  assert.deepEqual(cards.find((c) => c.key === "github:orders#87")?.items.map((i) => i.source), ["github", "teams"]);
  const md = cardsMarkdown(viewCards(cards, {}), "2026-11-23");
  assert.match(md, /^# Việc cần làm — 2026-11-23/);
  assert.ok(md.indexOf("## Làm ngay") < md.indexOf("## Lên lịch"));
  assert.match(md, /- \[ \] \*\*\[CI fail trên main\]\(https:\/\/github\.com\/me\/orders\/actions\/runs\/1\)\*\*/);
  assert.match(md, /## Nghi lừa đảo[\s\S]*token/);
  assert.ok(!md.includes("Bản tin"), "not a to-do: left out");
});
