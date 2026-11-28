import { useCallback, useEffect, useMemo, useState } from "react";
import { hint } from "@agenthub/core/hints";
import * as api from "./api.ts";
import { startTour } from "./tour.ts";
import { Cards } from "./Cards.tsx";
import { AgentForm, Catalog, GateForm } from "./Config.tsx";
import { Graph, SERVER_LABEL, STATUS_LABEL, type Selection } from "./Graph.tsx";
import { addToConfig, authState, derive, type Call, type CatalogItem, type Snapshot, type View } from "./state.ts";

/** Node titles: the user's name for it, else the preset's. */
function nodeLabels(snap: Snapshot) {
  const { file, agentKinds, gateKinds } = snap.config;
  return {
    ...Object.fromEntries(
      Object.entries(file.agents).map(([name, e]) => {
        const k = agentKinds.find((x) => x.preset === e.preset);
        return [`agent:${name}`, { title: e.displayName ?? k?.displayName ?? name, sub: e.description ?? k?.description ?? "Agent tự viết" }];
      }),
    ),
    ...Object.fromEntries(
      Object.entries(file.servers).map(([key, g]) => {
        const k = gateKinds.find((x) => x.preset === g.preset);
        return [`server:${key}`, { title: g.label ?? k?.label ?? SERVER_LABEL[key] ?? key, sub: g.description ?? k?.description ?? (g.type === "http" ? (g.url ?? "") : (g.command ?? "")) }];
      }),
    ),
  };
}

const secs = (ms?: number) => (ms === undefined ? "–" : `${(ms / 1000).toFixed(1)}s`);
const AUTH_LABEL = { ok: "Đã đăng nhập", error: "Lỗi", mock: "Giả lập", unknown: "Chưa rõ" } as const;

type Tab = "detail" | "config" | "auth";

export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [prompt, setPrompt] = useState("check việc");
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "orchestrator" });
  const [tab, setTab] = useState<Tab>("detail");
  const [auth, setAuth] = useState<api.AuthStatus[] | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [timeWindow, setTimeWindow] = useState("24h");
  /** Agents not to run this time (all run by default). */
  const [skip, setSkip] = useState<string[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  /** Sign-in output per gate (device code, link, CLI lines). */
  const [logins, setLogins] = useState<Record<string, { lines: string[]; code?: string; url?: string; done?: boolean; ok?: boolean }>>({});

  useEffect(
    () =>
      api.subscribe({
        state: (s) => setSnap(s),
        hub: (e) => setSnap((s) => s && { ...s, events: [...s.events, e] }),
        run: (r) => {
          const fresh = r.status === "running";
          setSnap((s) => s && { ...s, status: r.status, prompt: r.prompt ?? s.prompt, report: r.report ?? (fresh ? null : s.report), events: fresh ? [] : s.events });
        },
        cards: (cardStates) => setSnap((s) => s && { ...s, cardStates }),
        login: (e) =>
          setLogins((all) => {
            const cur = all[e.key] ?? { lines: [] };
            return { ...all, [e.key]: { lines: [...cur.lines, e.text].slice(-8), code: e.code ?? cur.code, url: e.url ?? cur.url, done: e.done, ok: e.ok } };
          }),
        connection: setConnected,
      }),
    [],
  );

  const checkAuth = useCallback(async () => {
    setAuthBusy(true);
    try {
      setAuth(await api.auth());
    } catch (e) {
      setError(String(e));
    } finally {
      setAuthBusy(false);
    }
  }, []);
  useEffect(() => void checkAuth(), [checkAuth]);
  // A sign-in finished: check again, so the node and chip turn green.
  const finished = Object.values(logins).filter((l) => l.done).length;
  useEffect(() => {
    if (finished) void checkAuth();
  }, [finished, checkAuth]);

  const view = useMemo(() => (snap ? derive(snap.agents, snap.events) : null), [snap]);
  const running = snap?.status === "running";

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const chosen = snap ? snap.agents.filter((a) => !skip.includes(a.name)) : [];
  const minBudget = chosen.filter((a) => !a.missingConfig).length * (snap?.minSessionCredits ?? 30);
  const cap = budget ?? snap?.maxAiCredits ?? 150;
  const start = () => act(() => api.run(prompt.trim() || "check việc", { window: timeWindow, agents: chosen.map((a) => a.name), budget: cap }));
  const exportMd = () =>
    act(async () => {
      const md = await api.exportMarkdown();
      await navigator.clipboard.writeText(md).catch(() => {
        // No clipboard (http page, permissions): download instead.
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
        a.download = `viec-can-lam-${snap?.report?.date ?? "hom-nay"}.md`;
        a.click();
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });

  const saveConfig = (file: Snapshot["config"]["file"]) => act(() => api.saveConfig(file));
  const addItem = (item: CatalogItem) => {
    if (!snap) return;
    const r = addToConfig(snap.config.file, item, snap.config.agentKinds);
    void act(async () => {
      await api.saveConfig(r.file);
      setSelection(r.select);
      setTab("config");
    });
  };

  if (!snap || !view) return <div className="loading">{connected ? "Đang tải…" : "Đang kết nối tới pnpm hub…"}</div>;

  const credits = view.usedAiCredits;
  const pct = Math.min(100, (credits / snap.maxAiCredits) * 100);

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Agent Hub</div>
        <form
          className="command"
          data-tour="command"
          onSubmit={(e) => {
            e.preventDefault();
            void start();
          }}
        >
          <input
            aria-label="Lệnh"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void start();
            }}
            disabled={running}
          />
          <select aria-label="Khoảng thời gian" value={timeWindow} onChange={(e) => setTimeWindow(e.target.value)} disabled={running} data-tour="window">
            {Object.entries(snap.windows).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <details className="run-agents" data-tour="agents">
            <summary>
              Agent {chosen.length}/{snap.agents.length}
            </summary>
            <div className="dropdown">
              {snap.agents.map((a) => (
                <label key={a.name} title={a.description}>
                  <input
                    type="checkbox"
                    checked={!skip.includes(a.name)}
                    disabled={running}
                    onChange={(e) => setSkip(e.target.checked ? skip.filter((n) => n !== a.name) : [...skip, a.name])}
                  />
                  {a.displayName}
                </label>
              ))}
              <label title="Trần AI Credits cho lượt này. Mỗi agent cần tối thiểu 30 (giới hạn của runtime); đây là trần, không phải số tiêu.">
                Trần credit
                <input type="number" min={1} max={1000} value={cap} disabled={running} onChange={(e) => setBudget(Number(e.target.value) || null)} />
              </label>
              {snap.runtime !== "mock" && cap < minBudget && <div className="call-error">Cần ít nhất {minBudget} cho {chosen.length} agent</div>}
            </div>
          </details>
          {running ? (
            <button type="button" className="danger" onClick={() => act(api.stop)}>
              Dừng
            </button>
          ) : (
            <button type="submit" className="primary" title="Ctrl+Enter" aria-label="Chạy" disabled={!chosen.length}>
              Chạy ▶
            </button>
          )}
        </form>
        <span className={`chip runtime ${snap.runtime}`} title="AGENTHUB_RUNTIME" data-tour="runtime">
          {snap.runtime}
        </span>
        <div className="credits" data-tour="credits" title="AI Credits đã dùng / ngân sách (AGENTHUB_MAX_AI_CREDITS)">
          <div className="meter">
            <div className={`fill${pct > 85 ? " hot" : ""}`} style={{ width: `${pct}%` }} />
          </div>
          <span>
            {credits.toFixed(1)} / {snap.maxAiCredits} credits
          </span>
        </div>
        <div className="auth-chips" data-tour="auth">
          {(auth ?? []).map((a) => {
            const st = authState(a.status, view, a.source);
            return (
              <button key={a.source} className={`chip auth ${st}`} title={`${SERVER_LABEL[a.source] ?? a.source}: ${st === a.status ? a.detail : "đã gọi tool thành công trong lượt này"}`} onClick={() => setTab("auth")}>
                <span className={`dot ${st === "ok" ? "done" : st === "error" ? "failed" : "idle"}`} aria-hidden />
                {a.source}
              </button>
            );
          })}
        </div>
        <button type="button" className="tour-start" onClick={() => startTour(setTab)}>
          Hướng dẫn
        </button>
        {!connected && <span className="chip offline">Mất kết nối</span>}
      </header>
      {snap.config.error && (
        <div className="banner" role="alert">
          agenthub.local.json lỗi, đang dùng cấu hình có sẵn: {snap.config.error}
        </div>
      )}
      {error && (
        <div className="banner" role="alert">
          {error} <button onClick={() => setError(null)}>Đóng</button>
        </div>
      )}

      <main className="main">
        <section className="graph" aria-label="Sơ đồ agent" data-tour="graph">
          <Graph
            file={snap.config.file}
            problems={Object.fromEntries(snap.agents.map((a) => [a.name, a.missingConfig]))}
            labels={nodeLabels(snap)}
            view={view}
            running={running}
            selection={selection}
            onSelect={(s) => (setSelection(s), setTab(tab === "auth" || (tab === "config" && s.kind === "orchestrator") ? "detail" : tab))}
            onChange={saveConfig}
            onDropItem={(data) => addItem(JSON.parse(data) as CatalogItem)}
          />
          <button className="add-node" onClick={() => setCatalogOpen(!catalogOpen)} disabled={running} data-tour="catalog">
            ＋ Thêm cổng / agent
          </button>
          {catalogOpen && <Catalog config={snap.config} onAdd={addItem} onClose={() => setCatalogOpen(false)} />}
        </section>
        <aside className="panel" data-tour="panel">
          <nav className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "detail"} onClick={() => setTab("detail")}>
              Chi tiết
            </button>
            <button role="tab" aria-selected={tab === "config"} onClick={() => setTab("config")}>
              Cấu hình
            </button>
            <button role="tab" aria-selected={tab === "auth"} onClick={() => setTab("auth")}>
              Đăng nhập
            </button>
          </nav>
          <div className="tab-body">
            {tab === "detail" && <Detail snap={snap} view={view} selection={selection} />}
            {tab === "config" &&
              (selection.kind === "server" ? (
                <GateForm name={selection.name} config={snap.config} runtime={snap.runtime} onSave={saveConfig} />
              ) : selection.kind === "agent" ? (
                <AgentForm name={selection.name} config={snap.config} problem={snap.agents.find((a) => a.name === selection.name)?.missingConfig ?? null} onSave={saveConfig} />
              ) : (
                <p className="muted detail">Bấm một agent hoặc cổng MCP trên sơ đồ để sửa. Bấm "＋ Thêm cổng / agent" để thêm mới; kéo dây từ agent sang cổng để nối.</p>
              ))}
            {tab === "auth" && (
              <AuthPanel
                auth={auth}
                view={view}
                snap={snap}
                busy={authBusy}
                onCheck={checkAuth}
                logins={logins}
                onLogin={(key, deviceCode) => {
                  setLogins((all) => ({ ...all, [key]: { lines: ["Đang mở…"] } }));
                  void act(() => api.login(key, deviceCode));
                }}
                onLogout={(key, label) => {
                  if (confirm(`Đăng xuất ${label}? Lệnh az / gh trên máy này cũng bị đăng xuất.`)) void act(() => api.logout(key));
                }}
                onOpenConfig={(key) => {
                  setSelection({ kind: "server", name: key });
                  setTab("config");
                }}
              />
            )}
          </div>
        </aside>
      </main>

      <section className="report" aria-label="Việc cần làm" data-tour="report">
        {copied && <div className="toast">Đã sao chép danh sách việc (Markdown)</div>}
        <Cards snap={snap} running={running} onMark={(key, change) => act(() => api.markCard(key, change))} onExport={exportMd} />
      </section>
    </div>
  );
}

function CallRow({ c, t0, shownAbove }: { c: Call; t0?: number; shownAbove?: string }) {
  const state = c.endedAt === undefined ? "…" : c.denied ? "⛔" : c.error ? "✗" : "✓";
  return (
    <li className={`call ${c.denied ? "denied" : c.error ? "err" : ""}`}>
      <div className="call-line">
        <span className="call-state">{state}</span>
        <code>
          {c.server}/{c.tool}
        </code>
        <span className="muted">
          {t0 !== undefined ? `+${secs(c.startedAt - t0)}` : ""}
          {c.endedAt !== undefined ? ` · ${secs(c.endedAt - c.startedAt)}` : ""}
        </span>
      </div>
      {c.error && <div className="call-error">{c.denied ? "Gate chặn: tool không có trong allowlist" : c.error}</div>}
      {c.hint && c.error !== shownAbove && <div className="hint">→ {c.hint}</div>}
    </li>
  );
}

function Detail({ snap, view, selection }: { snap: Snapshot; view: View; selection: Selection }) {
  if (selection.kind === "orchestrator") {
    const counts = Object.values(view.agents).reduce<Record<string, number>>((m, a) => ((m[a.status] = (m[a.status] ?? 0) + 1), m), {});
    return (
      <div className="detail">
        <h3>Orchestrator</h3>
        <dl>
          <dt>Trạng thái</dt>
          <dd>{snap.status === "running" ? "Đang chạy" : snap.status === "idle" ? "Chưa chạy" : snap.status === "stopped" ? "Đã dừng" : "Xong"}</dd>
          <dt>Lệnh</dt>
          <dd>{snap.prompt || "–"}</dd>
          <dt>Agent</dt>
          <dd>{Object.entries(counts).map(([s, n]) => `${n} ${STATUS_LABEL[s as keyof typeof STATUS_LABEL].toLowerCase()}`).join(", ")}</dd>
          <dt>Sự kiện</dt>
          <dd>{snap.events.length}</dd>
        </dl>
        {view.orchestratorError && <p className="call-error">{view.orchestratorError}</p>}
        <p className="muted">Bấm vào một agent hoặc MCP server để xem từng lần gọi tool.</p>
      </div>
    );
  }
  if (selection.kind === "server") {
    const sv = view.servers[selection.name] ?? { status: "idle" as const, calls: 0 };
    const calls = Object.values(view.agents).flatMap((a) => a.calls.filter((c) => c.server === selection.name));
    const t0 = snap.events[0]?.at;
    return (
      <div className="detail">
        <h3>{SERVER_LABEL[selection.name] ?? selection.name}</h3>
        <dl>
          <dt>Trạng thái</dt>
          <dd>{STATUS_LABEL[sv.status]}</dd>
          <dt>Lần gọi</dt>
          <dd>{sv.calls}</dd>
        </dl>
        <ul className="calls">{calls.map((c) => <CallRow key={c.callId} c={c} t0={t0} />)}</ul>
      </div>
    );
  }
  const info = snap.agents.find((a) => a.name === selection.name);
  const av = view.agents[selection.name];
  if (!info || !av) return <p className="muted detail">Agent đang tắt. Bật ở tab Cấu hình.</p>;
  return (
    <div className="detail">
      <h3>{info.displayName}</h3>
      <dl>
        <dt>Agent</dt>
        <dd>
          <code>{info.name}</code> (chỉ đọc)
        </dd>
        <dt>Trạng thái</dt>
        <dd>{STATUS_LABEL[av.status]}</dd>
        <dt>Thời gian</dt>
        <dd>{secs(av.durationMs)}</dd>
        <dt>AI Credits</dt>
        <dd>{av.credits?.toFixed(2) ?? "–"}</dd>
        <dt>Token</dt>
        <dd>{av.tokens ?? "–"}</dd>
        <dt>Mục</dt>
        <dd>{av.items}</dd>
      </dl>
      {av.error && (
        <div className="problem">
          <div className="call-error">{av.error}</div>
          {av.hint && <div className="hint">→ {av.hint}</div>}
        </div>
      )}
      <h4>Tool đã gọi ({av.calls.length})</h4>
      <ul className="calls">{av.calls.map((c) => <CallRow key={c.callId} c={c} t0={av.startedAt} shownAbove={av.error} />)}</ul>
      {av.messages.length > 0 && (
        <>
          <h4>Thông báo</h4>
          <ul className="messages">{av.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>
      )}
    </div>
  );
}

function AuthPanel({
  auth,
  view,
  snap,
  busy,
  onCheck,
  logins,
  onLogin,
  onLogout,
  onOpenConfig,
}: {
  auth: api.AuthStatus[] | null;
  view: View;
  snap: Snapshot;
  busy: boolean;
  onCheck: () => void;
  logins: Record<string, { lines: string[]; code?: string; url?: string; done?: boolean; ok?: boolean }>;
  onLogin: (key: string, deviceCode: boolean) => void;
  onLogout: (key: string, label: string) => void;
  onOpenConfig: (key: string) => void;
}) {
  const labels = nodeLabels(snap);
  const mock = snap.runtime === "mock";
  return (
    <div className="detail">
      <div className="row">
        <p className="muted">Cấp quyền cho từng cổng. Kiểm trạng thái không tốn AI Credits, không hiện token.</p>
        <button onClick={onCheck} disabled={busy}>
          {busy ? "Đang kiểm…" : "Kiểm tra lại"}
        </button>
      </div>
      {mock && <p className="hint">Runtime mock: không đăng nhập dịch vụ thật. Chạy với AGENTHUB_RUNTIME=copilot để đăng nhập.</p>}
      <ul className="auth-list">
        {(auth ?? []).map((a) => {
          const h = a.status === "error" ? hint(a.detail) : null;
          const st = authState(a.status, view, a.source);
          const label = labels[`server:${a.source}`]?.title ?? a.source;
          const lg = logins[a.source];
          const failedRun = Object.entries(view.agents).find(([, v]) => v.status === "needs-action" && v.calls.some((c) => c.server === a.source));
          return (
            <li key={a.source} className={st}>
              <div className="row">
                <b>
                  <span className="tag mcp">MCP</span> {label}
                </b>
                <span className={`chip auth ${st}`}>{AUTH_LABEL[st]}</span>
              </div>
              <div className="muted">{a.detail}</div>
              {st !== a.status && <div className="muted">Đã gọi tool thành công trong lượt chạy này.</div>}
              {h && <div className="hint">→ {h}</div>}
              {failedRun && snap.status !== "idle" && (
                <div className="problem">
                  <div className="call-error">Lần chạy gần nhất: {failedRun[1].error}</div>
                  {failedRun[1].hint && <div className="hint">→ {failedRun[1].hint}</div>}
                </div>
              )}
              {!mock && (
                <div className="row actions">
                  {a.signIn === "microsoft" && (
                    <>
                      <button className="primary" onClick={() => onLogin(a.source, false)} disabled={!!lg && !lg.done} title="Mở trang đăng nhập Microsoft trên máy này">
                        Đăng nhập Microsoft
                      </button>
                      <button onClick={() => onLogin(a.source, true)} disabled={!!lg && !lg.done} title="Khi trình duyệt không tự mở: nhập mã ở trang microsoft.com/devicelogin">
                        Dùng mã thiết bị
                      </button>
                    </>
                  )}
                  {a.signIn === "github" && (
                    <button className="primary" onClick={() => onLogin(a.source, false)} disabled={!!lg && !lg.done}>
                      Đăng nhập GitHub
                    </button>
                  )}
                  {a.signIn === "workiq" && (
                    <button onClick={() => onLogin(a.source, false)} disabled={!!lg && !lg.done} title="Chỉ bạn bấm; agent không bao giờ tự chấp nhận">
                      Chấp nhận điều khoản Work IQ
                    </button>
                  )}
                  {a.signIn === "token" && <button onClick={() => onOpenConfig(a.source)}>Nhập token ở form cổng</button>}
                  {(a.signIn === "microsoft" || a.signIn === "github") && st === "ok" && <button onClick={() => onLogout(a.source, label)}>Đăng xuất</button>}
                </div>
              )}
              {lg && (
                <div className="login-out">
                  {lg.code && (
                    <div className="device-code">
                      Mã: <b>{lg.code}</b>{" "}
                      {lg.url && (
                        <a href={lg.url} target="_blank" rel="noopener noreferrer">
                          Mở trang nhập mã ↗
                        </a>
                      )}
                    </div>
                  )}
                  {!lg.code && lg.url && (
                    <a href={lg.url} target="_blank" rel="noopener noreferrer">
                      Mở trang đăng nhập ↗
                    </a>
                  )}
                  <pre>{lg.lines.join("\n")}</pre>
                  {lg.done && <div className={lg.ok ? "ok" : "call-error"}>{lg.ok ? "Xong. Đã kiểm lại trạng thái." : "Chưa xong, xem thông báo trên."}</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
