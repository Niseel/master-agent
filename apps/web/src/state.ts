/**
 * Run events -> what the dashboard shows (node states, tool calls, credits). Pure, so node:test covers it.
 */
import type { BriefItem } from "@agenthub/core/brief";
import type { HubEvent } from "@agenthub/core/events";
import { DENIED_PREFIX, findHint, hint } from "@agenthub/core/hints";

export interface AgentInfo {
  name: string;
  displayName: string;
  servers: string[];
  missingConfig: string | null;
}
export type Timed = { at: number; event: HubEvent };
export type RunStatus = "idle" | "running" | "done" | "stopped";
export interface ReportSummary {
  file: string;
  items: BriefItem[];
  failures: Record<string, string>;
  warnings?: string[];
  blocked?: string[];
  usedAiCredits: number;
  durationMs: number;
  previousDate?: string | null;
  /** Same order as items: not in the previous day's brief. */
  isNew?: boolean[];
}
export interface Snapshot {
  runtime: string;
  maxAiCredits: number;
  agents: AgentInfo[];
  status: RunStatus;
  prompt: string;
  events: Timed[];
  report: ReportSummary | null;
}

/** needs-action: a known blocking cause (login, EULA, config) the user must fix. warning: a tool error, agent went on. */
export type NodeStatus = "idle" | "running" | "done" | "warning" | "needs-action" | "failed";

export interface Call {
  callId: string;
  agent: string;
  server: string;
  tool: string;
  startedAt: number;
  endedAt?: number;
  ok?: boolean;
  error?: string;
  denied?: boolean;
  hint?: string | null;
}
export interface AgentView {
  status: NodeStatus;
  startedAt?: number;
  durationMs?: number;
  tokens?: number;
  credits?: number;
  items: number;
  error?: string;
  hint?: string | null;
  calls: Call[];
  messages: string[];
}
export interface ServerView {
  status: NodeStatus;
  active: number;
  calls: number;
  error?: string;
}
export interface View {
  agents: Record<string, AgentView>;
  servers: Record<string, ServerView>;
  /** In-flight calls and last error per agent->server edge, key `${agent}>${server}`. */
  edges: Record<string, { active: number; error: boolean }>;
  orchestratorError?: string;
  usedAiCredits: number;
}

export function derive(agents: AgentInfo[], events: Timed[]): View {
  const view: View = { agents: {}, servers: {}, edges: {}, usedAiCredits: 0 };
  const blockingBy: Record<string, string> = {};
  const warnedBy = new Set<string>();
  for (const a of agents) {
    view.agents[a.name] = a.missingConfig
      ? { status: "needs-action", items: 0, calls: [], messages: [], error: a.missingConfig, hint: hint(a.missingConfig) }
      : { status: "idle", items: 0, calls: [], messages: [] };
    for (const s of a.servers) {
      view.servers[s] = { status: "idle", active: 0, calls: 0 };
      view.edges[`${a.name}>${s}`] = { active: 0, error: false };
    }
  }
  const calls = new Map<string, Call>();
  let usedTotal = 0;

  for (const { at, event: ev } of events) {
    const agent = "agent" in ev && ev.agent ? view.agents[ev.agent] : undefined;
    switch (ev.type) {
      case "agent.started":
        if (agent) Object.assign(agent, { status: "running", startedAt: at });
        break;
      case "tool.started": {
        const call: Call = { callId: ev.callId, agent: ev.agent, server: ev.server, tool: ev.tool, startedAt: at };
        calls.set(ev.callId, call);
        agent?.calls.push(call);
        const srv = view.servers[ev.server];
        const edge = view.edges[`${ev.agent}>${ev.server}`];
        if (srv) srv.active++, srv.calls++;
        if (edge) edge.active++;
        break;
      }
      case "tool.completed": {
        const call = calls.get(ev.callId);
        if (!call) break;
        Object.assign(call, { endedAt: at, ok: ev.ok, error: ev.error });
        const srv = view.servers[call.server];
        const edge = view.edges[`${call.agent}>${call.server}`];
        if (srv) srv.active = Math.max(0, srv.active - 1);
        if (edge) edge.active = Math.max(0, edge.active - 1);
        if (!ev.error) break;
        call.denied = ev.error.startsWith(DENIED_PREFIX);
        if (call.denied) break; // listed under "Đã chặn", not an error of the source
        call.hint = hint(ev.error);
        const kind = findHint(ev.error)?.kind;
        if (kind === "retry") break; // model mistake it retries past: kept in the call log, the source is fine
        if (edge) edge.error = true;
        if (srv) srv.error = ev.error;
        if (kind === "blocking") blockingBy[call.agent] ??= ev.error;
        else warnedBy.add(call.agent);
        break;
      }
      case "agent.result":
        if (agent) agent.items += ev.items.length;
        break;
      case "agent.completed":
        if (!agent) break;
        Object.assign(agent, { durationMs: ev.durationMs, tokens: ev.tokens });
        if (blockingBy[ev.agent]) Object.assign(agent, { status: "needs-action", error: blockingBy[ev.agent], hint: hint(blockingBy[ev.agent]) });
        else agent.status = warnedBy.has(ev.agent) ? "warning" : "done";
        break;
      case "agent.failed":
        if (ev.agent === "orchestrator") view.orchestratorError = ev.error;
        if (!agent) break;
        Object.assign(agent, {
          status: findHint(ev.error)?.kind === "blocking" ? "needs-action" : "failed",
          error: ev.error,
          hint: hint(ev.error),
          durationMs: agent.startedAt ? at - agent.startedAt : undefined,
        });
        break;
      case "usage":
        if (agent) agent.credits = ev.usedAiCredits;
        else if (!ev.agent) usedTotal = ev.usedAiCredits;
        break;
      case "message":
        agent?.messages.push(ev.text);
        break;
    }
  }

  // A server's state: busy while any call is in flight, else the worst thing that happened on it.
  for (const a of agents) {
    for (const s of a.servers) {
      const srv = view.servers[s];
      const blocked = blockingBy[a.name];
      if (srv.active) srv.status = "running";
      else if (blocked && view.agents[a.name].calls.some((c) => c.server === s && c.error === blocked)) srv.status = "needs-action";
      else if (srv.error) srv.status = "warning";
      else if (srv.calls) srv.status = "done";
    }
  }
  view.usedAiCredits = Math.max(usedTotal, agents.reduce((n, a) => n + (view.agents[a.name].credits ?? 0), 0));
  return view;
}

/**
 * Sign-in chip: Work IQ only reports its state when used ("unknown" before a run). A successful call on that server
 * in this session shows it signed in (Work run 11: the chip stayed grey after a successful call).
 */
export function authState(status: "ok" | "error" | "mock" | "unknown", view: View, source: string) {
  if (status !== "unknown") return status;
  const srv = view.servers[source];
  const okCall = Object.values(view.agents).some((a) => a.calls.some((c) => c.server === source && c.ok));
  return okCall && srv?.status !== "needs-action" ? "ok" : status;
}
