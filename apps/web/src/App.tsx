import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hint } from "@agenthub/core/hints";
import * as api from "./api.ts";
import { Graph, SERVER_LABEL, STATUS_LABEL, type Selection } from "./Graph.tsx";
import type { BriefItem } from "@agenthub/core/brief";
import { derive, pending, type Approval, type Call, type Snapshot, type View } from "./state.ts";

const secs = (ms?: number) => (ms === undefined ? "–" : `${(ms / 1000).toFixed(1)}s`);
const AUTH_LABEL = { ok: "Đã đăng nhập", error: "Lỗi", mock: "Giả lập", unknown: "Chưa rõ" } as const;

type Tab = "detail" | "todo" | "approvals" | "auth";

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
          // An act run (one writer) appends to the brief: keep its events and report.
          const fresh = r.status === "running" && r.mode === "brief";
          setSnap((s) => s && { ...s, status: r.status, mode: r.mode, prompt: r.prompt ?? s.prompt, report: r.report ?? (fresh ? null : s.report), events: fresh ? [] : s.events });
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
  const waiting = view ? pending(view) : [];
  const running = snap?.status === "running";

  // Bring the approval queue forward when a new request arrives.
  const lastPending = useRef(0);
  useEffect(() => {
    if (waiting.length > lastPending.current) setTab("approvals");
    lastPending.current = waiting.length;
  }, [waiting.length]);

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
        <span className={`chip runtime ${snap.runtime}`} title="AGENTHUB_RUNTIME">
          {snap.runtime}
        </span>
        <div className="credits" title="AI Credits đã dùng / ngân sách (AGENTHUB_MAX_AI_CREDITS)">
          <div className="meter">
            <div className={`fill${pct > 85 ? " hot" : ""}`} style={{ width: `${pct}%` }} />
          </div>
          <span>
            {credits.toFixed(1)} / {snap.maxAiCredits} credits
          </span>
        </div>
        <div className="auth-chips">
          {(auth ?? []).map((a) => (
            <button key={a.source} className={`chip auth ${a.status}`} title={`${SERVER_LABEL[a.source] ?? a.source}: ${a.detail}`} onClick={() => setTab("auth")}>
              <span className={`dot ${a.status === "ok" ? "done" : a.status === "error" ? "failed" : "idle"}`} aria-hidden />
              {a.source}
            </button>
          ))}
        </div>
        {!connected && <span className="chip offline">Mất kết nối</span>}
      </header>
      {error && (
        <div className="banner" role="alert">
          {error} <button onClick={() => setError(null)}>Đóng</button>
        </div>
      )}

      <main className="main">
        <section className="graph" aria-label="Sơ đồ agent">
          <Graph agents={snap.agents} view={view} running={running} selection={selection} onSelect={(s) => (setSelection(s), setTab("detail"))} />
        </section>
        <aside className="panel">
          <nav className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "detail"} onClick={() => setTab("detail")}>
              Chi tiết
            </button>
            <button role="tab" aria-selected={tab === "todo"} onClick={() => setTab("todo")}>
              Việc cần làm
            </button>
            <button role="tab" aria-selected={tab === "approvals"} onClick={() => setTab("approvals")}>
              Duyệt{waiting.length ? <span className="badge">{waiting.length}</span> : null}
            </button>
            <button role="tab" aria-selected={tab === "auth"} onClick={() => setTab("auth")}>
              Đăng nhập
            </button>
          </nav>
          <div className="tab-body">
            {tab === "detail" && <Detail snap={snap} view={view} selection={selection} />}
            {tab === "todo" && (
              <Todo
                snap={snap}
                view={view}
                running={running}
                onAct={(agent, item, instruction) =>
                  act(async () => {
                    await api.actOn(agent, item, instruction);
                    setSelection({ kind: "agent", name: agent });
                  })
                }
              />
            )}
            {tab === "approvals" && <Approvals view={view} onDecide={(id, d, f) => act(() => api.decide(id, d, f))} />}
            {tab === "auth" && <AuthPanel auth={auth} view={view} snap={snap} busy={authBusy} onCheck={checkAuth} />}
          </div>
        </aside>
      </main>

      <section className="report" aria-label="Báo cáo">
        {snap.report ? (
          <>
            <div className="report-head">
              <b>Báo cáo</b>
              <span>
                {snap.report.items.length} mục · {Object.keys(snap.report.failures).length} nguồn lỗi · {snap.report.warnings?.length ?? 0} cảnh báo ·{" "}
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
          <code>{info.name}</code> ({info.kind === "reader" ? "chỉ đọc" : "có ghi, cần duyệt"})
        </dd>
        <dt>Trạng thái</dt>
        <dd>{STATUS_LABEL[av.status]}</dd>
        <dt>Thời gian</dt>
        <dd>{secs(av.durationMs)}</dd>
        <dt>AI Credits</dt>
        <dd>{av.credits?.toFixed(2) ?? "–"}</dd>
        <dt>Token</dt>
        <dd>{av.tokens ?? "–"}</dd>
        {info.kind === "reader" && (
          <>
            <dt>Mục</dt>
            <dd>{av.items}</dd>
          </>
        )}
      </dl>
      {av.error && (
        <div className="problem">
          <div className="call-error">{av.error}</div>
          {av.hint && <div className="hint">→ {av.hint}</div>}
        </div>
      )}
      {av.action && (
        <div className="action-result">
          <b>Kết quả:</b> {av.action.summary}{" "}
          {av.action.link && /^https?:\/\//.test(av.action.link) && (
            <a href={av.action.link} target="_blank" rel="noopener noreferrer">
              Mở ↗
            </a>
          )}
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

function ApprovalCard({ ap, onDecide }: { ap: Approval; onDecide: (id: string, d: "approve" | "reject", feedback?: string) => void }) {
  const [feedback, setFeedback] = useState("");
  return (
    <li className="approval">
      <div>
        <b>{ap.agent}</b> xin gọi <code>{ap.tool}</code>
      </div>
      <pre>{JSON.stringify(ap.args, null, 2)}</pre>
      <label>
        Lý do (gửi lại cho agent nếu từ chối)
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} />
      </label>
      <div className="row">
        <button className="primary" onClick={() => onDecide(ap.id, "approve", feedback || undefined)}>
          Duyệt
        </button>
        <button className="danger" onClick={() => onDecide(ap.id, "reject", feedback || "Người dùng từ chối")}>
          Từ chối
        </button>
      </div>
    </li>
  );
}

function Approvals({ view, onDecide }: { view: View; onDecide: (id: string, d: "approve" | "reject", feedback?: string) => void }) {
  const waiting = pending(view);
  const done = view.approvals.filter((a) => a.decision);
  return (
    <div className="detail">
      <p className="muted">
        Mọi tool ghi chờ bạn duyệt, kèm đầy đủ tham số: đây là nội dung sẽ được gửi đi. Nội dung do agent soạn từ dữ liệu mail/chat, đọc kỹ trước khi duyệt.
        Yêu cầu từ agent chỉ-đọc là bất thường.
      </p>
      {waiting.length === 0 && <p>Không có yêu cầu nào đang chờ.</p>}
      <ul className="approvals">{waiting.map((ap) => <ApprovalCard key={ap.id} ap={ap} onDecide={onDecide} />)}</ul>
      {done.length > 0 && (
        <>
          <h4>Đã xử lý</h4>
          <ul className="messages">
            {done.map((a) => (
              <li key={a.id}>
                {a.decision === "approve" ? "✓ Duyệt" : "✗ Từ chối"}: {a.agent} → <code>{a.tool}</code>
              </li>
            ))}
          </ul>
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
          return (
            <li key={a.source} className={a.status}>
              <div className="row">
                <b>{SERVER_LABEL[a.source] ?? a.source}</b>
                <span className={`chip auth ${a.status}`}>{AUTH_LABEL[a.status]}</span>
              </div>
              <div className="muted">{a.detail}</div>
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

const SOURCE_LABEL: Record<BriefItem["source"], string> = { outlook: "Outlook", teams: "Teams", ado: "Azure DevOps", github: "GitHub", azure: "Azure" };

/** Brief items that need the user, each can be handed to the writer for its source (Phase 3). */
function Todo({ snap, view, running, onAct }: { snap: Snapshot; view: View; running: boolean; onAct: (agent: string, item: BriefItem, instruction: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const items = (snap.report?.items ?? []).map((item, i) => ({ item, i })).filter(({ item }) => item.actionRequired);
  if (!snap.report) return <p className="muted detail">Chạy check việc trước: các mục cần bạn xử lý hiện ở đây.</p>;
  return (
    <div className="detail">
      <p className="muted">Giao một mục cho agent ghi. Agent soạn nội dung, rồi chờ bạn duyệt ở tab Duyệt trước khi gửi.</p>
      {items.length === 0 && <p>Không có mục nào cần xử lý.</p>}
      <ul className="todo">
        {items.map(({ item, i }) => {
          const writer = snap.agents.find((a) => a.name === snap.writerFor[item.source]);
          const result = writer && view.agents[writer.name];
          return (
            <li key={i} className={`todo-item ${item.priority}`}>
              <div className="row">
                <span className="chip">{SOURCE_LABEL[item.source]}</span>
                <b>{item.title}</b>
              </div>
              <div className="muted">{item.summary}</div>
              {item.suggestedAction && <div className="hint">Gợi ý: {item.suggestedAction}</div>}
              {!writer ? (
                <div className="muted">Chưa có agent ghi cho nguồn này.</div>
              ) : open === i ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (instruction.trim()) onAct(writer.name, item, instruction.trim());
                  }}
                >
                  <label>
                    Việc giao cho {writer.displayName} (<code>{writer.name}</code>)
                    <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} maxLength={2000} autoFocus />
                  </label>
                  <div className="row">
                    <button type="submit" className="primary" disabled={running || !instruction.trim()}>
                      Soạn ▶
                    </button>
                    <button type="button" onClick={() => setOpen(null)}>
                      Huỷ
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  disabled={running}
                  onClick={() => {
                    setOpen(i);
                    setInstruction(item.suggestedAction ?? "");
                  }}
                >
                  Giao việc: {writer.displayName}
                </button>
              )}
              {result?.action && snap.mode === "act" && open === i && <div className="action-result">{result.action.summary}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
