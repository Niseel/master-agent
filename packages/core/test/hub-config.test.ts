import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readerAgents } from "../src/agents.ts";
import { loadConfig } from "../src/config.ts";
import { buildAgents, defaultHubFile, effectiveConfig, GATE_KINDS, HubFile, importMcpJson } from "../src/hub-config.ts";

const root = path.resolve(import.meta.dirname, "../../..");
const cfg = async (runtime: "mock" | "copilot" = "mock") => ({ ...(await loadConfig(root)), runtime });

test("no file: the built-in gates and agents, exactly as before", async () => {
  const c = await cfg();
  const built = buildAgents(c, defaultHubFile(c));
  const presets = readerAgents(c);
  assert.deepEqual(built.map((a) => a.name), presets.map((a) => a.name));
  for (const [i, a] of built.entries()) {
    assert.deepEqual(a.readTools, presets[i].readTools, a.name);
    assert.deepEqual(Object.keys(a.mcpServers), Object.keys(presets[i].mcpServers), a.name);
    assert.equal(a.prompt, presets[i].prompt, a.name);
  }
});

test("buildAgents: unticked tools drop out, writes never pass, a second ADO gate gets its own prefix, edits apply", async () => {
  const c = await cfg();
  const file = HubFile.parse({
    servers: {
      ado: { preset: "ado", tools: ["wit_work_item", "wit_query", "wit_work_item_write"] },
      ado2: { preset: "ado" },
      notes: { type: "stdio", command: "notes-mcp", tools: ["list_notes", "delete_note"] },
      broken: { type: "http", url: "ftp://x" },
    },
    agents: {
      "board-reader": { preset: "board-reader", servers: ["ado"], todoRule: "chỉ bug P1" },
      "board-2": { preset: "board-reader", servers: ["ado2"], displayName: "Board khách hàng" },
      "notes-reader": { servers: ["notes"], displayName: "Ghi chú", task: "Đọc ghi chú mới." },
      "bad-reader": { servers: ["broken", "nope"] },
      "off-reader": { preset: "comms-reader", servers: ["ado"], enabled: false },
    },
  });
  const by = Object.fromEntries(buildAgents(c, file).map((a) => [a.name, a]));
  assert.ok(!by["off-reader"], "disabled agents do not run");
  assert.deepEqual(by["board-reader"].readTools, ["ado-wit_work_item", "ado-wit_query"], "only ticked, never the write");
  assert.equal(by["board-reader"].todoRule, "chỉ bug P1");
  assert.match(by["board-reader"].prompt, /Việc cần làm \(isTodo = true\) khi: chỉ bug P1$/);
  assert.match(by["board-reader"].prompt, /^Bạn là agent đọc board Azure DevOps\./, "the preset's role stays");
  const b2 = by["board-2"].readTools as string[];
  assert.ok(b2.every((t) => t.startsWith("ado2-")) && b2.includes("ado2-wit_work_item"));
  assert.equal(by["board-2"].displayName, "Board khách hàng");
  assert.deepEqual(by["notes-reader"].readTools, ["notes-list_notes"], "custom: every ticked read tool");
  assert.equal(by["notes-reader"].task, "Đọc ghi chú mới.");
  assert.match(by["bad-reader"].missingConfig!, /Cổng broken thiếu URL http\(s\); .*Không có cổng nope/);
});

test("effectiveConfig: values from the file win over .env; real runs report missing settings", async () => {
  const c = await cfg("copilot");
  const file = { ...defaultHubFile(c), values: { "ado.org": "contoso", "ado.project": "Orders", "github.repos": "https://github.com/a/b.git, c/d" } };
  const eff = effectiveConfig({ ...c, ado: { org: "", project: "" } }, file);
  assert.deepEqual(eff.ado, { org: "contoso", project: "Orders" });
  assert.deepEqual(eff.github.repos, ["a/b", "c/d"]);
  const agents = buildAgents({ ...c, ado: { org: "", project: "" }, azure: { subscriptions: [], workspaces: [] } }, { ...file, values: {} });
  assert.match(agents.find((a) => a.name === "board-reader")!.missingConfig!, /ADO_ORG/);
  assert.match(agents.find((a) => a.name === "cloud-reader")!.missingConfig!, /AZURE_SUBSCRIPTION/);
  for (const k of GATE_KINDS) for (const f of k.fields) assert.ok(f.what && f.fill && f.where && f.why, `${k.preset} ${f.key} answers the four questions`);
});

test("importMcpJson: VS Code mcp.json with comments; secrets become keychain inputs, never stored", () => {
  const text = `{
    // my servers
    "servers": {
      "My Notes": { "command": "npx", "args": ["-y", "notes-mcp"], "env": { "NOTES_TOKEN": "s3cr3t", "MODE": "ro" } },
      "jira": { "type": "http", "url": "https://jira.example/mcp", "headers": { "Authorization": "Bearer abc123" }, },
      "weird": { "foo": 1 }
    },
    "inputs": []
  }`;
  const r = importMcpJson(text);
  assert.deepEqual(Object.keys(r.catalog), ["my_notes", "jira"]);
  assert.equal(r.catalog.my_notes.env?.NOTES_TOKEN, "${input:my_notes_notes_token}");
  assert.equal(r.catalog.my_notes.env?.MODE, "ro");
  assert.equal(r.catalog.jira.headers?.Authorization, "Bearer ${input:jira_authorization}");
  assert.ok(!JSON.stringify(r.catalog).includes("s3cr3t") && !JSON.stringify(r.catalog).includes("abc123"));
  assert.deepEqual(r.inputs.map((i) => [i.id, i.password]), [["my_notes_notes_token", true], ["jira_authorization", true]]);
  assert.match(r.skipped[0], /^weird:/);
});
