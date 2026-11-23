import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { AgentResult } from "../brief.ts";
import type { HubConfig } from "../config.ts";
import type { HubEvent } from "../events.ts";
import { audit, decide } from "../security.ts";
import { ApprovalBox, type AgentRuntime, type RunInput } from "./index.ts";

/** One line of fixtures/scenarios/*.jsonl */
interface Step {
  delayMs?: number;
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

  async *run({ agents }: RunInput): AsyncIterable<HubEvent> {
    const file = path.join(this.cfg.root, "fixtures/scenarios", `${this.cfg.scenario}.jsonl`);
    const steps: Step[] = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));

    const byName = new Map(agents.map((a) => [a.name, a]));
    for (const a of agents) if (a.missingConfig) yield { type: "agent.failed", agent: a.name, error: a.missingConfig };
    const active = (name: string) => byName.has(name) && !byName.get(name)!.missingConfig;
    const callAgent = new Map<string, string>();

    for (const { delayMs = 0, event: ev } of steps) {
      if (this.stopped) return;
      if (delayMs) await sleep(delayMs);

      if ("agent" in ev && ev.agent && !active(ev.agent)) continue;

      if (ev.type === "tool.started") {
        const agent = byName.get(ev.agent)!;
        const runtimeName = `${ev.server}-${ev.tool}`;
        const { decision, reason } = decide(agent, runtimeName);
        audit(this.cfg.root, { agent: agent.name, tool: runtimeName, args: {}, decision, reason });
        callAgent.set(ev.callId, agent.name);
        yield ev;
        if (decision === "deny") {
          yield { type: "tool.completed", callId: ev.callId, ok: false };
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
        yield { type: "approval.resolved", id: ev.id, decision };
        continue;
      }

      if (ev.type === "agent.result") {
        const parsed = AgentResult.safeParse({ items: ev.items });
        if (!parsed.success) {
          yield { type: "agent.failed", agent: ev.agent, error: `Kết quả sai schema: ${z.prettifyError(parsed.error).replaceAll("\n", "; ")}` };
          continue;
        }
        yield { ...ev, items: parsed.data.items };
        continue;
      }

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
