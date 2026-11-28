import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import {
  CopilotClient,
  type CopilotSession,
  type JsonValue,
  type PermissionRequest,
  type PermissionRequestResult,
  type SessionConfig,
  type SessionHooks,
} from "@github/copilot-sdk";
import { MIN_SESSION_CREDITS, windowPrompt, type AgentSpec } from "../agents.ts";
export { MIN_SESSION_CREDITS };
import { az } from "../auth.ts";
import { AgentResult, dropEmpty, droppedText } from "../brief.ts";
import { DIRECT_READ_FAILED, DIRECT_READ_OK, WorkItem, workItemFrom } from "../wit.ts";
import type { HubConfig } from "../config.ts";
import { mapSdkEvent, type HubEvent } from "../events.ts";
import { audit, decide, denyHint } from "../security.ts";
import { EventQueue, type AgentRuntime, type RunInput } from "./index.ts";

type PreToolUseHookOutput = Exclude<Awaited<ReturnType<NonNullable<SessionHooks["onPreToolUse"]>>>, void>;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Remote MCP servers that sign in with Entra ID, mapped to the only scope we hand them.
 * Found at Work: ADO MCP answers 401 + needs-auth; scope from its /.well-known/oauth-protected-resource.
 * Remote ADO MCP accepts Entra tokens only (no PAT). configDirEnv names an optional separate
 * `az` profile, for when the ADO account differs from the Azure account.
 */
const ENTRA_MCP: Record<string, { scope: string; configDirEnv: string }> = {
  "https://mcp.dev.azure.com": { scope: "https://mcp.dev.azure.com/.default", configDirEnv: "ADO_AZURE_CONFIG_DIR" },
};

/**
 * onMcpAuthRequest: get a token from the logged-in `az` CLI. Unlisted servers are cancelled,
 * so no MCP server can obtain a token for another resource.
 */
export const mcpAuth: NonNullable<SessionConfig["onMcpAuthRequest"]> = async (req) => {
  const srv = ENTRA_MCP[new URL(req.serverUrl).origin];
  if (!srv) return { kind: "cancelled" };
  try {
    const token = await az(["account", "get-access-token", "--scope", srv.scope, "--query", "accessToken", "-o", "tsv"], process.env[srv.configDirEnv]);
    return token ? { kind: "token", accessToken: token } : { kind: "cancelled" };
  } catch {
    return { kind: "cancelled" };
  }
};

/**
 * Found at Work: the first turn can start before an OAuth server (ADO) connects, so the model only
 * sees the built-in tools and ends. Wait (bounded) until none of the agent's servers is still connecting.
 * Returns the names still connecting when time ran out ([] = all settled).
 */
export async function waitForMcp(s: Pick<CopilotSession, "rpc">, names: string[], ms = 60_000, pollMs = 1000) {
  const end = Date.now() + ms;
  for (;;) {
    const { servers } = await s.rpc.mcp.list();
    const connecting = names.filter((n) => {
      const st = servers.find((x) => x.name === n)?.status;
      return !st || st === "pending" || st === "needs-auth";
    });
    if (!connecting.length || Date.now() > end) return connecting;
    await sleep(pollMs);
  }
}

/**
 * Tools the model may see. An explicit allowlist hides everything else, including the SDK's built-in
 * `github-mcp-server-*` MCP tools (found at Work: `mcp:*` matched them, the model called them, the gate denied
 * them, each try cost a model turn). `mcp:<name>` takes the runtime wire name `<server>-<tool>` (toolSet.d.ts).
 * decide() stays the second layer.
 */
export const sessionTools = (a: Pick<AgentSpec, "readTools">) => (a.readTools === "*" ? ["mcp:*"] : a.readTools.map((t) => `mcp:${t}`));

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
        // No built-in shell/file/web tools: only the agent's allowlisted MCP tools, and no built-in sub-agents.
        availableTools: sessionTools(a),
        includedBuiltinAgents: [],
        skipCustomInstructions: true,
        sessionLimits: { maxAiCredits: budget },
        hooks: { onPreToolUse: (h) => this.gate(a, h.toolName, h.toolArgs, q) },
        onPermissionRequest: (req) => this.permission(a, req),
        onMcpAuthRequest: mcpAuth,
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
      const stuck = await waitForMcp(s, Object.keys(a.mcpServers));
      if (stuck.length) q.push({ type: "message", agent: a.name, text: `MCP chưa kết nối sau 60s: ${stuck.join(", ")}` });
      const prompt = [input.prompt, input.window ? windowPrompt(input.window, input.now ? new Date(input.now) : undefined) : "", a.task].filter(Boolean).join("\n\n");
      if (a.output === "workItem") {
        const item = (await this.directWorkItem(s, a, q)) ?? (await s.sendAndWait({ prompt }, WorkItem, this.cfg.timeoutMs));
        q.push({ type: "workitem.result", agent: a.name, item });
      } else {
        const result = await s.sendAndWait({ prompt }, AgentResult, this.cfg.timeoutMs);
        const { items, dropped } = dropEmpty(result.items);
        if (dropped) q.push({ type: "message", agent: a.name, text: droppedText(dropped) });
        q.push({ type: "agent.result", agent: a.name, items });
      }
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

  /**
   * `directRead` of wit-reader: call the tool without a model turn (SDK `rpc.mcp.callTool`, experimental: [Work]
   * verify) and read the fields in code, so the text stays verbatim. null = fall back to the model.
   */
  private async directWorkItem(s: CopilotSession, a: AgentSpec, q: EventQueue<HubEvent>): Promise<WorkItem | null> {
    if (!a.directRead) return null;
    const { server, tool, args } = a.directRead;
    const { decision, reason } = decide(a, `${server}-${tool}`);
    audit(this.cfg.root, { agent: a.name, tool: `${server}-${tool}`, args, decision, reason });
    if (decision !== "allow") return null;
    const callId = randomUUID();
    q.push({ type: "tool.started", agent: a.name, server, tool, callId });
    let r: WorkItem | null = null;
    try {
      const res = await s.rpc.mcp.callTool({ serverName: server, toolName: tool, arguments: args as JsonValue });
      const error = !res ? "Không có kết quả" : res.isError ? JSON.stringify(res.content ?? res).slice(0, 300) : undefined;
      q.push({ type: "tool.completed", callId, ok: !error, ...(error ? { error } : {}) });
      if (!error) r = workItemFrom(res);
    } catch (e) {
      q.push({ type: "tool.completed", callId, ok: false, error: errMsg(e) });
    }
    q.push({ type: "message", agent: a.name, text: r ? DIRECT_READ_OK : DIRECT_READ_FAILED });
    return r;
  }

  /** onPreToolUse: the tool gate. Readers only: allow or deny, never wait. */
  private gate(a: AgentSpec, tool: string, args: unknown, q: EventQueue<HubEvent>): PreToolUseHookOutput {
    const { decision, reason } = decide(a, tool);
    audit(this.cfg.root, { agent: a.name, tool, args, decision, reason });
    if (decision === "allow") return { permissionDecision: decision, permissionDecisionReason: reason };
    q.push({ type: "message", agent: a.name, text: `Bị chặn: ${reason}` });
    return { permissionDecision: decision, permissionDecisionReason: reason + denyHint(a) };
  }

  /** Second layer: runtime permission prompts. Only MCP tools the gate allows pass. */
  private permission(a: AgentSpec, req: PermissionRequest): PermissionRequestResult {
    if (req.kind !== "mcp") return { kind: "reject", feedback: "Agent Hub chỉ cho phép tool MCP" };
    const { decision, reason } = decide(a, `${req.serverName}-${req.toolName}`);
    return decision === "allow" ? { kind: "approve-once" } : { kind: "reject", feedback: reason };
  }

  async stop() {
    await Promise.allSettled([...this.sessions].map((s) => s.abort()));
    await this.client?.stop();
    this.client = null;
  }
}
