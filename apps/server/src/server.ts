/**
 * Local dashboard API (Phase 2), started by `pnpm hub` (main.ts). Listens on 127.0.0.1 only.
 *   GET  /api/state               runtime, agents, run status, events so far, last report
 *   GET  /api/events              Server-Sent Events: `state` once, then `hub` (HubEvent) and `run` (status changes)
 *   POST /api/run      {prompt}   start a run (409 while one is running)
 *   POST /api/approvals/:id {decision: "approve"|"reject", feedback?}
 *   POST /api/stop
 * SSE + POST instead of WebSocket: the stream only flows server -> browser, and node:http does both without a dependency.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { readerAgents, type AgentSpec } from "@agenthub/core/agents";
import type { HubConfig } from "@agenthub/core/config";
import type { HubEvent } from "@agenthub/core/events";
import { saveReport, type BriefReport } from "@agenthub/core/report";
import { createRuntime, type AgentRuntime } from "@agenthub/core/runtime/index";

export type RunStatus = "idle" | "running" | "done" | "stopped";
type Send = (event: "state" | "hub" | "run", data: unknown) => void;

/** One run at a time. Holds the events so a browser that connects late sees the whole run. */
export class Hub {
  events: HubEvent[] = [];
  status: RunStatus = "idle";
  report: { file: string; report: BriefReport } | null = null;
  private runtime: AgentRuntime | null = null;
  private stopping = false;
  private listeners = new Set<Send>();
  readonly agents: AgentSpec[];

  constructor(readonly cfg: HubConfig) {
    this.agents = readerAgents(cfg);
  }

  state() {
    return {
      runtime: this.cfg.runtime,
      maxAiCredits: this.cfg.maxAiCredits,
      agents: this.agents.map((a) => ({
        name: a.name,
        displayName: a.displayName,
        kind: a.kind,
        servers: Object.keys(a.mcpServers),
        missingConfig: a.missingConfig ?? null,
      })),
      status: this.status,
      events: this.events,
      report: this.report && { file: this.report.file, ...this.report.report },
    };
  }

  subscribe(send: Send) {
    this.listeners.add(send);
    send("state", this.state());
    return () => this.listeners.delete(send);
  }

  private emit: Send = (event, data) => {
    for (const send of this.listeners) send(event, data);
  };

  /** Starts a run in the background. The returned promise ends with the run (tests await it; HTTP does not). */
  async start(prompt: string) {
    if (this.status === "running") throw new HttpError(409, "Đang có lượt chạy");
    this.status = "running";
    this.events = [];
    this.report = null;
    this.stopping = false;
    this.emit("run", { status: this.status });
    const t0 = Date.now();
    const done = (async () => {
      try {
        const rt = (this.runtime = await createRuntime(this.cfg));
        for await (const ev of rt.run({ prompt, agents: this.agents, budget: this.cfg.maxAiCredits })) {
          this.events.push(ev);
          this.emit("hub", ev);
        }
      } catch (e) {
        const ev: HubEvent = { type: "agent.failed", agent: "orchestrator", error: e instanceof Error ? e.message : String(e) };
        this.events.push(ev);
        this.emit("hub", ev);
      } finally {
        await this.runtime?.stop();
        this.runtime = null;
        this.report = saveReport(this.cfg, this.events, Date.now() - t0);
        this.status = this.stopping ? "stopped" : "done";
        this.emit("run", { status: this.status, report: { file: this.report.file, ...this.report.report } });
      }
    })();
    return { done };
  }

  resolveApproval(id: string, decision: "approve" | "reject", feedback?: string) {
    if (!this.runtime) throw new HttpError(409, "Không có lượt chạy");
    try {
      this.runtime.resolveApproval(id, decision, feedback);
    } catch (e) {
      throw new HttpError(404, e instanceof Error ? e.message : String(e));
    }
  }

  async stop() {
    this.stopping = true;
    await this.runtime?.stop(); // pending approvals are rejected, never approved
  }
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(body));

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  // Only JSON: a cross-site <form> cannot send it without a CORS preflight, which this server never answers.
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new HttpError(415, "Cần Content-Type: application/json");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req as AsyncIterable<Buffer>) {
    if ((size += c.length) > 64 * 1024) throw new HttpError(413, "Body quá lớn");
    chunks.push(c);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  throw new HttpError(400, "JSON không hợp lệ");
}

/**
 * Local-only guard. The API can approve write tools, so any web page the user opens must not reach it:
 * Host must be loopback with our port (blocks DNS rebinding); a browser Origin, if sent, must be that same host.
 */
function checkOrigin(req: IncomingMessage, port: number) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(req.headers.host ?? "")) throw new HttpError(403, "Host không hợp lệ");
  const origin = req.headers.origin;
  if (origin && !hosts.some((h) => origin === `http://${h}`)) throw new HttpError(403, "Origin không hợp lệ");
}

export function createHubServer(hub: Hub): Server {
  const server = createServer(async (req, res) => {
    try {
      const port = (server.address() as AddressInfo).port;
      checkOrigin(req, port);
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const route = `${req.method} ${url.pathname}`;

      if (route === "GET /api/state") return json(res, 200, hub.state());
      if (route === "GET /api/events") {
        res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive" });
        const off = hub.subscribe((event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        req.on("close", off);
        return;
      }
      if (route === "POST /api/run") {
        const { prompt } = await readJson(req);
        await hub.start(typeof prompt === "string" && prompt.trim() ? prompt.trim() : "check việc");
        return json(res, 202, { status: hub.status });
      }
      const approval = req.method === "POST" && url.pathname.match(/^\/api\/approvals\/([^/]+)$/);
      if (approval) {
        const { decision, feedback } = await readJson(req);
        if (decision !== "approve" && decision !== "reject") throw new HttpError(400, "decision phải là approve hoặc reject");
        hub.resolveApproval(decodeURIComponent(approval[1]), decision, typeof feedback === "string" ? feedback : undefined);
        return json(res, 200, { ok: true });
      }
      if (route === "POST /api/stop") {
        await readJson(req);
        await hub.stop();
        return json(res, 200, { status: hub.status });
      }
      json(res, 404, { error: "Không có" });
    } catch (e) {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  return server;
}
