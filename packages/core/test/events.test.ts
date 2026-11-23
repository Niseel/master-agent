import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEvent } from "@github/copilot-sdk";
import { mapSdkEvent } from "../src/events.ts";

const ev = (type: string, data: object) => ({ type, data }) as unknown as SessionEvent;

test("tool start/complete map to tool.* with MCP server and tool name", () => {
  assert.deepEqual(
    mapSdkEvent("code-reader", ev("tool.execution_start", { toolCallId: "1", toolName: "github-list_prs", mcpServerName: "github", mcpToolName: "list_prs" })),
    { type: "tool.started", agent: "code-reader", server: "github", tool: "list_prs", callId: "1" },
  );
  assert.deepEqual(mapSdkEvent("a", ev("tool.execution_complete", { toolCallId: "1", success: false })), {
    type: "tool.completed",
    callId: "1",
    ok: false,
  });
});

test("errors, budget and messages", () => {
  assert.deepEqual(mapSdkEvent("a", ev("session.error", { message: "boom", errorType: "x" })), {
    type: "agent.failed",
    agent: "a",
    error: "boom",
  });
  assert.deepEqual(mapSdkEvent("a", ev("session_limits_exhausted.requested", { requestId: "r", usedAiCredits: 2, maxAiCredits: 2 })), {
    type: "usage",
    agent: "a",
    usedAiCredits: 2,
    maxAiCredits: 2,
  });
  assert.equal(mapSdkEvent("a", ev("assistant.message_delta", { deltaContent: "x" })), null);
});
