import type { AgentSpec } from "../agents.ts";
import type { HubConfig } from "../config.ts";
import type { HubEvent } from "../events.ts";

export interface RunInput {
  prompt: string;
  agents: AgentSpec[];
  /** Total AI Credit budget for this run. */
  budget: number;
}

export interface AgentRuntime {
  run(input: RunInput): AsyncIterable<HubEvent>;
  resolveApproval(id: string, decision: "approve" | "reject", feedback?: string): void;
  stop(): Promise<void>;
}

/** Pick the runtime from AGENTHUB_RUNTIME (via config). SDK code loads only when needed. */
export async function createRuntime(cfg: HubConfig): Promise<AgentRuntime> {
  if (cfg.runtime === "mock") return new (await import("./mock.ts")).MockRuntime(cfg);
  return new (await import("./sdk.ts")).SdkRuntime(cfg);
}

/** Push-based async queue: many producers (parallel agents), one consumer (for await). */
export class EventQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiting: ((r: IteratorResult<T>) => void) | null = null;
  private closed = false;

  push(item: T) {
    if (this.closed) return;
    if (this.waiting) {
      this.waiting({ value: item, done: false });
      this.waiting = null;
    } else this.items.push(item);
  }

  close() {
    this.closed = true;
    this.waiting?.({ value: undefined, done: true });
    this.waiting = null;
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.items.length) yield this.items.shift()!;
      else if (this.closed) return;
      else {
        const r = await new Promise<IteratorResult<T>>((res) => (this.waiting = res));
        if (r.done) return;
        yield r.value;
      }
    }
  }
}

/** Holds approval requests until the user decides. Shared by every runtime. */
export class ApprovalBox {
  private pending = new Map<string, (d: { decision: "approve" | "reject"; feedback?: string }) => void>();

  wait(id: string) {
    return new Promise<{ decision: "approve" | "reject"; feedback?: string }>((res) => this.pending.set(id, res));
  }

  resolve(id: string, decision: "approve" | "reject", feedback?: string) {
    const res = this.pending.get(id);
    if (!res) throw new Error(`Không có approval đang chờ: ${id}`);
    this.pending.delete(id);
    res({ decision, feedback });
  }

  /** On stop: everything still pending is rejected (never silently approved). */
  rejectAll(reason: string) {
    for (const id of [...this.pending.keys()]) this.resolve(id, "reject", reason);
  }
}
