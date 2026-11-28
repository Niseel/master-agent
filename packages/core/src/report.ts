import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { refOf, type BriefItem } from "./brief.ts";
import { mergeCards, QUADRANT_LABEL, SOURCE_LABEL, viewCards, type Card, type CardView, type Quadrant } from "./cards.ts";
import type { HubConfig } from "./config.ts";
import type { HubEvent } from "./events.ts";
import { DENIED_PREFIX, findHint, hint } from "./hints.ts";

export { hint, isBlocking } from "./hints.ts";

export interface BriefReport {
  date: string; // YYYY-MM-DD
  runtime: string;
  items: BriefItem[];
  /** Items merged into to-do cards, sorted (cards.ts). */
  cards: Card[];
  /** Agents that failed (or whose tools failed with a known cause): agent name -> reason. */
  failures: Record<string, string>;
  /** Partial read failures (e.g. one Azure workspace): "agent: error". The agent's items are kept. */
  warnings?: string[];
  /** Tool calls the gate denied: "agent: reason". */
  blocked?: string[];
  usedAiCredits: number;
  maxAiCredits: number;
  durationMs: number;
  /** "Có gì mới": the earlier brief compared against, and the keys of cards with no item in it. */
  previousDate?: string | null;
  newKeys?: string[];
}

/** Latest brief-<date><suffix>.json in `dir` dated before `date`, or null. */
export function previousBrief(dir: string, suffix: string, date: string): { date: string; refs: Set<string> } | null {
  if (!existsSync(dir)) return null;
  const re = new RegExp(`^brief-(\\d{4}-\\d{2}-\\d{2})${suffix.replace(/[^\w-]/g, "")}\\.json$`);
  const dates = readdirSync(dir)
    .map((f) => f.match(re)?.[1])
    .filter((d): d is string => !!d && d < date)
    .sort();
  const last = dates.at(-1);
  if (!last) return null;
  try {
    const data = JSON.parse(readFileSync(path.join(dir, `brief-${last}${suffix}.json`), "utf8"));
    const items: Partial<BriefItem>[] = Array.isArray(data.items) ? data.items : [];
    // Briefs before 2026-11-28 have no `ref`: they match nothing, so the first day after the change marks all as new.
    return { date: last, refs: new Set(items.filter((i) => i.source && i.ref).map((i) => refOf(i as BriefItem))) };
  } catch {
    return null;
  }
}

/**
 * Run events -> report data, using the hint kinds above.
 * ponytail: a blocking error drops ALL items of that agent; filter per item if a source can be partly blocked.
 */
export function summarize(events: HubEvent[]): Pick<BriefReport, "items" | "cards" | "failures" | "warnings" | "blocked" | "usedAiCredits"> {
  const callAgent = new Map<string, string>();
  const itemsBy: Record<string, BriefItem[]> = {};
  const failures: Record<string, string> = {};
  const warnings: string[] = [];
  const blocked: string[] = [];
  const unknown: [agent: string, text: string][] = [];
  const usedBy: Record<string, number> = {};
  let usedTotal = 0;
  for (const ev of events) {
    if (ev.type === "tool.started") callAgent.set(ev.callId, ev.agent);
    else if (ev.type === "tool.completed") {
      const agent = callAgent.get(ev.callId);
      // A denied call is already listed under "Đã chặn" (message "Bị chặn: ..."); not a warning too.
      if (!agent || !ev.error || ev.error.startsWith(DENIED_PREFIX)) continue;
      const kind = findHint(ev.error)?.kind;
      if (kind === "blocking") failures[agent] ??= `Tool lỗi: ${ev.error}`;
      else if (kind === "warning") warnings.push(`${agent}: ${ev.error}`);
      else if (!kind) unknown.push([agent, `${agent}: ${ev.error.length > 300 ? `${ev.error.slice(0, 300)}…` : ev.error}`]);
    } else if (ev.type === "agent.result") (itemsBy[ev.agent] ??= []).push(...ev.items);
    else if (ev.type === "agent.failed") failures[ev.agent] = ev.error;
    else if (ev.type === "message" && ev.text.startsWith("Bị chặn")) blocked.push(`${ev.agent}: ${ev.text}`);
    else if (ev.type === "usage") {
      if (ev.agent) usedBy[ev.agent] = ev.usedAiCredits;
      else usedTotal = ev.usedAiCredits;
    }
  }
  for (const [agent, text] of unknown) if (!failures[agent]) warnings.push(text);
  const items = Object.entries(itemsBy).flatMap(([agent, items]) => (failures[agent] ? [] : items));
  const usedAiCredits = Math.max(usedTotal, Object.values(usedBy).reduce((a, b) => a + b, 0));
  return { items, cards: mergeCards(items), failures, warnings: [...new Set(warnings)], blocked, usedAiCredits };
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Only http(s) links are rendered: content comes from untrusted mail/chat. */
const safeLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

const where = (c: Card) => [...new Set(c.items.map((i) => SOURCE_LABEL[i.source]))].join(" · ");

function card(c: CardView) {
  const link = safeLink(c.link);
  const title = link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(c.title)}</a>` : esc(c.title);
  return `<li class="item q${c.quadrant}">
  <div class="meta"><span class="badge q${c.quadrant}">${QUADRANT_LABEL[c.quadrant]}</span>${c.priority ? `<span class="badge">P${c.priority}</span>` : ""}${c.isNew ? `<span class="badge new">Mới</span>` : ""}<span class="src">${esc(where(c))}</span>${c.dueDate ? `<time>hạn ${esc(c.dueDate.slice(0, 10))}</time>` : ""}</div>
  <div class="title">${title}</div>
  <p>${esc(c.summary)}</p>
  ${c.todos.length ? `<ol class="steps">${c.todos.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : ""}
</li>`;
}

export function renderReport(r: BriefReport): string {
  const views = viewCards(r.cards, {}).map((v) => ({ ...v, isNew: !!r.newKeys?.includes(v.key) }));
  const todo = views.filter((v) => v.isTodo && !v.phishing);
  const other = views.filter((v) => !v.isTodo && !v.phishing);
  const phishing = views.filter((v) => v.phishing);
  const newCount = r.newKeys?.length ?? 0;
  const failures = Object.entries(r.failures);
  const list = (cards: CardView[]) => `<ul>${cards.map(card).join("\n")}</ul>`;

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Check việc ${esc(r.date)}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e4df;--q1:#c2410c;--q1-bg:#fff1e8;--q2:#1d4ed8;--q2-bg:#e8efff;--q3:#a16207;--q3-bg:#fef8e1;--q4:#4b5563;--q4-bg:#f1f2f4;--fail:#b91c1c;--fail-bg:#fdecec;--accent:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--fg:#ececea;--muted:#a3a39d;--line:#33332f;--q1:#fb923c;--q1-bg:#3a2215;--q2:#93b4ff;--q2-bg:#1c2640;--q3:#facc15;--q3-bg:#352d10;--q4:#cbd5e1;--q4-bg:#2a2c30;--fail:#f87171;--fail-bg:#3a1a1a;--accent:#93b4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:880px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.sub{color:var(--muted);margin:0}ul{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.item{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--q4);border-radius:8px;padding:12px 14px}
.item.q1{border-left-color:var(--q1)}.item.q2{border-left-color:var(--q2)}.item.q3{border-left-color:var(--q3)}
.meta{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--muted);flex-wrap:wrap}
.badge{padding:1px 8px;border-radius:99px;font-weight:600;background:var(--q4-bg);color:var(--q4)}.badge.new{color:var(--accent);background:var(--card);border:1px solid var(--accent)}
.badge.q1{color:var(--q1);background:var(--q1-bg)}.badge.q2{color:var(--q2);background:var(--q2-bg)}.badge.q3{color:var(--q3);background:var(--q3-bg)}
.title{font-weight:600;margin-top:4px}.title a{color:var(--accent);text-decoration:none}.title a:hover{text-decoration:underline}
p{margin:4px 0 0}.steps{margin:6px 0 0;padding-left:20px;color:var(--muted)}
.fail{background:var(--fail-bg);color:var(--fail);border-radius:8px;padding:10px 14px}
.warn{background:var(--q3-bg);color:var(--fg);border-radius:8px;padding:10px 14px;overflow-wrap:anywhere}
footer{margin-top:32px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body><main>
<h1>Check việc — ${esc(r.date)}</h1>
<p class="sub">${todo.length} việc cần làm · ${r.items.length} mục từ các nguồn${r.previousDate ? ` · ${newCount} mới so với ${esc(r.previousDate)}` : ""}${failures.length ? ` · ${failures.length} nguồn lỗi` : ""}${r.warnings?.length ? ` · ${r.warnings.length} cảnh báo` : ""}</p>
${failures.length ? `<h2>Không lấy được</h2><ul>${failures.map(([a, e]) => `<li class="fail"><b>${esc(a)}</b>: ${esc(e)}${hint(e) ? `<p>→ ${esc(hint(e)!)}</p>` : ""}</li>`).join("")}</ul>` : ""}
${r.warnings?.length ? `<h2>Cảnh báo</h2><ul>${r.warnings.map((w) => `<li class="warn">${esc(w)}${hint(w) ? `<p>→ ${esc(hint(w)!)}</p>` : ""}</li>`).join("")}</ul>` : ""}
${phishing.length ? `<h2>Nghi lừa đảo (không làm theo)</h2>${list(phishing)}` : ""}
${([1, 2, 3, 4] as Quadrant[]).map((q) => todo.some((v) => v.quadrant === q) ? `<h2>${QUADRANT_LABEL[q]}</h2>${list(todo.filter((v) => v.quadrant === q))}` : "").join("\n")}
${other.length ? `<h2>Mục khác (không phải việc cần làm)</h2>${list(other)}` : ""}
${r.blocked?.length ? `<h2>Đã chặn</h2><ul>${r.blocked.map((b) => `<li class="item">${esc(b)}</li>`).join("")}</ul>` : ""}
<footer>Runtime: ${esc(r.runtime)} · AI Credits: ${r.usedAiCredits.toFixed(2)} / ${r.maxAiCredits} · ${(r.durationMs / 1000).toFixed(1)}s</footer>
</main></body></html>
`;
}

/**
 * Build the report from a run's events and write <AGENTHUB_REPORT_DIR or root/reports>/brief-YYYY-MM-DD.html.
 * mock/byok runs get a suffix (brief-YYYY-MM-DD-mock.html), so trying the mock at Work never overwrites the real report.
 */
export function saveReport(cfg: Pick<HubConfig, "root" | "runtime" | "maxAiCredits">, events: HubEvent[], durationMs: number, now = new Date(), stopped = false) {
  const date = now.toISOString().slice(0, 10);
  const dir = process.env.AGENTHUB_REPORT_DIR || path.join(cfg.root, "reports");
  const suffix = cfg.runtime === "copilot" ? "" : `-${cfg.runtime}`;
  const report: BriefReport = { date, runtime: cfg.runtime, ...summarize(events), maxAiCredits: cfg.maxAiCredits, durationMs };
  // "Có gì mới": compare with the last earlier day's brief (same runtime). No earlier brief = nothing marked.
  const prev = previousBrief(dir, suffix, date);
  if (prev) {
    const fresh = report.cards.filter((c) => !c.items.some((i) => prev.refs.has(refOf(i))));
    Object.assign(report, { previousDate: prev.date, newKeys: fresh.map((c) => c.key) });
  }
  const file = path.join(dir, `brief-${date}${suffix}.html`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, renderReport(report));
  // Items only (no failures/warnings): what the next day compares against. Stays local (reports/ is gitignored).
  // A run stopped midway has partial items: keep the day's earlier memory.
  if (!stopped) writeFileSync(path.join(dir, `brief-${date}${suffix}.json`), JSON.stringify({ date, runtime: cfg.runtime, items: report.items }, null, 2));
  return { report, file };
}
