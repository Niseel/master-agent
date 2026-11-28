import type { SessionEvent } from "@github/copilot-sdk";
import type { BriefItem } from "./brief.ts";
import type { WorkItem } from "./wit.ts";

/** Internal event stream. Every runtime (mock / byok / copilot) emits only these. */
export type HubEvent =
  | { type: "agent.started"; agent: string; at: string }
  | { type: "agent.completed"; agent: string; durationMs?: number; tokens?: number }
  | { type: "agent.failed"; agent: string; error: string }
  | { type: "agent.result"; agent: string; items: BriefItem[] }
  /** wit-reader: every field of one ADO work item. */
  | { type: "workitem.result"; agent: string; item: WorkItem }
  /** `args` is set by the mock runtime only (scenario files). */
  | { type: "tool.started"; agent: string; server: string; tool: string; callId: string; args?: unknown }
  | { type: "tool.completed"; callId: string; ok: boolean; error?: string }
  | { type: "usage"; agent?: string; usedAiCredits: number; maxAiCredits: number }
  | { type: "message"; agent: string; text: string };

/**
 * Map one Copilot SDK session event to a HubEvent (or null = ignore).
 * One session per agent, so `agent` comes from the caller, not the event.
 */
export function mapSdkEvent(agent: string, ev: SessionEvent): HubEvent | null {
  switch (ev.type) {
    case "tool.execution_start": {
      const d = ev.data;
      return {
        type: "tool.started",
        agent,
        server: d.mcpServerName ?? "builtin",
        tool: d.mcpToolName ?? d.toolName,
        callId: d.toolCallId,
      };
    }
    case "tool.execution_complete":
      return {
        type: "tool.completed",
        callId: ev.data.toolCallId,
        ok: ev.data.success,
        ...(ev.data.error ? { error: ev.data.error.message } : {}),
      };
    case "session.error":
      return { type: "agent.failed", agent, error: ev.data.message };
    case "session_limits_exhausted.requested":
      return {
        type: "usage",
        agent,
        usedAiCredits: ev.data.usedAiCredits,
        maxAiCredits: ev.data.maxAiCredits,
      };
    case "session.usage_checkpoint":
      // ponytail: assumes 1 AI Credit = 1e9 nano-AIU. [Work] verify against the GitHub billing page.
      return { type: "usage", agent, usedAiCredits: ev.data.totalNanoAiu / 1e9, maxAiCredits: 0 };
    case "assistant.message":
      // The structured answer ({"items":...}) arrives as a message too; it is shown from its own event
      // (agent.result, workitem.result). Found at Work run 11: raw JSON under "Thông báo".
      return ev.data.content && !isJsonObject(ev.data.content) ? { type: "message", agent, text: ev.data.content } : null;
    default:
      return null;
  }
}

function isJsonObject(text: string) {
  const t = text.trim();
  if (!t.startsWith("{")) return false;
  try {
    return typeof JSON.parse(t) === "object";
  } catch {
    return false;
  }
}
