import { randomUUID } from "node:crypto";
import {
  CopilotClient,
  type CopilotSession,
  type PermissionRequest,
  type PermissionRequestResult,
  type SessionHooks,
} from "@github/copilot-sdk";
import type { AgentSpec } from "../agents.ts";
import { AgentResult } from "../brief.ts";
import type { HubConfig } from "../config.ts";
import { mapSdkEvent, type HubEvent } from "../events.ts";
import { audit, decide } from "../security.ts";
import { ApprovalBox, EventQueue, type AgentRuntime, type RunInput } from "./index.ts";

type PreToolUseHookOutput = Exclude<Awaited<ReturnType<NonNullable<SessionHooks["onPreToolUse"]>>>, void>;
/** Found at Home 2026-11-23: "Minimum session limit is 30 AI credits." */
export const MIN_SESSION_CREDITS = 30;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Real Copilot SDK runtime. Used for both:
 *  - "copilot": company Copilot license (logged-in `copilot` CLI user), real MCP servers.
 *  - "byok":    same code; model via ANTHROPIC_API_KEY if set (else personal Copilot login),
 *               Work IQ + Azure replaced by packages/mock-mcp.
 * One session per agent: each agent sees only its own MCP servers and its own budget slice.
 */
export class SdkRuntime implements AgentRuntime {
  private client: CopilotClient | null = null;
  private sessions = new Set<CopilotSession>();
  private approvals = new ApprovalBox();
  /** toolCallIds the user approved in onPreToolUse; onPermissionRequest lets only these through for writers. */
  private approvedCalls = new Set<string>();

  constructor(private cfg: HubConfig) {}

  run(input: RunInput): AsyncIterable<HubEvent> {
    const q = new EventQueue<HubEvent>();
    void (async () => {
      try {
        this.client ??= new CopilotClient();
        await this.client.start();
        const live = input.agents.filter((a) => !a.missingConfig).length || 1;
        // The runtime rejects sessionLimits.maxAiCredits below MIN_SESSION_CREDITS.
        const perAgent = Math.max(MIN_SESSION_CREDITS, input.budget / live);
        await Promise.allSettled(input.agents.map((a) => this.runAgent(a, input, perAgent, q)));
      } catch (e) {
        q.push({ type: "agent.failed", agent: "orchestrator", error: errMsg(e) });
      } finally {
        q.close();
      }
    })();
    return q;
  }

  private async runAgent(a: AgentSpec, input: RunInput, budget: number, q: EventQueue<HubEvent>) {
    if (a.missingConfig) return q.push({ type: "agent.failed", agent: a.name, error: a.missingConfig });
    const t0 = Date.now();
    q.push({ type: "agent.started", agent: a.name, at: new Date().toISOString() });
    const { byok } = this.cfg;
    let session: CopilotSession | undefined;
    try {
      session = await this.client!.createSession({
        clientName: "agent-hub",
        model: a.model ?? this.cfg.model ?? undefined,
        provider:
          this.cfg.runtime === "byok" && byok.apiKey
            ? { type: "anthropic", baseUrl: byok.baseUrl, apiKey: byok.apiKey }
            : undefined,
        systemMessage: { mode: "append", content: a.prompt },
        mcpServers: a.mcpServers,
        // No built-in shell/file/web tools: MCP tools only, and no built-in sub-agents.
        availableTools: ["mcp:*"],
        includedBuiltinAgents: [],
        skipCustomInstructions: true,
        sessionLimits: { maxAiCredits: budget },
        hooks: { onPreToolUse: (h) => this.gate(a, h.toolName, h.toolArgs, h.toolCallId, q) },
        onPermissionRequest: (req) => this.permission(a, req),
      });
      this.sessions.add(session);
      const s = session;
      s.on((ev) => {
        const h = mapSdkEvent(a.name, ev);
        if (h?.type === "usage" && !h.maxAiCredits) h.maxAiCredits = budget;
        if (h) q.push(h);
        // Budget hit: stop this agent. Never raise the limit automatically (PLAN §5.8).
        if (ev.type === "session_limits_exhausted.requested") void s.abort();
      });
      const result = await s.sendAndWait({ prompt: `${input.prompt}\n\n${a.task}` }, AgentResult, this.cfg.timeoutMs);
      q.push({ type: "agent.result", agent: a.name, items: result.items });
      q.push({ type: "agent.completed", agent: a.name, durationMs: Date.now() - t0 });
    } catch (e) {
      q.push({ type: "agent.failed", agent: a.name, error: errMsg(e) });
    } finally {
      if (session) {
        this.sessions.delete(session);
        await session.disconnect().catch(() => {});
      }
    }
  }

  /** onPreToolUse: the approval gate. Write tools wait for the user on the approval queue. */
  private async gate(
    a: AgentSpec,
    tool: string,
    args: unknown,
    callId: string | undefined,
    q: EventQueue<HubEvent>,
  ): Promise<PreToolUseHookOutput> {
    const { decision, reason } = decide(a, tool);
    audit(this.cfg.root, { agent: a.name, tool, args, decision, reason });
    if (decision !== "ask") return { permissionDecision: decision, permissionDecisionReason: reason };

    const id = callId ?? randomUUID();
    const wait = this.approvals.wait(id);
    q.push({ type: "approval.requested", id, agent: a.name, tool, args });
    const r = await wait;
    q.push({ type: "approval.resolved", id, decision: r.decision });
    audit(this.cfg.root, { agent: a.name, tool, args, decision: r.decision, reason: r.feedback ?? "user" });
    if (r.decision === "reject") {
      return { permissionDecision: "deny", permissionDecisionReason: r.feedback ?? "Người dùng từ chối" };
    }
    this.approvedCalls.add(id);
    return { permissionDecision: "allow", permissionDecisionReason: "Người dùng đã duyệt" };
  }

  /** Second layer: runtime permission prompts. Only MCP tools the gate allows (or the user approved) pass. */
  private permission(a: AgentSpec, req: PermissionRequest): PermissionRequestResult {
    if (req.kind !== "mcp") return { kind: "reject", feedback: "Agent Hub chỉ cho phép tool MCP" };
    const { decision, reason } = decide(a, `${req.serverName}-${req.toolName}`);
    if (decision === "allow") return { kind: "approve-once" };
    if (decision === "ask" && req.toolCallId && this.approvedCalls.delete(req.toolCallId)) return { kind: "approve-once" };
    return { kind: "reject", feedback: reason };
  }

  resolveApproval(id: string, decision: "approve" | "reject", feedback?: string) {
    this.approvals.resolve(id, decision, feedback);
  }

  async stop() {
    this.approvals.rejectAll("Runtime dừng");
    await Promise.allSettled([...this.sessions].map((s) => s.abort()));
    await this.client?.stop();
    this.client = null;
  }
}
