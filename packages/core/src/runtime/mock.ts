import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { ActionResult, AgentResult, dropEmpty, droppedText } from "../brief.ts";
import { AcResult, QaResult } from "../qa.ts";
import type { HubConfig } from "../config.ts";
import type { HubEvent } from "../events.ts";
import { audit, DENIED_PREFIX, decide, denyHint } from "../security.ts";
import { ApprovalBox, type AgentRuntime, type RunInput } from "./index.ts";

/** One line of fixtures/scenarios/*.jsonl */
interface Step {
  delayMs?: number;
  /** Replay only if the last approval in this run was approved / rejected. */
  when?: "approved" | "rejected";
  event: HubEvent;
}

/**
 * Replays a scenario file. Still runs the real approval gate and the real
 * BriefItem validation, so tests exercise the same rules as the SDK runtime.
 */
export class MockRuntime implements AgentRuntime {
  private approvals = new ApprovalBox();
  private stopped = false;
  constructor(private cfg: HubConfig) {}

  async *run({ agents, scenario }: RunInput): AsyncIterable<HubEvent> {
    const file = path.join(this.cfg.root, "fixtures/scenarios", `${scenario ?? this.cfg.scenario}.jsonl`);
    const steps: Step[] = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));

    const byName = new Map(agents.map((a) => [a.name, a]));
    for (const a of agents) if (a.missingConfig) yield { type: "agent.failed", agent: a.name, error: a.missingConfig };
    const active = (name: string) => byName.has(name) && !byName.get(name)!.missingConfig;
    const callAgent = new Map<string, string>();
    // Like sdk.ts: an agent ends with agent.failed OR agent.completed, never both.
    const failed = new Set<string>();
    let lastApproval: "approved" | "rejected" | undefined;

    for (const { delayMs = 0, when, event: ev } of steps) {
      if (this.stopped) return;
      if (when && when !== lastApproval) continue;
      if (delayMs) await sleep(delayMs);

      if ("agent" in ev && ev.agent && !active(ev.agent)) continue;

      if (ev.type === "tool.started") {
        const agent = byName.get(ev.agent)!;
        // A tool no server offers (model guessed the name) arrives as server "builtin" with the full name.
        const runtimeName = ev.server === "builtin" ? ev.tool : `${ev.server}-${ev.tool}`;
        const { decision, reason } = decide(agent, runtimeName, ev.args);
        audit(this.cfg.root, { agent: agent.name, tool: runtimeName, args: ev.args ?? {}, decision, reason });
        callAgent.set(ev.callId, agent.name);
        yield ev;
        if (decision === "ask") {
          // Like the SDK gate: the call waits for the user; a rejection comes back to the model as a denied call.
          const wait = this.approvals.wait(ev.callId);
          yield { type: "approval.requested", id: ev.callId, agent: agent.name, tool: runtimeName, args: ev.args ?? {} };
          const r = await wait;
          audit(this.cfg.root, { agent: agent.name, tool: runtimeName, args: ev.args ?? {}, decision: r.decision, reason: r.feedback ?? "user" });
          yield { type: "approval.resolved", id: ev.callId, decision: r.decision, ...(r.feedback ? { feedback: r.feedback } : {}) };
          lastApproval = r.decision === "approve" ? "approved" : "rejected";
          if (r.decision === "reject") {
            yield { type: "tool.completed", callId: ev.callId, ok: false, error: DENIED_PREFIX + (r.feedback ?? "Người dùng từ chối") };
            callAgent.delete(ev.callId);
          }
          continue;
        }
        if (decision === "deny") {
          // Same error the real runtime reports for a denied call.
          yield { type: "tool.completed", callId: ev.callId, ok: false, error: DENIED_PREFIX + reason + denyHint(agent) };
          yield { type: "message", agent: agent.name, text: `Bị chặn: ${reason}` };
          callAgent.delete(ev.callId); // the scenario's own completion for this call is skipped
        }
        continue;
      }
      if (ev.type === "tool.completed") {
        if (!callAgent.has(ev.callId)) continue;
        callAgent.delete(ev.callId);
      }

      if (ev.type === "approval.requested") {
        const wait = this.approvals.wait(ev.id); // register before yield: the consumer may resolve right away
        yield ev;
        const { decision, feedback } = await wait;
        audit(this.cfg.root, { agent: ev.agent, tool: ev.tool, args: ev.args, decision, reason: feedback });
        yield { type: "approval.resolved", id: ev.id, decision, ...(feedback ? { feedback } : {}) };
        continue;
      }

      if (ev.type === "agent.result") {
        const parsed = AgentResult.safeParse({ items: ev.items });
        if (!parsed.success) {
          failed.add(ev.agent);
          yield { type: "agent.failed", agent: ev.agent, error: `Kết quả sai schema: ${z.prettifyError(parsed.error).replaceAll("\n", "; ")}` };
          continue;
        }
        const { items, dropped } = dropEmpty(parsed.data.items);
        if (dropped) yield { type: "message", agent: ev.agent, text: droppedText(dropped) };
        yield { ...ev, items };
        continue;
      }

      if (ev.type === "action.result") {
        const parsed = ActionResult.safeParse({ summary: ev.summary, link: ev.link });
        if (!parsed.success) {
          failed.add(ev.agent);
          yield { type: "agent.failed", agent: ev.agent, error: `Kết quả sai schema: ${z.prettifyError(parsed.error).replaceAll("\n", "; ")}` };
          continue;
        }
      }

      if (ev.type === "criteria.result" && !AcResult.safeParse(ev).success) {
        failed.add(ev.agent);
        yield { type: "agent.failed", agent: ev.agent, error: "Tiêu chí sai schema" };
        continue;
      }
      if (ev.type === "qa.result" && !QaResult.safeParse(ev.result).success) {
        failed.add(ev.agent);
        yield { type: "agent.failed", agent: ev.agent, error: "Kết quả nghiệm thu sai schema" };
        continue;
      }

      if (ev.type === "agent.failed") failed.add(ev.agent);
      if (ev.type === "agent.completed" && failed.has(ev.agent)) continue;
      yield ev;
    }
  }

  resolveApproval(id: string, decision: "approve" | "reject", feedback?: string) {
    this.approvals.resolve(id, decision, feedback);
  }

  async stop() {
    this.stopped = true;
    this.approvals.rejectAll("Runtime dừng");
  }
}
