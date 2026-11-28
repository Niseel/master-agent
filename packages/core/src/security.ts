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
 * Writers (Phase 3): their writeTools always "ask" (approval queue), their readTools are allowed, the rest denied.
 * Testers (Phase 4): listed browser tools are allowed; `browser_navigate` only to allowedOrigins (needs `args`).
 */
export function decide(agent: AgentSpec, tool: string, args?: unknown): { decision: Decision; reason: string } {
  const own = Object.keys(agent.mcpServers).some((k) => tool.startsWith(`${k}-`));
  if (!own) return { decision: "deny", reason: `Tool ${tool} không thuộc MCP server của ${agent.name}` };
  if (agent.kind === "tester") {
    if (agent.readTools === "*" || !agent.readTools.includes(tool)) {
      return { decision: "deny", reason: `Tool ${tool} không có trong danh sách tool của ${agent.name}` };
    }
    if (tool.endsWith("-browser_navigate")) {
      const origin = originOf((args as { url?: unknown } | undefined)?.url);
      if (!origin || !agent.allowedOrigins?.includes(origin)) {
        return { decision: "deny", reason: `URL ngoài trang được kiểm (chỉ ${agent.allowedOrigins?.join(", ") || "không có"})` };
      }
    }
    return { decision: "allow", reason: "Trong allowlist" };
  }
  if (agent.kind === "writer") {
    if (agent.writeTools?.includes(tool)) {
      const allowed = agent.allowedActions?.[tool];
      const action = (args as { action?: unknown } | undefined)?.action;
      if (allowed && !(typeof action === "string" && allowed.includes(action))) {
        return { decision: "deny", reason: `${tool} chỉ được action: ${allowed.join(", ")} (nhận: ${typeof action === "string" ? action : "không có"})` };
      }
      return { decision: "ask", reason: "Tool ghi cần người duyệt" };
    }
    return agent.readTools !== "*" && agent.readTools.includes(tool)
      ? { decision: "allow", reason: "Trong allowlist" }
      : { decision: "deny", reason: `Tool ${tool} không có trong danh sách tool của ${agent.name}` };
  }
  if (agent.readTools !== "*") {
    return agent.readTools.includes(tool)
      ? { decision: "allow", reason: "Trong allowlist" }
      : { decision: "deny", reason: `Tool ${tool} không có trong allowlist của ${agent.name}` };
  }
  return looksLikeWrite(tool)
    ? { decision: "deny", reason: `Agent đọc không được gọi tool ghi (${tool})` }
    : { decision: "allow", reason: "Tool đọc (heuristic, chưa có allowlist)" };
}

export { DENIED_PREFIX } from "./hints.ts";

/**
 * Found at Work run 11: after the user rejected a write, the writer sent the same write again (empty body). One reject
 * ends the run's writes: any later write of that agent in the same run is denied without reaching the approval queue.
 */
export const AFTER_REJECT = "Người dùng đã từ chối một yêu cầu ghi trong lượt này: không gửi lại, kết thúc và báo lý do";
export const stopAfterReject = (d: { decision: Decision; reason: string }, rejected: boolean) =>
  rejected && d.decision === "ask" ? { decision: "deny" as const, reason: AFTER_REJECT } : d;

/** `https://host:port` of an http(s) URL, else null (file:, javascript:, data:, garbage). */
export function originOf(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Extra text for the model when a call is denied: the tools it may call. The model sees this reason and fixes a
 * guessed tool name on its next try (found at Work: `github-list`, `github-list_workflow_runs_placeholder`).
 * Kept out of the audit/report reason so those stay short.
 */
export const denyHint = (agent: AgentSpec) =>
  agent.readTools === "*" ? "" : ` Chỉ dùng các tool: ${[...agent.readTools, ...(agent.writeTools ?? [])].join(", ")}.`;

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
