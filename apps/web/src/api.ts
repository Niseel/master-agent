/** Calls to `pnpm hub` (same origin). POSTs are JSON only: the server rejects anything else. */
import type { BriefItem } from "@agenthub/core/brief";
import type { QaSummary, ReportSummary, RunMode, RunStatus, Snapshot, Timed } from "./state.ts";

export interface AuthStatus {
  source: string;
  agent: string;
  status: "ok" | "error" | "mock" | "unknown";
  detail: string;
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
  return res.json();
}

export const run = (prompt: string) => post("/api/run", { prompt });
export const actOn = (agent: string, item: BriefItem, instruction: string) => post("/api/act", { agent, item, instruction });
export const startQa = (url: string, criteria: string) => post("/api/qa", { url, criteria });
export const stop = () => post("/api/stop", {});
export const decide = (id: string, decision: "approve" | "reject", feedback?: string) =>
  post(`/api/approvals/${encodeURIComponent(id)}`, { decision, feedback });
export const auth = async (): Promise<AuthStatus[]> => (await fetch("/api/auth")).json();

/** Live stream. Returns a close function. EventSource reconnects by itself; each reconnect resends `state`. */
export function subscribe(on: {
  state: (s: Snapshot) => void;
  hub: (e: Timed) => void;
  run: (r: { status: RunStatus; mode: RunMode; prompt?: string; report?: ReportSummary | null; qa?: QaSummary | null }) => void;
  connection: (ok: boolean) => void;
}) {
  const es = new EventSource("/api/events");
  es.addEventListener("state", (m) => on.state(JSON.parse(m.data)));
  es.addEventListener("hub", (m) => on.hub(JSON.parse(m.data)));
  es.addEventListener("run", (m) => on.run(JSON.parse(m.data)));
  es.onopen = () => on.connection(true);
  es.onerror = () => on.connection(false);
  return () => es.close();
}
