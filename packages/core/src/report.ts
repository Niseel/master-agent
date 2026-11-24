import type { BriefItem } from "./brief.ts";

export interface BriefReport {
  date: string; // YYYY-MM-DD
  runtime: string;
  items: BriefItem[];
  /** Agents that failed (or whose tools failed with a known cause): agent name -> reason. */
  failures: Record<string, string>;
  /** Tool calls the gate denied: "agent: reason". */
  blocked?: string[];
  usedAiCredits: number;
  maxAiCredits: number;
  durationMs: number;
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

/** Known failure causes -> what the user should do. Agents never fix these themselves. */
const HINTS: [RegExp, string][] = [
  [/EULA/i, "Tự chạy `npx -y @microsoft/workiq accept-eula` trong terminal (agent không được gọi accept_eula)."],
  [/AADSTS65001/, "Work IQ cần admin consent: hỏi IT."],
  [/VS30063/, "Tài khoản `az` không thuộc org ADO: `az login` đúng tài khoản, hoặc đặt ADO_AZURE_CONFIG_DIR (đường dẫn tuyệt đối) trong .env."],
  [/ngân sách|limits_exhausted/i, "Tăng AGENTHUB_MAX_AI_CREDITS nếu cần (tối thiểu 30 mỗi agent)."],
];
export const hint = (error: string) => HINTS.find(([re]) => re.test(error))?.[1] ?? null;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Only http(s) links are rendered: content comes from untrusted mail/chat. */
const safeLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

function card(i: BriefItem) {
  const link = safeLink(i.link);
  const title = link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title);
  return `<li class="item ${i.priority}">
  <div class="meta"><span class="badge ${i.priority}">${PRIORITY_LABEL[i.priority]}</span><span class="src">${SOURCE_LABEL[i.source]}</span>${i.timestamp ? `<time>${esc(i.timestamp)}</time>` : ""}</div>
  <div class="title">${title}</div>
  <p>${esc(i.summary)}</p>
  ${i.suggestedAction ? `<p class="action">→ ${esc(i.suggestedAction)}</p>` : ""}
</li>`;
}

const list = (items: BriefItem[]) =>
  `<ul>${[...items].sort((a, b) => RANK[a.priority] - RANK[b.priority]).map(card).join("\n")}</ul>`;

export function renderReport(r: BriefReport): string {
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
.badge{padding:1px 8px;border-radius:99px;font-weight:600}.badge.high{color:var(--high);background:var(--high-bg)}.badge.medium{color:var(--medium);background:var(--medium-bg)}.badge.low{color:var(--low);background:var(--low-bg)}
.title{font-weight:600;margin-top:4px}.title a{color:var(--accent);text-decoration:none}.title a:hover{text-decoration:underline}
p{margin:4px 0 0}.action{font-weight:500}
.fail{background:var(--fail-bg);color:var(--fail);border-radius:8px;padding:10px 14px}
footer{margin-top:32px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body><main>
<h1>Check việc — ${esc(r.date)}</h1>
<p class="sub">${r.items.length} mục · ${action.length} cần bạn xử lý${failures.length ? ` · ${failures.length} nguồn lỗi` : ""}</p>
${failures.length ? `<h2>Không lấy được</h2><ul>${failures.map(([a, e]) => `<li class="fail"><b>${esc(a)}</b>: ${esc(e)}${hint(e) ? `<p class="action">→ ${esc(hint(e)!)}</p>` : ""}</li>`).join("")}</ul>` : ""}
${action.length ? `<h2>Cần bạn xử lý</h2>${list(action)}` : ""}
${bySource.map(([s, items]) => `<h2>${SOURCE_LABEL[s as BriefItem["source"]]}</h2>${list(items)}`).join("\n")}
${r.blocked?.length ? `<h2>Đã chặn</h2><ul>${r.blocked.map((b) => `<li class="item low">${esc(b)}</li>`).join("")}</ul>` : ""}
<footer>Runtime: ${esc(r.runtime)} · AI Credits: ${r.usedAiCredits.toFixed(2)} / ${r.maxAiCredits} · ${(r.durationMs / 1000).toFixed(1)}s</footer>
</main></body></html>
`;
}
