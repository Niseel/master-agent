import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { adoConfigDirProblem, readerAgents, type AgentSpec } from "../src/agents.ts";
import { loadConfig, normalizeRepo } from "../src/config.ts";
import { mcpAuth, waitForMcp } from "../src/runtime/sdk.ts";
import { audit, decide, looksLikeWrite, redact } from "../src/security.ts";

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
    ["cloud-reader", "azure-monitor", "allow"],
    ["cloud-reader", "azure-monitor_alert_dismiss", "deny"],
  ];
  for (const [n, t, want] of cases) assert.equal(decide(agent(n), t).decision, want, `${n} ${t}`);
  // azure-monitor sub-commands are only kept read-only by the server flag.
  const azure = agent("cloud-reader").mcpServers.azure as { args: string[]; env?: Record<string, string> };
  assert.ok(azure.args.includes("--read-only"));
  // Azure MCP must use the `az login` identity, not whatever DefaultAzureCredential finds first.
  assert.equal(azure.env?.AZURE_TOKEN_CREDENTIALS, "AzureCliCredential");
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

test("azure: comma-separated subscriptions pair with workspaces by index; one subscription applies to all", async () => {
  const saved = { s: process.env.AZURE_SUBSCRIPTION, w: process.env.AZURE_LOG_WORKSPACE };
  try {
    process.env.AZURE_SUBSCRIPTION = " s1 , s2 ,";
    process.env.AZURE_LOG_WORKSPACE = "w1,w2";
    assert.deepEqual((await loadConfig(root)).azure, { subscriptions: ["s1", "s2"], workspaces: ["w1", "w2"] });
  } finally {
    for (const [k, v] of [["AZURE_SUBSCRIPTION", saved.s], ["AZURE_LOG_WORKSPACE", saved.w]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const base = { ...(await loadConfig(root)), runtime: "copilot" as const };
  const cloud = (subscriptions: string[], workspaces: string[]) =>
    readerAgents({ ...base, azure: { subscriptions, workspaces } }).find((a) => a.name === "cloud-reader")!;
  assert.match(cloud(["s1", "s2"], ["w1", "w2"]).task, /"w1" \(subscription s1\), "w2" \(subscription s2\)\./);
  assert.match(cloud(["s1"], ["w1", "w2"]).task, /"w1" \(subscription s1\), "w2" \(subscription s1\)\./);
  assert.equal(cloud(["s1"], ["w1", "w2"]).missingConfig, undefined);
  assert.match(cloud(["s1", "s2"], ["w1"]).missingConfig!, /^Chưa cấu hình đúng AZURE_SUBSCRIPTION/);
  assert.match(cloud([], ["w1"]).missingConfig!, /^Chưa cấu hình AZURE_SUBSCRIPTION \/ AZURE_LOG_WORKSPACE/);
});

test("audit goes to AGENTHUB_LOG_DIR (temp dir under pnpm test), never logs/", () => {
  const dir = process.env.AGENTHUB_LOG_DIR;
  assert.ok(dir && !path.resolve(dir).startsWith(path.join(root, "logs")), "scripts/test-setup.ts sets a temp dir");
  audit(root, { agent: "test", tool: "x-y", args: { token: "s" }, decision: "deny" });
  const file = path.join(dir, `audit-${new Date().toISOString().slice(0, 10)}.jsonl`);
  assert.match(readFileSync(file, "utf8"), /"token":"\*\*\*"/);
});
