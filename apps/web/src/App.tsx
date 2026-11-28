import { useCallback, useEffect, useMemo, useState } from "react";
import { hint } from "@agenthub/core/hints";
import * as api from "./api.ts";
import { startTour } from "./tour.ts";
import { Graph, SERVER_LABEL, STATUS_LABEL, type Selection } from "./Graph.tsx";
import { authState, derive, type Call, type Snapshot, type View } from "./state.ts";

const secs = (ms?: number) => (ms === undefined ? "–" : `${(ms / 1000).toFixed(1)}s`);
const AUTH_LABEL = { ok: "Đã đăng nhập", error: "Lỗi", mock: "Giả lập", unknown: "Chưa rõ" } as const;

type Tab = "detail" | "auth";

export function App() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [prompt, setPrompt] = useState("check việc");
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "orchestrator" });
  const [tab, setTab] = useState<Tab>("detail");
  const [auth, setAuth] = useState<api.AuthStatus[] | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [reportKey, setReportKey] = useState(0);

  useEffect(
    () =>
      api.subscribe({
        state: (s) => setSnap(s),
        hub: (e) => setSnap((s) => s && { ...s, events: [...s.events, e] }),
        run: (r) => {
          const fresh = r.status === "running";
          setSnap((s) => s && { ...s, status: r.status, prompt: r.prompt ?? s.prompt, report: r.report ?? (fresh ? null : s.report), events: fresh ? [] : s.events });
          if (r.report) setReportKey(Date.now());
        },
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
  const start = () => act(() => api.run(prompt.trim() || "check việc"));

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
          {running ? (
            <button type="button" className="danger" onClick={() => act(api.stop)}>
              Dừng
            </button>
          ) : (
            <button type="submit" className="primary" title="Ctrl+Enter" aria-label="Chạy">
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
      {error && (
        <div className="banner" role="alert">
          {error} <button onClick={() => setError(null)}>Đóng</button>
        </div>
      )}

      <main className="main">
        <section className="graph" aria-label="Sơ đồ agent" data-tour="graph">
          <Graph agents={snap.agents} view={view} running={running} selection={selection} onSelect={(s) => (setSelection(s), setTab("detail"))} />
        </section>
        <aside className="panel" data-tour="panel">
          <nav className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "detail"} onClick={() => setTab("detail")}>
              Chi tiết
            </button>
            <button role="tab" aria-selected={tab === "auth"} onClick={() => setTab("auth")}>
              Đăng nhập
            </button>
          </nav>
          <div className="tab-body">
            {tab === "detail" && <Detail snap={snap} view={view} selection={selection} />}
            {tab === "auth" && <AuthPanel auth={auth} view={view} snap={snap} busy={authBusy} onCheck={checkAuth} />}
          </div>
        </aside>
      </main>

      <section className="report" aria-label="Báo cáo" data-tour="report">
        {snap.report ? (
          <>
            <div className="report-head">
              <b>Báo cáo</b>
              <span>
                {snap.report.items.length} mục{snap.report.previousDate ? ` (${snap.report.isNew?.filter(Boolean).length ?? 0} mới so với ${snap.report.previousDate})` : ""} · {Object.keys(snap.report.failures).length} nguồn lỗi · {snap.report.warnings?.length ?? 0} cảnh báo ·{" "}
                {snap.report.usedAiCredits.toFixed(2)} credits · {secs(snap.report.durationMs)}
                {snap.status === "stopped" ? " · đã dừng giữa chừng" : ""}
              </span>
              <a href="/report" target="_blank" rel="noopener">
                Mở tab mới ↗
              </a>
              <span className="muted" title={snap.report.file}>
                {snap.report.file.split(/[\\/]/).pop()}
              </span>
            </div>
            <iframe key={reportKey} title="Báo cáo check việc" src="/report" sandbox="allow-popups allow-popups-to-escape-sandbox" />
          </>
        ) : (
          <p className="muted">{running ? "Đang chạy… báo cáo hiện khi mọi agent xong." : "Gõ lệnh rồi bấm Chạy (Ctrl+Enter). Báo cáo hiện ở đây."}</p>
        )}
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
    const sv = view.servers[selection.name];
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
  const info = snap.agents.find((a) => a.name === selection.name)!;
  const av = view.agents[selection.name];
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

function AuthPanel({ auth, view, snap, busy, onCheck }: { auth: api.AuthStatus[] | null; view: View; snap: Snapshot; busy: boolean; onCheck: () => void }) {
  return (
    <div className="detail">
      <div className="row">
        <p className="muted">Kiểm nhanh, không tốn AI Credits, không hiện token.</p>
        <button onClick={onCheck} disabled={busy}>
          {busy ? "Đang kiểm…" : "Kiểm tra lại"}
        </button>
      </div>
      <ul className="auth-list">
        {(auth ?? []).map((a) => {
          const run = view.agents[a.agent];
          const h = a.status === "error" ? hint(a.detail) : null;
          const st = authState(a.status, view, a.source);
          return (
            <li key={a.source} className={st}>
              <div className="row">
                <b>{SERVER_LABEL[a.source] ?? a.source}</b>
                <span className={`chip auth ${st}`}>{AUTH_LABEL[st]}</span>
              </div>
              <div className="muted">{a.detail}</div>
              {st !== a.status && <div className="muted">Đã gọi tool thành công trong lượt chạy này.</div>}
              {h && <div className="hint">→ {h}</div>}
              {run?.status === "needs-action" && snap.status !== "idle" && (
                <div className="problem">
                  <div className="call-error">Lần chạy gần nhất: {run.error}</div>
                  {run.hint && <div className="hint">→ {run.hint}</div>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
