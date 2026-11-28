/** Calls to `pnpm hub` (same origin). POSTs are JSON only: the server rejects anything else. */
import type { CardStates, TodoStep } from "@agenthub/core/cards";
import type { HubFile } from "@agenthub/core/hub-config";
import type { ToolInfo } from "@agenthub/core/tool-list";
import type { ReportSummary, RunStatus, Snapshot, Timed } from "./state.ts";

export type { AuthStatus } from "@agenthub/core/auth";
export interface LoginEvent {
  key: string;
  text: string;
  code?: string;
  url?: string;
  done?: boolean;
  ok?: boolean;
}

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
  return res.json();
}

export interface RunOptions {
  window: string;
  agents: string[];
  budget: number;
}
export const run = (prompt: string, opts: RunOptions) => post("/api/run", { prompt, ...opts });
export const markCard = (key: string, change: { status?: "open" | "done" | "hidden"; todos?: TodoStep[] }) => post("/api/cards", { key, ...change });
export const exportMarkdown = async () => {
  const res = await fetch("/api/export.md");
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
  return res.text();
};
export const stop = () => post("/api/stop", {});
export const saveConfig = async (file: HubFile) => {
  const res = await fetch("/api/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ file }) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
};
export const importMcp = (text: string): Promise<{ added: string[]; secrets: string[]; skipped: string[] }> => post("/api/import", { text });
export const listTools = async (key: string): Promise<ToolInfo[]> => (await post("/api/tools", { key })).tools;
export const setSecret = (id: string, value: string) => post("/api/secrets", { id, value });
export const login = (key: string, deviceCode = false) => post("/api/login", { key, deviceCode });
export const logout = (key: string) => post("/api/logout", { key });
export const auth = async (): Promise<import("@agenthub/core/auth").AuthStatus[]> => (await fetch("/api/auth")).json();

/** Live stream. Returns a close function. EventSource reconnects by itself; each reconnect resends `state`. */
export function subscribe(on: {
  state: (s: Snapshot) => void;
  hub: (e: Timed) => void;
  run: (r: { status: RunStatus; prompt?: string; report?: ReportSummary | null }) => void;
  cards: (states: CardStates) => void;
  login: (e: LoginEvent) => void;
  connection: (ok: boolean) => void;
}) {
  const es = new EventSource("/api/events");
  es.addEventListener("state", (m) => on.state(JSON.parse(m.data)));
  es.addEventListener("hub", (m) => on.hub(JSON.parse(m.data)));
  es.addEventListener("run", (m) => on.run(JSON.parse(m.data)));
  es.addEventListener("cards", (m) => on.cards(JSON.parse(m.data)));
  es.addEventListener("login", (m) => on.login(JSON.parse(m.data)));
  es.onopen = () => on.connection(true);
  es.onerror = () => on.connection(false);
  return () => es.close();
}
