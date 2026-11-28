/** Check việc output: to-do cards (milestone-1 §5). Click a card for the original content, links and its todo list. */
import { useState } from "react";
import { QUADRANT_LABEL, SOURCE_LABEL, viewCards, type CardView, type TodoStep } from "@agenthub/core/cards";
import type { Snapshot } from "./state.ts";

type Filter = "todo" | "done" | "hidden" | "other";
const FILTER_LABEL: Record<Filter, string> = { todo: "Cần làm", done: "Đã xong", hidden: "Đã ẩn", other: "Mục khác" };
const http = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export function Cards({
  snap,
  running,
  onMark,
  onExport,
}: {
  snap: Snapshot;
  running: boolean;
  onMark: (key: string, change: { status?: "open" | "done" | "hidden"; todos?: TodoStep[] }) => void;
  onExport: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("todo");
  const [open, setOpen] = useState<string | null>(null);
  const r = snap.report;
  if (!r) return <p className="muted">{running ? "Đang chạy… danh sách việc hiện khi mọi agent xong." : "Gõ lệnh rồi bấm Chạy (Ctrl+Enter). Việc cần làm hiện ở đây."}</p>;

  const views = viewCards(r.cards, snap.cardStates).map((v) => ({ ...v, isNew: !!r.newKeys?.includes(v.key) }));
  const phishing = views.filter((v) => v.phishing);
  const pick: Record<Filter, CardView[]> = {
    todo: views.filter((v) => v.isTodo && !v.phishing && (v.state === "open" || v.state === "updated")),
    done: views.filter((v) => v.isTodo && !v.phishing && v.state === "done"),
    hidden: views.filter((v) => !v.phishing && v.state === "hidden"),
    other: views.filter((v) => !v.isTodo && !v.phishing && v.state !== "hidden"),
  };
  const list = pick[filter];

  return (
    <div className="cards">
      <div className="cards-head">
        <b>Việc cần làm</b>
        <nav className="filters" role="tablist">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]} <span className="count">{pick[f].length}</span>
            </button>
          ))}
        </nav>
        <span className="muted">
          {r.previousDate ? `${r.newKeys?.length ?? 0} mới so với ${r.previousDate} · ` : ""}
          {Object.keys(r.failures).length} nguồn lỗi · {r.warnings?.length ?? 0} cảnh báo · {r.usedAiCredits.toFixed(2)} credits
          {snap.status === "stopped" ? " · đã dừng giữa chừng" : ""}
        </span>
        <button onClick={onExport} title="Sao chép danh sách việc dạng Markdown">
          Xuất Markdown
        </button>
        <a href="/report" target="_blank" rel="noopener">
          Báo cáo HTML ↗
        </a>
      </div>
      {phishing.length > 0 && filter === "todo" && (
        <div className="phishing" role="alert">
          <b>Nghi lừa đảo, không làm theo:</b> {phishing.map((v) => v.title).join("; ")}
        </div>
      )}
      {list.length === 0 && <p className="muted">Không có mục nào.</p>}
      <ul className="card-list">
        {list.map((v) => (
          <CardItem key={v.key} v={v} open={open === v.key} onToggle={() => setOpen(open === v.key ? null : v.key)} onMark={onMark} />
        ))}
      </ul>
    </div>
  );
}

function CardItem({ v, open, onToggle, onMark }: { v: CardView; open: boolean; onToggle: () => void; onMark: (key: string, change: { status?: "open" | "done" | "hidden"; todos?: TodoStep[] }) => void }) {
  const sources = [...new Set(v.items.map((i) => SOURCE_LABEL[i.source]))];
  return (
    <li className={`card q${v.quadrant}${open ? " open" : ""}`}>
      <button className="card-sum" aria-expanded={open} onClick={onToggle}>
        <div className="labels">
          <span className={`chip q${v.quadrant}`}>{QUADRANT_LABEL[v.quadrant]}</span>
          {v.priority !== null && <span className="chip">P{v.priority}</span>}
          {sources.map((s) => (
            <span key={s} className="chip src">
              {s}
            </span>
          ))}
          {v.state === "updated" && <span className="chip new">Cập nhật mới</span>}
          {v.isNew && <span className="chip new">Mới</span>}
          {v.dueDate && <span className="muted">hạn {v.dueDate.slice(0, 10)}</span>}
        </div>
        <div className="card-title">{v.title}</div>
        <div className="muted">{v.summary}</div>
      </button>
      {open && <CardDetail v={v} onMark={onMark} />}
    </li>
  );
}

function CardDetail({ v, onMark }: { v: CardView; onMark: (key: string, change: { status?: "open" | "done" | "hidden"; todos?: TodoStep[] }) => void }) {
  const [draft, setDraft] = useState("");
  const save = (todos: TodoStep[]) => onMark(v.key, { todos });
  const steps = v.steps;
  const edit = (i: number, patch: Partial<TodoStep>) => save(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  return (
    <div className="card-detail">
      {v.reason && <p className="reason">{v.reason}</p>}
      <h4>Todo</h4>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={`${i}-${s.text}`} className={s.struck ? "struck" : s.done ? "done" : ""}>
            <input type="checkbox" checked={s.done} onChange={(e) => edit(i, { done: e.target.checked })} aria-label="Đã làm" />
            <input className="step-text" defaultValue={s.text} maxLength={500} onBlur={(e) => e.target.value !== s.text && edit(i, { text: e.target.value })} aria-label="Nội dung bước" />
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Lên">
              ↑
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Xuống">
              ↓
            </button>
            <button type="button" onClick={() => edit(i, { struck: !s.struck })} title={s.struck ? "Bỏ gạch" : "Gạch bỏ bước này"}>
              {s.struck ? "Bỏ gạch" : "Gạch"}
            </button>
          </li>
        ))}
      </ol>
      <form
        className="add-step"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) save([...steps, { text: draft.trim(), done: false, struck: false }]);
          setDraft("");
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder="Thêm bước…" />
        <button type="submit" disabled={!draft.trim()}>
          Thêm
        </button>
      </form>
      <h4>Nội dung gốc</h4>
      {v.items.map((i) => (
        <div key={`${i.source}:${i.ref}`} className="origin">
          <div className="row">
            <b>
              {SOURCE_LABEL[i.source]} · {i.title}
            </b>
            {http(i.link) && (
              <a href={http(i.link)!} target="_blank" rel="noopener noreferrer">
                Mở bản gốc ↗
              </a>
            )}
          </div>
          <div className="origin-text">{i.detail || i.summary}</div>
          {i.images.filter(http).length > 0 && (
            <div className="images">
              {i.images.filter(http).map((u, k) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                  Ảnh {k + 1} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="row actions">
        {v.state === "open" || v.state === "updated" ? (
          <>
            <button className="primary" onClick={() => onMark(v.key, { status: "done" })}>
              Đã xong
            </button>
            <button onClick={() => onMark(v.key, { status: "hidden" })}>Ẩn</button>
          </>
        ) : (
          <button onClick={() => onMark(v.key, { status: "open" })}>Mở lại</button>
        )}
      </div>
    </div>
  );
}
