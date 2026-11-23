import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSpec } from "../src/agents.ts";
import { decide, looksLikeWrite, redact } from "../src/security.ts";

const reader: AgentSpec = {
  name: "comms-reader",
  displayName: "x",
  kind: "reader",
  prompt: "",
  task: "",
  mcpServers: { workiq: { command: "x" } },
  readTools: "*",
};

test("reader: write tools are always denied", () => {
  for (const t of ["workiq-mail_send", "workiq-sendMessage", "workiq-reply_to_chat", "workiq-delete_mail"]) {
    assert.equal(decide(reader, t).decision, "deny", t);
  }
});

test("reader: read tools of own server are allowed", () => {
  assert.equal(decide(reader, "workiq-mail_list_unread").decision, "allow");
  assert.equal(looksLikeWrite("github-list_workflow_runs"), false);
});

test("reader: tools of another server are denied", () => {
  assert.equal(decide(reader, "github-list_pull_requests").decision, "deny");
  assert.equal(decide(reader, "github-mcp-server-get_me").decision, "deny");
});

test("reader: explicit allowlist wins over heuristic", () => {
  const a = { ...reader, readTools: ["workiq-mail_list_unread"] };
  assert.equal(decide(a, "workiq-mail_list_unread").decision, "allow");
  assert.equal(decide(a, "workiq-teams_list_unread").decision, "deny");
});

test("writer: every own tool needs approval", () => {
  const w = { ...reader, kind: "writer" as const };
  assert.equal(decide(w, "workiq-mail_send").decision, "ask");
  assert.equal(decide(w, "github-create_pull_request").decision, "deny");
});

test("redact hides secrets at any depth", () => {
  assert.deepEqual(redact({ a: 1, headers: { Authorization: "Bearer x" }, list: [{ apiKey: "k" }] }), {
    a: 1,
    headers: { Authorization: "***" },
    list: [{ apiKey: "***" }],
  });
});
