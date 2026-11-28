/**
 * Run events -> what the dashboard shows (node states, tool calls, approvals, credits). Pure, so node:test covers it.
 */
import type { BriefItem } from "@agenthub/core/brief";
import type { HubEvent } from "@agenthub/core/events";
import type { QaReport, QaResult } from "@agenthub/core/qa";
import { DENIED_PREFIX, findHint, hint } from "@agenthub/core/hints";

export interface AgentInfo {
  name: string;
  displayName: string;
  kind: "reader" | "writer" | "tester";
  servers: string[];
  missingConfig: string | null;
  /** Set for readers that are not part of the brief (ac-reader). */
  output?: "criteria";
}
export type Timed = { at: number; event: HubEvent };
export type RunStatus = "idle" | "running" | "done" | "stopped";
export type RunMode = "brief" | "act" | "qa" | "ac";
/** Last qa run: `dir` is served at /qa/<dir>/. */
export type QaSummary = QaReport & { dir: string };
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
  mode: RunMode;
  /** Which writer agent acts on an item of each source. */
  writerFor: Partial<Record<BriefItem["source"], string>>;
  prompt: string;
  /** Per writer: the brief item its last run acted on. */
  acts: Record<string, BriefItem>;
  events: Timed[];
  report: ReportSummary | null;
  qa: QaSummary | null;
  /** Last acceptance criteria read from an ADO work item. */
  ac: { workItem: number; title: string; criteria: string[]; error?: string } | null;
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
  /** Writers: what the last run did, or why not. */
  action?: { summary: string; link: string | null };
  /** qa: pass/fail per criterion of the last run. */
  qa?: QaResult;
}
export interface ServerView {
  status: NodeStatus;
  active: number;
  calls: number;
  error?: string;
}
export interface Approval {
  id: string;
  agent: string;
  tool: string;
  args: unknown;
  at: number;
  decision?: "approve" | "reject";
  /** Reason given with the decision (the UI sends "Người dùng từ chối" on a reject without text). */
  feedback?: string;
  resolvedAt?: number;
}
export interface View {
  agents: Record<string, AgentView>;
  servers: Record<string, ServerView>;
  /** In-flight calls and last error per agent->server edge, key `${agent}>${server}`. */
  edges: Record<string, { active: number; error: boolean }>;
  approvals: Approval[];
  orchestratorError?: string;
  usedAiCredits: number;
}

export function derive(agents: AgentInfo[], events: Timed[]): View {
  const view: View = { agents: {}, servers: {}, edges: {}, approvals: [], usedAiCredits: 0 };
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
        // A writer can run many times on top of one brief: each run starts clean.
        if (agent) Object.assign(agent, { status: "running", startedAt: at, durationMs: undefined, error: undefined, hint: undefined, action: undefined, qa: undefined });
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
      case "action.result":
        if (agent) agent.action = { summary: ev.summary, link: ev.link };
        break;
      case "qa.result":
        if (agent) agent.qa = ev.result;
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
      case "approval.requested":
        view.approvals.push({ id: ev.id, agent: ev.agent, tool: ev.tool, args: ev.args, at });
        break;
      case "approval.resolved": {
        // Ids can repeat across runs appended to one brief (mock call ids): resolve the open one.
        const ap = view.approvals.find((a) => a.id === ev.id && !a.decision);
        if (ap) Object.assign(ap, { decision: ev.decision, feedback: ev.feedback, resolvedAt: at });
        break;
      }
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
  // The brief's total covers the readers; writer and qa runs come after it and add their own.
  const sum = (pick: (a: AgentInfo) => boolean) => agents.filter(pick).reduce((n, a) => n + (view.agents[a.name].credits ?? 0), 0);
  const brief = (a: AgentInfo) => a.kind === "reader" && !a.output;
  view.usedAiCredits = Math.max(usedTotal, sum(brief)) + sum((a) => !brief(a));
  return view;
}

/** Approvals still waiting for the user. */
export const pending = (v: View) => v.approvals.filter((a) => !a.decision);

type Indexed = { item: BriefItem; i: number };
/**
 * The to-do tab: "Cần bạn xử lý" (every actionRequired item, with or without a writer) and "Mục khác có agent ghi"
 * (the rest, when their source has a writer). Found at Work run 10: real briefs often mark no ADO/GitHub item as
 * actionRequired, so nothing could be handed to a writer. `i` is the item's index in report.items.
 */
export function todoGroups(items: BriefItem[], writerFor: Snapshot["writerFor"]) {
  const all = items.map((item, i) => ({ item, i }));
  return {
    action: all.filter(({ item }) => item.actionRequired),
    other: all.filter(({ item }) => !item.actionRequired && writerFor[item.source]),
  } satisfies Record<string, Indexed[]>;
}

/** Same item (the act run gets a copy, so compare by value). */
export const sameItem = (a: BriefItem, b: BriefItem) => JSON.stringify(a) === JSON.stringify(b);

export type WriterOutcome =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "waiting"; pending: number }
  | { kind: "failed"; error: string; hint?: string | null }
  /** summary: the agent's own explanation (e.g. no recipient); blocked: calls the gate denied this run. */
  | { kind: "nothing-sent"; rejected: Approval[]; summary?: string; blocked: number }
  | { kind: "sent"; sent: Approval[]; rejected: Approval[]; summary?: string; link?: string | null };

/**
 * What the writer's last run did, from its status, its approvals since it started and the approved calls' results.
 * A write counts as sent only if the user approved it AND the tool call succeeded.
 */
export function writerOutcome(view: View, agent: string): WriterOutcome {
  const av = view.agents[agent];
  if (!av || av.status === "idle" || av.startedAt === undefined) return { kind: "idle" };
  const mine = view.approvals.filter((a) => a.agent === agent && a.at >= av.startedAt!);
  const waiting = mine.filter((a) => !a.decision).length;
  if (waiting) return { kind: "waiting", pending: waiting };
  if (av.status === "running") return { kind: "running" };
  const rejected = mine.filter((a) => a.decision === "reject");
  // Only this run's calls: mock call ids repeat across runs.
  const call = (a: Approval) => av.calls.find((c) => c.callId === a.id && c.startedAt >= av.startedAt!);
  const sent = mine.filter((a) => a.decision === "approve" && call(a)?.ok);
  const broken = mine.find((a) => a.decision === "approve" && call(a)?.error);
  if (sent.length) return { kind: "sent", sent, rejected, summary: av.action?.summary, link: av.action?.link };
  if (av.status === "failed" || av.status === "needs-action" || broken) {
    return { kind: "failed", error: av.error ?? call(broken!)?.error ?? "Lỗi", hint: av.hint ?? call(broken!)?.hint };
  }
  // A rejected write also comes back as a denied call: count only what the gate itself denied.
  const blocked = av.calls.filter((c) => c.denied && c.startedAt >= av.startedAt! && !mine.some((a) => a.id === c.callId)).length;
  return { kind: "nothing-sent", rejected, summary: av.action?.summary, blocked };
}

/**
 * A work item the user types on the to-do tab, handed to board-writer without a brief item (Work run 11: real briefs
 * often have no ADO item). Built in the browser; the server checks it like any BriefItem.
 */
export const workItemItem = (id: number): BriefItem => ({
  source: "ado",
  title: `Work item #${id}`,
  summary: "Người dùng nhập số work item trên dashboard.",
  priority: "medium",
  actionRequired: true,
  suggestedAction: null,
  link: null,
  timestamp: null,
});

/**
 * Sign-in chip: Work IQ only reports its state when used ("unknown" before a run). A successful call on that server
 * in this session shows it signed in (Work run 11: the chip stayed grey after the writer used it).
 */
export function authState(status: "ok" | "error" | "mock" | "unknown", view: View, source: string) {
  if (status !== "unknown") return status;
  const srv = view.servers[source];
  const okCall = Object.values(view.agents).some((a) => a.calls.some((c) => c.server === source && c.ok));
  return okCall && srv?.status !== "needs-action" ? "ok" : status;
}

/** One line for the node and the detail panel. */
export function outcomeText(o: WriterOutcome): string {
  switch (o.kind) {
    case "idle":
      return "";
    case "running":
      return "Đang soạn";
    case "waiting":
      return `Chờ bạn duyệt ${o.pending} yêu cầu`;
    case "failed":
      return "Lỗi, không gửi gì";
    case "nothing-sent":
      return o.rejected.length ? `Bị từ chối ${o.rejected.length} yêu cầu, không gửi gì` : o.summary ? `Không gửi gì: ${o.summary}` : "Không gửi gì";
    case "sent":
      return `Đã gửi ${o.sent.length}${o.rejected.length ? `, từ chối ${o.rejected.length}` : ""}`;
  }
}
