/**
 * Local dashboard API (Phase 2), started by `pnpm hub` (main.ts). Listens on 127.0.0.1 only.
 *   GET  /api/state               runtime, agents, run status, events so far ({at, event}), last report
 *   GET  /api/events              Server-Sent Events: `state` once, then `hub` ({at, event}) and `run` (status changes)
 *   GET  /api/auth                sign-in state per source (no tokens, no AI Credits)
 *   GET  /report                  last report as HTML (no scripts allowed)
 *   GET  /*                       the built dashboard (apps/web/dist, `pnpm dashboard`)
 *   POST /api/run      {prompt}   start a brief run with the reader agents (409 while one is running)
 *   POST /api/act      {agent, item, instruction}  run one writer agent on a brief item (Phase 3); its writes wait for approval
 *   POST /api/approvals/:id {decision: "approve"|"reject", feedback?}
 *   POST /api/stop
 * SSE + POST instead of WebSocket: the stream only flows server -> browser, and node:http does both without a dependency.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { checkAuth } from "@agenthub/core/auth";
import { readerAgents, WRITER_FOR, writerAgents, writerTask, type AgentSpec } from "@agenthub/core/agents";
import { BriefItem } from "@agenthub/core/brief";
import type { HubConfig } from "@agenthub/core/config";
import type { HubEvent } from "@agenthub/core/events";
import { renderReport, saveReport, type BriefReport } from "@agenthub/core/report";
import { createRuntime, type AgentRuntime, type RunInput } from "@agenthub/core/runtime/index";

export type RunStatus = "idle" | "running" | "done" | "stopped";
/** brief: the reader agents, makes a report. act: one writer on one brief item, appended to the brief's events. */
export type RunMode = "brief" | "act";
type Send = (event: "state" | "hub" | "run", data: unknown) => void;

/** One run at a time. Holds the events so a browser that connects late sees the whole run. */
export class Hub {
  events: HubEvent[] = [];
  /** Receive time (ms) of each event, same index: events carry no time of their own. */
  times: number[] = [];
  prompt = "";
  status: RunStatus = "idle";
  mode: RunMode = "brief";
  report: { file: string; report: BriefReport } | null = null;
  private runtime: AgentRuntime | null = null;
  private stopping = false;
  private listeners = new Set<Send>();
  readonly readers: AgentSpec[];
  readonly writers: AgentSpec[];
  /** Readers then writers: what the dashboard draws. */
  readonly agents: AgentSpec[];

  constructor(readonly cfg: HubConfig) {
    this.readers = readerAgents(cfg);
    this.writers = writerAgents(cfg);
    this.agents = [...this.readers, ...this.writers];
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
      mode: this.mode,
      writerFor: WRITER_FOR,
      prompt: this.prompt,
      events: this.events.map((event, i) => ({ at: this.times[i], event })),
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

  /** Starts a brief in the background. The returned promise ends with the run (tests await it; HTTP does not). */
  start(prompt: string) {
    return this.launch("brief", prompt, { prompt, agents: this.readers, budget: this.cfg.maxAiCredits });
  }

  /** Runs one writer on one brief item. Its events are appended, so the brief's graph and report stay. */
  act(agent: unknown, item: unknown, instruction: unknown) {
    const writer = this.writers.find((w) => w.name === agent);
    if (!writer) throw new HttpError(400, "agent phải là một agent ghi");
    const parsed = BriefItem.safeParse(item);
    if (!parsed.success) throw new HttpError(400, "item không đúng schema BriefItem");
    if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 2000) {
      throw new HttpError(400, "instruction phải là chuỗi 1–2000 ký tự");
    }
    const spec = { ...writer, task: writerTask(parsed.data) };
    // A writer gets one session; MIN_SESSION_CREDITS in sdk.ts raises this if needed.
    return this.launch("act", instruction.trim(), { prompt: instruction.trim(), agents: [spec], budget: 30, scenario: `act-${writer.name}` });
  }

  private async launch(mode: RunMode, prompt: string, input: RunInput) {
    if (this.status === "running") throw new HttpError(409, "Đang có lượt chạy");
    this.status = "running";
    this.mode = mode;
    if (mode === "brief") {
      this.events = [];
      this.times = [];
      this.report = null;
    }
    this.prompt = prompt;
    this.stopping = false;
    this.emit("run", { status: this.status, mode, prompt });
    const t0 = Date.now();
    const done = (async () => {
      try {
        const rt = (this.runtime = await createRuntime(this.cfg));
        for await (const ev of rt.run(input)) this.push(ev);
      } catch (e) {
        this.push({ type: "agent.failed", agent: "orchestrator", error: e instanceof Error ? e.message : String(e) });
      } finally {
        await this.runtime?.stop();
        this.runtime = null;
        if (mode === "brief") this.report = saveReport(this.cfg, this.events, Date.now() - t0);
        this.status = this.stopping ? "stopped" : "done";
        this.emit("run", { status: this.status, mode, report: this.report && { file: this.report.file, ...this.report.report } });
      }
    })();
    return { done };
  }

  private push(event: HubEvent) {
    const at = Date.now();
    this.events.push(event);
    this.times.push(at);
    this.emit("hub", { at, event });
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

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};
/** The dashboard: own scripts only (React Flow sets inline styles), may frame /report, never framed by another site. */
const APP_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
/** The report holds mail/chat text: no scripts at all, only its inline <style>. */
const REPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'";

/** Serve apps/web/dist; unknown paths fall back to index.html. Never leaves the dist dir. */
function serveStatic(res: ServerResponse, webDir: string, pathname: string) {
  const index = path.join(webDir, "index.html");
  if (!existsSync(index)) {
    res.writeHead(503, { "content-type": "text/plain; charset=utf-8" }).end("Chưa build giao diện: chạy `pnpm dashboard` (build apps/web rồi mở server).");
    return;
  }
  let file = path.resolve(webDir, "." + decodeURIComponent(pathname));
  if (!file.startsWith(webDir + path.sep) || !existsSync(file) || !statSync(file).isFile()) file = index;
  const type = MIME[path.extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "content-security-policy": APP_CSP, "cache-control": "no-cache" }).end(readFileSync(file));
}

export function createHubServer(hub: Hub, webDir = path.join(hub.cfg.root, "apps/web/dist")): Server {
  const server = createServer(async (req, res) => {
    try {
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("referrer-policy", "no-referrer");
      const port = (server.address() as AddressInfo).port;
      checkOrigin(req, port);
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      const route = `${req.method} ${url.pathname}`;

      if (route === "GET /api/state") return json(res, 200, hub.state());
      if (route === "GET /api/auth") return json(res, 200, await checkAuth(hub.readers, hub.cfg.runtime));
      if (route === "GET /report") {
        if (!hub.report) throw new HttpError(404, "Chưa có báo cáo: chạy check việc trước");
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-security-policy": REPORT_CSP });
        return res.end(renderReport(hub.report.report));
      }
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
      if (route === "POST /api/act") {
        const { agent, item, instruction } = await readJson(req);
        await hub.act(agent, item, instruction);
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
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) return serveStatic(res, webDir, url.pathname);
      json(res, 404, { error: "Không có" });
    } catch (e) {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  return server;
}
