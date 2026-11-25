import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { AgentSpec } from "./agents.ts";

export type Decision = "allow" | "deny" | "ask";

// Words that mark a tool as a write. Matched per name segment, so "list_workflow_runs" stays a read.
const WRITE_WORDS = new Set(
  ("create update delete remove send post reply forward write merge close reopen assign add edit patch " +
    "set move approve dismiss run rerun trigger cancel push upload comment star fork transfer lock " +
    "restart start stop deploy scale invoke execute mark resolve").split(" "),
);

/** Split `ado-wit_updateWorkItem` into [ado, wit, update, work, item]. */
const segments = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

export const looksLikeWrite = (tool: string) => segments(tool).some((s) => WRITE_WORDS.has(s));

/**
 * The approval gate. `tool` is the runtime name `<server-key>-<tool>`.
 * Readers: allow only their own servers' read tools, deny everything else.
 * Writers (Phase 3): always "ask" -> approval queue.
 */
export function decide(agent: AgentSpec, tool: string): { decision: Decision; reason: string } {
  const own = Object.keys(agent.mcpServers).some((k) => tool.startsWith(`${k}-`));
  if (!own) return { decision: "deny", reason: `Tool ${tool} không thuộc MCP server của ${agent.name}` };
  if (agent.kind === "writer") return { decision: "ask", reason: "Tool ghi cần người duyệt" };
  if (agent.readTools !== "*") {
    return agent.readTools.includes(tool)
      ? { decision: "allow", reason: "Trong allowlist" }
      : { decision: "deny", reason: `Tool ${tool} không có trong allowlist của ${agent.name}` };
  }
  return looksLikeWrite(tool)
    ? { decision: "deny", reason: `Agent đọc không được gọi tool ghi (${tool})` }
    : { decision: "allow", reason: "Tool đọc (heuristic, chưa có allowlist)" };
}

const SECRET_KEY = /token|secret|password|passwd|api[-_]?key|authorization|cookie|credential/i;

/** Deep-copy `value`, replacing secret-looking fields with "***". */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? "***" : redact(v)]),
    );
  }
  return value;
}

/** Append one line to <AGENTHUB_LOG_DIR or root/logs>/audit-YYYY-MM-DD.jsonl. Tests set AGENTHUB_LOG_DIR to a temp dir. */
export function audit(root: string, entry: { agent: string; tool: string; args: unknown; decision: string; reason?: string }) {
  const dir = process.env.AGENTHUB_LOG_DIR || path.join(root, "logs");
  mkdirSync(dir, { recursive: true });
  const now = new Date();
  const line = JSON.stringify({ at: now.toISOString(), ...entry, args: redact(entry.args) });
  appendFileSync(path.join(dir, `audit-${now.toISOString().slice(0, 10)}.jsonl`), line + "\n");
}
