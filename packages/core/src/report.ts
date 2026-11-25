import type { BriefItem } from "./brief.ts";
import type { HubEvent } from "./events.ts";

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

/**
 * Known failure causes -> what the user should do. Agents never fix these themselves.
 * `blocking`: the source is unusable until the user acts (auth, EULA, config). Other errors are model
 * mistakes the model usually retries past, so they only show when the agent fails with them.
 */
const HINTS: { re: RegExp; text: string; blocking: boolean }[] = [
  { re: /EULA/i, blocking: true, text: "Tự chạy `npx -y @microsoft/workiq accept-eula` trong terminal (agent không được gọi accept_eula)." },
  { re: /AADSTS65001/, blocking: true, text: "Work IQ cần admin consent: hỏi IT." },
  { re: /VS30063/, blocking: true, text: "Tài khoản `az` không thuộc org ADO: `az login` đúng tài khoản, hoặc đặt ADO_AZURE_CONFIG_DIR (đường dẫn tuyệt đối) trong .env." },
  { re: /^Chưa cấu hình/, blocking: true, text: "Đặt biến còn thiếu trong `.env` (mẫu: `.env.example`, hướng dẫn: docs/WORK.md)." },
  { re: /ngân sách|limits_exhausted/i, blocking: true, text: "Tăng AGENTHUB_MAX_AI_CREDITS nếu cần (tối thiểu 30 mỗi agent)." },
  {
    re: /unknown arguments|Missing Required options|is not available for the 'monitor' tool/,
    blocking: false,
    text: "Model gọi sai lệnh/tham số Azure MCP. Nếu lặp lại: sửa task `cloud-reader` trong agents.ts (danh sách lệnh ở docs/mcp-tools.md).",
  },
  {
    re: /InsufficientAccessError|Could not find workspace/,
    blocking: true,
    text: "Azure MCP dùng tài khoản `az login` (AzureCliCredential): kiểm tra `az account show` là đúng tài khoản và tài khoản đó có quyền Reader trên workspace.",
  },
  { re: /BadArgumentError/, blocking: false, text: "KQL sai tên bảng/cột. Nếu lặp lại: ghi tên bảng đúng vào task `cloud-reader`." },
  { re: /«SELECT»|Expecting constant value/, blocking: false, text: "WIQL không có subquery: dùng `[System.Id] IN (@Follows)` hoặc `wit_work_item` action `my` (task `board-reader`)." },
];
const findHint = (error: string) => HINTS.find(({ re }) => re.test(error));
export const hint = (error: string) => findHint(error)?.text ?? null;
export const isBlocking = (error: string) => findHint(error)?.blocking ?? false;

/**
 * Run events -> report data. A blocking tool error marks the agent failed even if it "completed", and drops
 * its items: they only restate the error (seen at Work with EULA).
 * ponytail: drops ALL items of that agent; filter per item if a source can be partly blocked.
 */
export function summarize(events: HubEvent[]): Pick<BriefReport, "items" | "failures" | "blocked" | "usedAiCredits"> {
  const callAgent = new Map<string, string>();
  const itemsBy: Record<string, BriefItem[]> = {};
  const failures: Record<string, string> = {};
  const blocked: string[] = [];
  const usedBy: Record<string, number> = {};
  let usedTotal = 0;
  for (const ev of events) {
    if (ev.type === "tool.started") callAgent.set(ev.callId, ev.agent);
    else if (ev.type === "tool.completed") {
      const agent = callAgent.get(ev.callId);
      if (agent && ev.error && isBlocking(ev.error)) failures[agent] ??= `Tool lỗi: ${ev.error}`;
    } else if (ev.type === "agent.result") (itemsBy[ev.agent] ??= []).push(...ev.items);
    else if (ev.type === "agent.failed") failures[ev.agent] = ev.error;
    else if (ev.type === "message" && ev.text.startsWith("Bị chặn")) blocked.push(`${ev.agent}: ${ev.text}`);
    else if (ev.type === "usage") {
      if (ev.agent) usedBy[ev.agent] = ev.usedAiCredits;
      else usedTotal = ev.usedAiCredits;
    }
  }
  const items = Object.entries(itemsBy).flatMap(([agent, items]) => (failures[agent] ? [] : items));
  const usedAiCredits = Math.max(usedTotal, Object.values(usedBy).reduce((a, b) => a + b, 0));
  return { items, failures, blocked, usedAiCredits };
}

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
