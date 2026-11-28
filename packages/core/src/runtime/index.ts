import type { AgentSpec } from "../agents.ts";
import type { HubConfig } from "../config.ts";
import type { HubEvent } from "../events.ts";

export interface RunInput {
  prompt: string;
  agents: AgentSpec[];
  /** Total AI Credit budget for this run. */
  budget: number;
  /** Mock runtime only: scenario to replay instead of cfg.scenario (wit-reader uses `wit-reader`). */
  scenario?: string;
}

export interface AgentRuntime {
  run(input: RunInput): AsyncIterable<HubEvent>;
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
