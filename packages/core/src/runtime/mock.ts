import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { AgentResult, dropEmpty, droppedText } from "../brief.ts";
import type { HubConfig } from "../config.ts";
import type { HubEvent } from "../events.ts";
import { audit, DENIED_PREFIX, decide, denyHint } from "../security.ts";
import { DIRECT_READ_OK, WorkItem, workItemFrom } from "../wit.ts";
import type { AgentRuntime, RunInput } from "./index.ts";

/** One line of fixtures/scenarios/*.jsonl */
interface Step {
  delayMs?: number;
  event: HubEvent;
  /** On a tool.completed step: the tool's result. Used for wit-reader's direct read, like the SDK runtime. */
  result?: unknown;
}

/**
 * Replays a scenario file. Still runs the real tool gate and the real result validation, so tests exercise the same
 * rules as the SDK runtime.
 */
export class MockRuntime implements AgentRuntime {
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
    // wit-reader agents whose work item came from the tool result (directRead): the scenario's model answer is skipped.
    const direct = new Set<string>();

    for (const { delayMs = 0, event: ev, result } of steps) {
      if (this.stopped) return;
      if (delayMs) await sleep(delayMs);

      if ("agent" in ev && ev.agent && !active(ev.agent)) continue;

      if (ev.type === "tool.started") {
        const agent = byName.get(ev.agent)!;
        // A tool no server offers (model guessed the name) arrives as server "builtin" with the full name.
        const runtimeName = ev.server === "builtin" ? ev.tool : `${ev.server}-${ev.tool}`;
        const { decision, reason } = decide(agent, runtimeName);
        audit(this.cfg.root, { agent: agent.name, tool: runtimeName, args: ev.args ?? {}, decision, reason });
        yield ev;
        if (decision === "deny") {
          // Same error the real runtime reports for a denied call; the scenario's own completion is skipped.
          yield { type: "tool.completed", callId: ev.callId, ok: false, error: DENIED_PREFIX + reason + denyHint(agent) };
          yield { type: "message", agent: agent.name, text: `Bị chặn: ${reason}` };
        } else callAgent.set(ev.callId, agent.name);
        continue;
      }
      if (ev.type === "tool.completed") {
        const name = callAgent.get(ev.callId);
        if (!name) continue;
        callAgent.delete(ev.callId);
        const item = result !== undefined && byName.get(name)?.directRead ? workItemFrom(result) : null;
        if (item) {
          yield ev;
          yield { type: "message", agent: name, text: DIRECT_READ_OK };
          yield { type: "workitem.result", agent: name, item };
          direct.add(name);
          continue;
        }
      }
      if (ev.type === "workitem.result") {
        if (direct.has(ev.agent)) continue;
        if (!WorkItem.safeParse(ev.item).success) {
          failed.add(ev.agent);
          yield { type: "agent.failed", agent: ev.agent, error: "Work item sai schema" };
          continue;
        }
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

      if (ev.type === "agent.failed") failed.add(ev.agent);
      if (ev.type === "agent.completed" && failed.has(ev.agent)) continue;
      yield ev;
    }
  }

  async stop() {
    this.stopped = true;
  }
}
