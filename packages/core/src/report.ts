import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BriefItem } from "./brief.ts";
import type { HubConfig } from "./config.ts";
import type { HubEvent } from "./events.ts";
import { DENIED_PREFIX, findHint, hint } from "./hints.ts";

export { hint, isBlocking } from "./hints.ts";

export interface BriefReport {
  date: string; // YYYY-MM-DD
  runtime: string;
  items: BriefItem[];
  /** Agents that failed (or whose tools failed with a known cause): agent name -> reason. */
  failures: Record<string, string>;
  /** Partial read failures (e.g. one Azure workspace): "agent: error". The agent's items are kept. */
  warnings?: string[];
  /** Tool calls the gate denied: "agent: reason". */
  blocked?: string[];
  usedAiCredits: number;
  maxAiCredits: number;
  durationMs: number;
  /** Phase 5 "có gì mới": the earlier brief compared against, and per item (same order as `items`) whether it is new. */
  previousDate?: string | null;
  isNew?: boolean[];
}

/** Same item across days: source + link (or title when there is no link). */
export const itemKey = (i: BriefItem) => `${i.source}|${(i.link || i.title).trim().toLowerCase()}`;

/** Latest brief-<date><suffix>.json in `dir` dated before `date`, or null. */
export function previousBrief(dir: string, suffix: string, date: string): { date: string; items: BriefItem[] } | null {
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
    return { date: last, items: Array.isArray(data.items) ? data.items : [] };
  } catch {
    return null;
  }
}

const SOURCE_LABEL: Record<BriefItem["source"], string> = {
  outlook: "Outlook",
  teams: "Teams",
  ado: "Azure DevOps",
  github: "GitHub",
  azure: "Azure",
};
const RANK = { high: 0, medium: 1, low: 2 } as const;
const PRIORITY_LABEL = { high: "Cao", medium: "Vừa", low: "Thấp" } as const;


/**
 * Run events -> report data, using the hint kinds above.
 * ponytail: a blocking error drops ALL items of that agent; filter per item if a source can be partly blocked.
 */
export function summarize(events: HubEvent[]): Pick<BriefReport, "items" | "failures" | "warnings" | "blocked" | "usedAiCredits"> {
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
  return { items, failures, warnings: [...new Set(warnings)], blocked, usedAiCredits };
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Only http(s) links are rendered: content comes from untrusted mail/chat. */
const safeLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

function card(i: BriefItem, isNew = false) {
  const link = safeLink(i.link);
  const title = link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title);
  return `<li class="item ${i.priority}">
  <div class="meta"><span class="badge ${i.priority}">${PRIORITY_LABEL[i.priority]}</span>${isNew ? `<span class="badge new">Mới</span>` : ""}<span class="src">${SOURCE_LABEL[i.source]}</span>${i.timestamp ? `<time>${esc(i.timestamp)}</time>` : ""}</div>
  <div class="title">${title}</div>
  <p>${esc(i.summary)}</p>
  ${i.suggestedAction ? `<p class="action">→ ${esc(i.suggestedAction)}</p>` : ""}
</li>`;
}

export function renderReport(r: BriefReport): string {
  const fresh = (i: BriefItem) => !!r.isNew?.[r.items.indexOf(i)];
  const list = (items: BriefItem[]) =>
    `<ul>${[...items].sort((a, b) => RANK[a.priority] - RANK[b.priority]).map((i) => card(i, fresh(i))).join("\n")}</ul>`;
  const newCount = r.isNew?.filter(Boolean).length ?? 0;
  const action = r.items.filter((i) => i.actionRequired);
  const bySource = Object.keys(SOURCE_LABEL)
    .map((s) => [s, r.items.filter((i) => i.source === s && !i.actionRequired)] as const)
    .filter(([, items]) => items.length);
  const failures = Object.entries(r.failures);

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Check việc ${esc(r.date)}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e4df;--high:#c2410c;--high-bg:#fff1e8;--medium:#a16207;--medium-bg:#fef8e1;--low:#4b5563;--low-bg:#f1f2f4;--fail:#b91c1c;--fail-bg:#fdecec;--accent:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--fg:#ececea;--muted:#a3a39d;--line:#33332f;--high:#fb923c;--high-bg:#3a2215;--medium:#facc15;--medium-bg:#352d10;--low:#cbd5e1;--low-bg:#2a2c30;--fail:#f87171;--fail-bg:#3a1a1a;--accent:#93b4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:880px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.sub{color:var(--muted);margin:0}ul{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.item{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--low);border-radius:8px;padding:12px 14px}
.item.high{border-left-color:var(--high)}.item.medium{border-left-color:var(--medium)}
.meta{display:flex;gap:8px;align-items:center;font-size:12px;color:var(--muted);flex-wrap:wrap}
.badge{padding:1px 8px;border-radius:99px;font-weight:600}.badge.new{color:var(--accent);background:var(--card);border:1px solid var(--accent)}.badge.high{color:var(--high);background:var(--high-bg)}.badge.medium{color:var(--medium);background:var(--medium-bg)}.badge.low{color:var(--low);background:var(--low-bg)}
.title{font-weight:600;margin-top:4px}.title a{color:var(--accent);text-decoration:none}.title a:hover{text-decoration:underline}
p{margin:4px 0 0}.action{font-weight:500}
.fail{background:var(--fail-bg);color:var(--fail);border-radius:8px;padding:10px 14px}
.warn{background:var(--medium-bg);color:var(--fg);border-radius:8px;padding:10px 14px;overflow-wrap:anywhere}
footer{margin-top:32px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body><main>
<h1>Check việc — ${esc(r.date)}</h1>
<p class="sub">${r.items.length} mục · ${action.length} cần bạn xử lý${r.previousDate ? ` · ${newCount} mới so với ${esc(r.previousDate)}` : ""}${failures.length ? ` · ${failures.length} nguồn lỗi` : ""}${r.warnings?.length ? ` · ${r.warnings.length} cảnh báo` : ""}</p>
${failures.length ? `<h2>Không lấy được</h2><ul>${failures.map(([a, e]) => `<li class="fail"><b>${esc(a)}</b>: ${esc(e)}${hint(e) ? `<p class="action">→ ${esc(hint(e)!)}</p>` : ""}</li>`).join("")}</ul>` : ""}
${r.warnings?.length ? `<h2>Cảnh báo</h2><ul>${r.warnings.map((w) => `<li class="warn">${esc(w)}${hint(w) ? `<p class="action">→ ${esc(hint(w)!)}</p>` : ""}</li>`).join("")}</ul>` : ""}
${action.length ? `<h2>Cần bạn xử lý</h2>${list(action)}` : ""}
${bySource.map(([s, items]) => `<h2>${SOURCE_LABEL[s as BriefItem["source"]]}</h2>${list(items)}`).join("\n")}
${r.blocked?.length ? `<h2>Đã chặn</h2><ul>${r.blocked.map((b) => `<li class="item low">${esc(b)}</li>`).join("")}</ul>` : ""}
<footer>Runtime: ${esc(r.runtime)} · AI Credits: ${r.usedAiCredits.toFixed(2)} / ${r.maxAiCredits} · ${(r.durationMs / 1000).toFixed(1)}s</footer>
</main></body></html>
`;
}

/**
 * Build the report from a run's events and write <AGENTHUB_REPORT_DIR or root/reports>/brief-YYYY-MM-DD.html.
 * mock/byok runs get a suffix (brief-YYYY-MM-DD-mock.html), so trying the mock at Work never overwrites the real report.
 */
export function saveReport(cfg: Pick<HubConfig, "root" | "runtime" | "maxAiCredits">, events: HubEvent[], durationMs: number, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const dir = process.env.AGENTHUB_REPORT_DIR || path.join(cfg.root, "reports");
  const suffix = cfg.runtime === "copilot" ? "" : `-${cfg.runtime}`;
  const report: BriefReport = { date, runtime: cfg.runtime, ...summarize(events), maxAiCredits: cfg.maxAiCredits, durationMs };
  // "Có gì mới": compare with the last earlier day's brief (same runtime). No earlier brief = nothing marked.
  const prev = previousBrief(dir, suffix, date);
  if (prev) {
    const seen = new Set(prev.items.map(itemKey));
    Object.assign(report, { previousDate: prev.date, isNew: report.items.map((i) => !seen.has(itemKey(i))) });
  }
  const file = path.join(dir, `brief-${date}${suffix}.html`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, renderReport(report));
  // Items only (no failures/warnings): what the next day compares against. Stays local (reports/ is gitignored).
  writeFileSync(path.join(dir, `brief-${date}${suffix}.json`), JSON.stringify({ date, runtime: cfg.runtime, items: report.items }, null, 2));
  return { report, file };
}
