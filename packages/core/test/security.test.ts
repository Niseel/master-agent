import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { adoConfigDirProblem, readerAgents, type AgentSpec } from "../src/agents.ts";
import { loadConfig, normalizeRepo } from "../src/config.ts";
import { mcpAuth, waitForMcp } from "../src/runtime/sdk.ts";
import { decide, looksLikeWrite, redact } from "../src/security.ts";

const root = path.resolve(import.meta.dirname, "../../..");

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

test("copilot allowlists: built-in and write/state tools are denied", async () => {
  const cfg = { ...(await loadConfig(root)), runtime: "copilot" as const, ado: { org: "o", project: "p" } };
  const agent = (n: string) => readerAgents(cfg).find((a) => a.name === n)!;
  const cases: [string, string, "allow" | "deny"][] = [
    ["code-reader", "github-search_pull_requests", "allow"],
    ["code-reader", "github-mcp-server-list_copilot_spaces", "deny"],
    ["code-reader", "github-run_secret_scanning", "deny"],
    ["code-reader", "github-get_copilot_job_status", "deny"],
    ["comms-reader", "workiq-retrieve", "allow"],
    ["comms-reader", "workiq-do_action", "deny"],
    ["comms-reader", "workiq-accept_eula", "deny"],
    ["comms-reader", "workiq-create_entity", "deny"],
    ["board-reader", "ado-wit_query", "allow"],
    ["board-reader", "github-mcp-server-get_me", "deny"],
  ];
  for (const [n, t, want] of cases) assert.equal(decide(agent(n), t).decision, want, `${n} ${t}`);
});

test("mcpAuth only hands out tokens for known origins", async () => {
  const req = { serverName: "x", serverUrl: "https://example.com/mcp" } as Parameters<typeof mcpAuth>[0];
  const r = await mcpAuth(req, { sessionId: "s" });
  assert.deepEqual(r, { kind: "cancelled" });
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

test("waitForMcp: stops once servers connect, or when time runs out", async () => {
  const fake = (statuses: string[]) => {
    let i = 0;
    const session = {
      rpc: { mcp: { list: async () => ({ servers: [{ name: "ado", status: statuses[Math.min(i++, statuses.length - 1)] }] }) } },
    } as unknown as Parameters<typeof waitForMcp>[0];
    return { session, calls: () => i };
  };
  const ok = fake(["pending", "needs-auth", "connected"]);
  assert.deepEqual(await waitForMcp(ok.session, ["ado"], 1000, 1), []);
  assert.equal(ok.calls(), 3);
  const stuck = fake(["needs-auth"]);
  assert.deepEqual(await waitForMcp(stuck.session, ["ado"], 20, 5), ["ado"]);
  assert.deepEqual(await waitForMcp(fake(["failed"]).session, ["ado"], 1000, 1), []); // failed = settled, not connecting
});

test("adoConfigDirProblem: relative or missing dir is reported", () => {
  assert.equal(adoConfigDirProblem(undefined), undefined);
  assert.match(adoConfigDirProblem(".azure-ado")!, /tuyệt đối/);
  assert.match(adoConfigDirProblem(path.join(root, "no-such-dir"))!, /không tồn tại/);
  assert.equal(adoConfigDirProblem(root), undefined);
});

test("normalizeRepo: URL, .git and slashes become owner/repo", () => {
  for (const s of ["https://github.com/o/r", "https://github.com/o/r.git", "http://www.github.com/o/r/", " o/r ", "o/r.git"]) {
    assert.equal(normalizeRepo(s), "o/r", s);
  }
});
