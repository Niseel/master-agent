/**
 * Local dashboard API (Phase 2), started by `pnpm hub` (main.ts). Listens on 127.0.0.1 only.
 *   GET  /api/state               runtime, agents, run status, events so far ({at, event}), last report
 *   GET  /api/events              Server-Sent Events: `state` once, then `hub` ({at, event}) and `run` (status changes)
 *   GET  /api/auth                sign-in state per source (no tokens, no AI Credits)
 *   GET  /report                  last report as HTML (no scripts allowed)
 *   GET  /*                       the built dashboard (apps/web/dist, `pnpm dashboard`)
 *   GET  /api/export.md           the to-do list as Markdown
 *   POST /api/run      {prompt, window?, agents?, budget?}  start a brief run (409 while one is running)
 *   POST /api/cards    {key, status?, todos?}  the user's marks on a card (done / hidden / open, edited todo list)
 *   PUT  /api/config   {file}     gates and agents (agenthub.local.json, milestone-1 §4); 409 while running
 *   POST /api/import   {text}     servers from a VS Code mcp.json into the catalog
 *   POST /api/tools    {key}      read tools a gate offers (0 credit), for the user to tick
 *   POST /api/secrets  {id, value}  a gate secret into the OS keychain ("" deletes it); never read back
 *   POST /api/login    {key, deviceCode?}  sign a gate in with its CLI (az / gh / Work IQ EULA); progress as SSE `login`
 *   POST /api/logout   {key}
 *   POST /api/stop
 * SSE + POST instead of WebSocket: the stream only flows server -> browser, and node:http does both without a dependency.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { checkGates } from "@agenthub/core/auth";
import { parseSignInLine, signInCommand, signOutCommand, type Command, type SignIn } from "@agenthub/core/login";
import { MIN_SESSION_CREDITS, WINDOW_LABEL, type AgentSpec, type Window } from "@agenthub/core/agents";
import { agentKinds, buildAgents, defaultHubFile, effectiveConfig, gateConfig, GATE_KINDS, HubFile, importMcpJson, loadHubFile, saveHubFile } from "@agenthub/core/hub-config";
import { keychain, resolveInputs, type SecretStore } from "@agenthub/core/secrets";
import { listGateTools } from "@agenthub/core/tool-list";
import { cardsMarkdown, viewCards, type CardStates, type TodoStep } from "@agenthub/core/cards";
import type { HubConfig } from "@agenthub/core/config";
import type { HubEvent } from "@agenthub/core/events";
import { renderReport, saveReport, type BriefReport } from "@agenthub/core/report";
import { createRuntime, type AgentRuntime } from "@agenthub/core/runtime/index";

export type RunStatus = "idle" | "running" | "done" | "stopped";
type Send = (event: "state" | "hub" | "run" | "cards" | "login", data: unknown) => void;

export interface RunOptions {
  window?: Window;
  /** Names of the agents to run; all when omitted. */
  agents?: string[];
  /** AI Credit cap for the run; the config value when omitted. */
  budget?: number;
}

/** One run at a time. Holds the events so a browser that connects late sees the whole run. */
export class Hub {
  events: HubEvent[] = [];
  /** Receive time (ms) of each event, same index: events carry no time of their own. */
  times: number[] = [];
  prompt = "";
  status: RunStatus = "idle";
  report: { file: string; report: BriefReport } | null = null;
  private runtime: AgentRuntime | null = null;
  private stopping = false;
  private listeners = new Set<Send>();
  /** The reader agents: what a brief runs and the dashboard draws. Rebuilt when the config changes. */
  agents: AgentSpec[] = [];
  /** Gates and agents (agenthub.local.json, or the built-in setup). */
  file: HubFile;
  /** The file did not parse: the built-in setup runs, the dashboard shows why. */
  configError: string | null = null;
  /** The user's marks on cards, kept in <reports>/cards-state.json (local, never committed). */
  cardStates: CardStates;
  private statesPath: string;

  constructor(
    readonly cfg: HubConfig,
    private readonly secrets: SecretStore & Partial<Pick<typeof keychain, "set" | "delete">> = keychain,
  ) {
    try {
      this.file = loadHubFile(cfg);
    } catch (e) {
      this.file = defaultHubFile(cfg);
      this.configError = e instanceof Error ? e.message : String(e);
    }
    this.agents = buildAgents(cfg, this.file);
    this.statesPath = statesFile(cfg.root);
    this.cardStates = loadStates(this.statesPath);
  }

  private configView() {
    const eff = effectiveConfig(this.cfg, this.file);
    return {
      file: this.file,
      error: this.configError,
      gateKinds: GATE_KINDS,
      agentKinds: agentKinds(eff),
      /** Which password inputs have a value in the keychain (the value itself never leaves the server). */
      secrets: Object.fromEntries(this.file.inputs.filter((i) => i.password).map((i) => [i.id, !!this.secrets.get(i.id)])),
    };
  }

  /** Save a new gates/agents setup and rebuild the agents. */
  setConfig(body: unknown) {
    if (this.status === "running") throw new HttpError(409, "Đang có lượt chạy: lưu cấu hình sau khi xong");
    const parsed = HubFile.safeParse(body);
    if (!parsed.success) throw new HttpError(400, `Cấu hình không hợp lệ: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    this.file = parsed.data;
    this.configError = null;
    saveHubFile(this.cfg, this.file);
    this.agents = buildAgents(this.cfg, this.file);
    this.emit("state", this.state());
  }

  importServers(text: unknown) {
    if (typeof text !== "string" || !text.trim() || text.length > 200_000) throw new HttpError(400, "Cần nội dung file mcp.json");
    let r: ReturnType<typeof importMcpJson>;
    try {
      r = importMcpJson(text);
    } catch (e) {
      throw new HttpError(400, `Không đọc được mcp.json: ${e instanceof Error ? e.message : String(e)}`);
    }
    const known = new Set(this.file.inputs.map((i) => i.id));
    this.setConfig({ ...this.file, catalog: { ...this.file.catalog, ...r.catalog }, inputs: [...this.file.inputs, ...r.inputs.filter((i) => !known.has(i.id))] });
    return { added: Object.keys(r.catalog), secrets: r.inputs.map((i) => i.id), skipped: r.skipped };
  }

  async tools(key: unknown) {
    if (typeof key !== "string") throw new HttpError(400, "key không hợp lệ");
    const g = this.file.servers[key] ?? this.file.catalog[key];
    if (!g) throw new HttpError(404, `Không có cổng ${key}`);
    const eff = effectiveConfig(this.cfg, this.file);
    const { server, problem } = gateConfig(eff, key, g);
    if (!server) throw new HttpError(400, problem ?? "Cổng chưa đủ thông tin");
    const { value, missing } = resolveInputs(server, this.file, this.secrets);
    if (missing.length) throw new HttpError(400, `Thiếu giá trị: ${missing.join(", ")} (nhập ở tab Đăng nhập)`);
    try {
      return await listGateTools(eff, key, value, g.preset);
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : String(e));
    }
  }

  /** Sign-in processes in flight, by gate key. */
  private logins = new Map<string, ChildProcess>();

  private signInOf(key: unknown): { kind: SignIn; configDir?: string } {
    if (this.cfg.runtime === "mock") throw new HttpError(400, "Runtime mock: không đăng nhập dịch vụ thật. Chạy với AGENTHUB_RUNTIME=copilot.");
    const g = typeof key === "string" ? this.file.servers[key] : undefined;
    if (!g) throw new HttpError(404, "Không có cổng này");
    const kind = GATE_KINDS.find((k) => k.preset === g.preset)?.signIn;
    if (!kind) throw new HttpError(400, "Cổng này đăng nhập bằng bí mật: nhập ở form của cổng (tab Cấu hình)");
    return { kind, configDir: g.account || (g.preset === "ado" ? process.env.ADO_AZURE_CONFIG_DIR : undefined) };
  }

  /** Run the gate's sign-in CLI; every output line goes to the browser, with the device code and link pulled out. */
  login(key: string, deviceCode = false) {
    const { kind, configDir } = this.signInOf(key);
    if (this.logins.has(key)) throw new HttpError(409, "Đang đăng nhập cổng này");
    let cmd: Command;
    try {
      cmd = signInCommand(kind, { configDir, deviceCode });
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : String(e));
    }
    this.runCli(key, cmd);
  }

  logout(key: string) {
    const { kind, configDir } = this.signInOf(key);
    const cmd = signOutCommand(kind, { configDir });
    if (!cmd) throw new HttpError(400, "Cổng này không có đăng xuất");
    this.runCli(key, cmd);
  }

  private runCli(key: string, cmd: Command) {
    const child = spawn(cmd.command, cmd.args, { env: { ...process.env, ...cmd.env }, stdio: ["pipe", "pipe", "pipe"] });
    this.logins.set(key, child);
    const timer = setTimeout(() => child.kill(), 10 * 60_000);
    const onData = (buf: Buffer) => {
      for (const line of buf.toString("utf8").split(/\r?\n/).filter((l) => l.trim())) this.emit("login", { key, text: line.slice(0, 500), ...parseSignInLine(line) });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.stdin.end("\n"); // gh: "Press Enter to open github.com in your browser"
    const done = (ok: boolean, text: string) => {
      clearTimeout(timer);
      this.logins.delete(key);
      this.emit("login", { key, text, done: true, ok });
    };
    child.on("error", (e: NodeJS.ErrnoException) => done(false, e.code === "ENOENT" ? `Chưa cài lệnh \`${cmd.command}\` (hoặc không có trong PATH)` : e.message));
    child.on("close", (code) => done(code === 0, code === 0 ? "Xong" : `Lệnh kết thúc với mã ${code}`));
  }

  auth() {
    return checkGates(this.cfg, this.file, this.secrets);
  }

  setSecret(id: unknown, value: unknown) {
    const input = this.file.inputs.find((i) => i.id === id && i.password);
    if (!input) throw new HttpError(400, "Không có ô bí mật này trong cấu hình");
    if (typeof value !== "string" || value.length > 10_000) throw new HttpError(400, "Giá trị không hợp lệ");
    if (value) this.secrets.set?.(input.id, value);
    else this.secrets.delete?.(input.id);
    this.emit("state", this.state());
  }

  state() {
    return {
      runtime: this.cfg.runtime,
      maxAiCredits: this.cfg.maxAiCredits,
      agents: this.agents.map((a) => ({
        name: a.name,
        displayName: a.displayName,
        description: a.description,
        todoRule: a.todoRule,
        servers: Object.keys(a.mcpServers),
        missingConfig: a.missingConfig ?? null,
      })),
      minSessionCredits: MIN_SESSION_CREDITS,
      windows: WINDOW_LABEL,
      cardStates: this.cardStates,
      config: this.configView(),
      status: this.status,
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
  start(prompt: string, opts: RunOptions = {}) {
    if (this.status === "running") throw new HttpError(409, "Đang có lượt chạy");
    // The ADO gate's own az profile: mcpAuth (runtime/sdk.ts) reads it for the Entra token.
    // ponytail: one ADO account per hub; per-gate profiles need mcpAuth keyed by server name.
    const adoProfile = Object.values(this.file.servers).find((g) => g.preset === "ado" && g.account)?.account;
    if (adoProfile) process.env.ADO_AZURE_CONFIG_DIR = adoProfile;
    // Secrets and values fill `${input:…}` now, so they live only in memory for this run.
    const agents = (opts.agents ? this.agents.filter((a) => opts.agents!.includes(a.name)) : this.agents).map((a) => {
      const { value, missing } = resolveInputs(a.mcpServers, this.file, this.secrets);
      const need = missing.length ? `Thiếu giá trị ${missing.join(", ")}: nhập ở tab Đăng nhập` : undefined;
      return { ...a, mcpServers: value, missingConfig: [a.missingConfig, need].filter(Boolean).join("; ") || undefined };
    });
    if (!agents.length) throw new HttpError(400, "Chọn ít nhất 1 agent");
    // The runtime refuses a session cap under MIN_SESSION_CREDITS: say so before starting.
    const budget = opts.budget ?? this.cfg.maxAiCredits;
    const live = agents.filter((a) => !a.missingConfig).length;
    if (this.cfg.runtime !== "mock" && budget < live * MIN_SESSION_CREDITS) {
      throw new HttpError(400, `Ngân sách ${budget} thấp hơn mức tối thiểu ${live * MIN_SESSION_CREDITS} cho ${live} agent (${MIN_SESSION_CREDITS} mỗi agent)`);
    }
    this.status = "running";
    this.events = [];
    this.times = [];
    this.report = null;
    this.prompt = prompt;
    this.stopping = false;
    this.emit("run", { status: this.status, prompt });
    const t0 = Date.now();
    const done = (async () => {
      try {
        const rt = (this.runtime = await createRuntime(this.cfg));
        for await (const ev of rt.run({ prompt, agents, budget, window: opts.window ?? "24h" })) this.push(ev);
      } catch (e) {
        this.push({ type: "agent.failed", agent: "orchestrator", error: e instanceof Error ? e.message : String(e) });
      } finally {
        await this.runtime?.stop();
        this.runtime = null;
        this.report = saveReport(this.cfg, this.events, Date.now() - t0, new Date(), this.stopping);
        this.status = this.stopping ? "stopped" : "done";
        this.emit("run", { status: this.status, report: { file: this.report.file, ...this.report.report } });
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

  async stop() {
    this.stopping = true;
    await this.runtime?.stop();
  }

  /** Mark a card (done / hidden / open) or save its edited todo list. `seen` = the card's updatedAt now, for "Cập nhật mới". */
  markCard(key: unknown, status: unknown, todos: unknown) {
    if (typeof key !== "string" || !key || key.length > 300) throw new HttpError(400, "key không hợp lệ");
    if (status !== undefined && status !== "open" && status !== "done" && status !== "hidden") throw new HttpError(400, "status phải là open, done hoặc hidden");
    const steps = todos === undefined ? undefined : parseSteps(todos);
    const card = this.report?.report.cards.find((c) => c.key === key);
    const prev = this.cardStates[key];
    this.cardStates = {
      ...this.cardStates,
      [key]: {
        status: (status as "open" | "done" | "hidden" | undefined) ?? prev?.status ?? "open",
        at: status !== undefined ? new Date().toISOString() : (prev?.at ?? new Date().toISOString()),
        seen: status !== undefined ? (card?.updatedAt ?? null) : (prev?.seen ?? null),
        ...(steps ? { todos: steps } : prev?.todos ? { todos: prev.todos } : {}),
      },
    };
    saveStates(this.statesPath, this.cardStates);
    this.emit("cards", this.cardStates);
  }

  markdown() {
    if (!this.report) throw new HttpError(404, "Chưa có báo cáo: chạy check việc trước");
    return cardsMarkdown(viewCards(this.report.report.cards, this.cardStates), this.report.report.date);
  }
}

/** A todo list from the browser: at most 30 steps of at most 500 characters. */
function parseSteps(todos: unknown): TodoStep[] {
  if (!Array.isArray(todos) || todos.length > 30) throw new HttpError(400, "todos phải là danh sách tối đa 30 bước");
  return todos.map((t) => {
    const o = t as Partial<TodoStep>;
    if (typeof o?.text !== "string" || o.text.length > 500 || typeof o.done !== "boolean" || typeof o.struck !== "boolean") {
      throw new HttpError(400, "Mỗi bước cần { text (≤500 ký tự), done, struck }");
    }
    return { text: o.text, done: o.done, struck: o.struck };
  });
}

const WINDOWS = Object.keys(WINDOW_LABEL);
function runOptions(body: Record<string, unknown>): RunOptions {
  const { window, agents, budget } = body;
  if (window !== undefined && !(typeof window === "string" && WINDOWS.includes(window))) throw new HttpError(400, `window phải là một trong: ${WINDOWS.join(", ")}`);
  if (agents !== undefined && !(Array.isArray(agents) && agents.every((a) => typeof a === "string"))) throw new HttpError(400, "agents phải là danh sách tên agent");
  if (budget !== undefined && !(typeof budget === "number" && budget > 0 && budget <= 1000)) throw new HttpError(400, "budget phải là số từ 1 tới 1000");
  return { window: window as Window | undefined, agents: agents as string[] | undefined, budget: budget as number | undefined };
}
const statesFile = (root: string) => path.join(process.env.AGENTHUB_REPORT_DIR || path.join(root, "reports"), "cards-state.json");

function loadStates(file: string): CardStates {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function saveStates(file: string, states: CardStates) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(states, null, 2));
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const json = (res: ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify(body));

async function readJson(req: IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  // Only JSON: a cross-site <form> cannot send it without a CORS preflight, which this server never answers.
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new HttpError(415, "Cần Content-Type: application/json");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req as AsyncIterable<Buffer>) {
    if ((size += c.length) > limit) throw new HttpError(413, "Body quá lớn");
    chunks.push(c);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {}
  throw new HttpError(400, "JSON không hợp lệ");
}

/**
 * Local-only guard. The API starts runs that read the user's mail and boards, so any web page the user opens must
 * not reach it:
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
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
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
      if (route === "GET /api/auth") return json(res, 200, await hub.auth());
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
        const body = await readJson(req);
        const { prompt } = body;
        await hub.start(typeof prompt === "string" && prompt.trim() ? prompt.trim().slice(0, 2000) : "check việc", runOptions(body));
        return json(res, 202, { status: hub.status });
      }
      if (route === "POST /api/cards") {
        const { key, status, todos } = await readJson(req);
        hub.markCard(key, status, todos);
        return json(res, 200, { ok: true });
      }
      if (route === "PUT /api/config") {
        const { file } = await readJson(req);
        hub.setConfig(file);
        return json(res, 200, { ok: true });
      }
      if (route === "POST /api/import") {
        const { text } = await readJson(req, 256 * 1024);
        return json(res, 200, hub.importServers(text));
      }
      if (route === "POST /api/tools") {
        const { key } = await readJson(req);
        return json(res, 200, { tools: await hub.tools(key) });
      }
      if (route === "POST /api/secrets") {
        const { id, value } = await readJson(req);
        hub.setSecret(id, value);
        return json(res, 200, { ok: true });
      }
      if (route === "POST /api/login") {
        const { key, deviceCode } = await readJson(req);
        hub.login(String(key), deviceCode === true);
        return json(res, 202, { ok: true });
      }
      if (route === "POST /api/logout") {
        const { key } = await readJson(req);
        hub.logout(String(key));
        return json(res, 202, { ok: true });
      }
      if (route === "GET /api/export.md") {
        const md = hub.markdown(); // throws 404 before any header is sent
        res.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
        return res.end(md);
      }
      if (route === "POST /api/stop") {
        await readJson(req);
        await hub.stop();
        return json(res, 200, { status: hub.status });
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) return serveStatic(res, webDir, url.pathname);
      json(res, 404, { error: "Không có" });
    } catch (e) {
      if (res.headersSent) return void res.end(); // never leave a request hanging
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      json(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  return server;
}
