import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.ts";
import type { HubEvent } from "../src/events.ts";
import { MockRuntime } from "../src/runtime/mock.ts";
import { decide } from "../src/security.ts";
import { DIRECT_READ_OK, htmlLines, lines, witReader, WorkItem, workItemFrom } from "../src/wit.ts";

const root = path.resolve(import.meta.dirname, "../../..");

test("htmlLines + lines: ADO rich text to verbatim lines", () => {
  const html = "<ul><li>A &quot;x&quot; &amp; y</li><li>B&nbsp;&lt;3</li></ul><div>3. C&#39;s<br></div><div>&nbsp;</div>";
  assert.deepEqual(lines(htmlLines(html)), ['A "x" & y', "B <3", "C's"]);
});

test("workItemFrom: every field from a wit_work_item result (MCP content text), identity and tags parsed", () => {
  const wi = {
    id: 7,
    fields: {
      "System.Title": "T",
      "System.State": "Active",
      "System.WorkItemType": "Bug",
      "System.AssignedTo": { displayName: "A B", uniqueName: "a@example.com" },
      "System.Tags": "x; y",
      "Microsoft.VSTS.Common.Priority": 1,
      "Microsoft.VSTS.Scheduling.StoryPoints": 3,
      "Microsoft.VSTS.Scheduling.DueDate": "2026-12-01T00:00:00Z",
      "System.Description": "<p>Một</p><p>Hai</p>",
    },
    _links: { html: { href: "https://dev.azure.com/o/p/_workitems/edit/7" } },
  };
  const item = workItemFrom({ content: [{ type: "text", text: JSON.stringify(wi) }] })!;
  assert.ok(WorkItem.safeParse(item).success);
  assert.equal(item.id, 7);
  assert.equal(item.assignedTo, "A B");
  assert.deepEqual(item.tags, ["x", "y"]);
  assert.equal(item.priority, 1);
  assert.equal(item.dueDate, "2026-12-01T00:00:00Z");
  assert.equal(item.description, "Một\nHai");
  assert.deepEqual(item.acceptanceCriteria, []);
  assert.equal(item.remainingWork, null);
  assert.equal(item.url, "https://dev.azure.com/o/p/_workitems/edit/7");
  assert.equal(workItemFrom({ content: [{ type: "text", text: "not json" }] }), null);
});

test("wit-reader: one read tool only; mock e2e reads the work item directly, the model answer is skipped", async () => {
  process.env.AGENTHUB_RUNTIME = "mock";
  const cfg = await loadConfig(root);
  const spec = witReader(cfg, 1234);
  assert.deepEqual(spec.readTools, ["ado-wit_work_item"]);
  assert.equal(decide(spec, "ado-wit_query").decision, "deny");
  assert.deepEqual(spec.directRead?.args, { action: "get", id: 1234, ...(cfg.ado.project ? { project: cfg.ado.project } : {}) });
  const events: HubEvent[] = [];
  for await (const e of new MockRuntime(cfg).run({ prompt: "", agents: [spec], budget: 30, scenario: "wit-reader" })) events.push(e);
  const results = events.filter((e) => e.type === "workitem.result");
  assert.equal(results.length, 1, "the scenario's model fallback is not replayed");
  const item = (results[0] as Extract<HubEvent, { type: "workitem.result" }>).item;
  assert.equal(item.state, "Active");
  assert.equal(item.storyPoints, 5);
  assert.equal(item.acceptanceCriteria.length, 3);
  assert.equal(item.acceptanceCriteria[0], 'Trang đơn hàng có nút "Hoàn tiền một phần" với đơn đã thanh toán');
  assert.ok(events.some((e) => e.type === "message" && e.text === DIRECT_READ_OK));
});
