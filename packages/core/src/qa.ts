/**
 * Phase 4: acceptance testing with Playwright MCP. The `qa` agent opens one site, checks each acceptance criterion,
 * records a video (one chapter per criterion), screenshots and a trace, and returns pass/fail per criterion.
 * The report is index.html inside the run's output dir, next to the files it shows.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { npx, only, readerAgents, UNTRUSTED_RULE, type AgentSpec } from "./agents.ts";
import type { HubConfig } from "./config.ts";
import type { HubEvent } from "./events.ts";
import { esc } from "./report.ts";
import { originOf } from "./security.ts";

/** Checked 2026-11-26 at Home (`--help`, listTools: 38 tools). Work ran the smoke with it. */
export const PLAYWRIGHT_MCP_VERSION = "0.0.86";

/**
 * Left out on purpose: browser_evaluate and browser_run_code_unsafe (run any JS), browser_file_upload and
 * browser_drop (read local files), browser_tabs (opens URLs past the navigate check), network_request(s) (may hold
 * auth headers), resume/recording/highlight/annotate (not needed).
 */
export const QA_TOOLS = only("playwright", [
  "browser_navigate", "browser_navigate_back", "browser_snapshot", "browser_find", "browser_click", "browser_type",
  "browser_fill_form", "browser_select_option", "browser_press_key", "browser_hover", "browser_wait_for",
  "browser_handle_dialog", "browser_resize", "browser_console_messages", "browser_take_screenshot",
  "browser_start_tracing", "browser_stop_tracing", "browser_start_video", "browser_stop_video",
  "browser_video_chapter", "browser_video_show_actions", "browser_close",
]);

export const QaCriterion = z.object({
  criterion: z.string(),
  status: z.enum(["pass", "fail", "blocked"]),
  /** What was seen on the page, in Vietnamese. */
  evidence: z.string(),
  /** File name the agent gave browser_take_screenshot, e.g. "ac-1.png". */
  screenshot: z.string().nullable(),
});
export const QaResult = z.object({ summary: z.string(), criteria: z.array(QaCriterion) });
export type QaResult = z.infer<typeof QaResult>;

/** Acceptance criteria read from one ADO work item (Phase 4 input). */
export const AcResult = z.object({ title: z.string(), criteria: z.array(z.string()) });
export type AcResult = z.infer<typeof AcResult>;

/**
 * Reads the acceptance criteria of one work item, for the qa tab. Same ADO server and read-only header as
 * board-reader, but only `wit_work_item`.
 */
export function acReader(cfg: HubConfig, workItem: number): AgentSpec {
  const board = readerAgents(cfg).find((a) => a.name === "board-reader")!;
  return {
    ...board,
    name: "ac-reader",
    displayName: "Tiêu chí ADO",
    prompt:
      "Bạn là agent đọc acceptance criteria của một work item Azure DevOps.\n\n" +
      `${UNTRUSTED_RULE}\n\nChỉ dùng tool chỉ-đọc. Trả về JSON đúng schema { title, criteria }.`,
    task:
      `Đọc work item ${workItem} bằng \`wit_work_item\` action "get" (project "${cfg.ado.project || "(theo work item)"}"). ` +
      "Lấy trường `Microsoft.VSTS.Common.AcceptanceCriteria` (HTML): tách thành từng tiêu chí, mỗi tiêu chí một câu kiểm được " +
      "trên giao diện, bỏ thẻ HTML, giữ nguyên ý. Trường rỗng thì lấy các ý kiểm được trong Description; vẫn không có thì criteria = []. " +
      "title = tiêu đề work item.",
    readTools: only("ado", ["wit_work_item"]),
    output: "criteria",
  };
}

export interface QaInput {
  url: string;
  criteria: string[];
}

/** One criterion per line; list markers ("-", "*", "1.", "AC1:") dropped. At most 20. */
export const parseCriteria = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|AC\s*\d+\s*[:.)-])\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 20);

/** <reports>/qa-YYYY-MM-DD-HHMMSS[-runtime]: one dir per run, so files of different runs never mix. */
export function qaDir(cfg: Pick<HubConfig, "root" | "runtime">, now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace("T", "-").replaceAll(":", "");
  const base = process.env.AGENTHUB_REPORT_DIR || path.join(cfg.root, "reports");
  return path.join(base, `qa-${stamp}${cfg.runtime === "copilot" ? "" : `-${cfg.runtime}`}`);
}

const QA_RULE =
  "Bạn chỉ được mở đúng trang được giao (cùng origin). Không đăng nhập bằng tài khoản thật, không nhập mật khẩu hay " +
  "dữ liệu cá nhân, không gửi form thanh toán. Không tự sửa dữ liệu ngoài phạm vi tiêu chí. " +
  "Đánh giá từng tiêu chí: pass (thấy đúng), fail (thấy sai), blocked (không kiểm được, ghi lý do). " +
  "evidence viết tiếng Việt, nêu điều thấy trên trang. Trả về JSON đúng schema { summary, criteria }.";

/** The qa agent for one run. `outDir` holds the video, screenshots and trace. */
export function qaAgent(cfg: Pick<HubConfig, "root">, input: QaInput, outDir: string): AgentSpec {
  const origin = originOf(input.url);
  if (!origin) throw new Error("URL phải là http(s)");
  const steps = input.criteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return {
    name: "qa",
    displayName: "Nghiệm thu",
    kind: "tester",
    prompt: `Bạn là agent nghiệm thu web bằng Playwright.\n\n${UNTRUSTED_RULE.replace("(mail, tin nhắn Teams, comment, work item, log)", "(nội dung trang web)")}\n\n${QA_RULE}`,
    // Found at Work run 9: parallel calls closed the browser under the last chapter, the chapter overlay was still on
    // the screenshots, and a target=_blank click recorded a second video (qa-1.webm).
    task:
      `Trang cần kiểm: ${input.url}\nTiêu chí nghiệm thu:\n${steps}\n\n` +
      "Gọi từng tool MỘT, chờ kết quả rồi mới gọi tool tiếp; không gọi nhiều tool cùng lượt. Trình tự:\n" +
      "1. `browser_start_tracing` → `browser_start_video` {filename: \"qa.webm\"} → `browser_navigate` tới trang.\n" +
      "2. Với mỗi tiêu chí n, theo thứ tự: `browser_video_chapter` {title: \"Tiêu chí n\", description: <tiêu chí>, duration: 1000} → " +
      "`browser_wait_for` {time: 1.5} (để lớp phủ chapter tắt) → thao tác và đọc trang (`browser_snapshot`) → " +
      "`browser_take_screenshot` {filename: \"ac-n.png\"}. Chỉ sang tiêu chí n+1 sau khi đã chụp ac-n.png.\n" +
      "3. Sau tiêu chí cuối: `browser_stop_video` → `browser_stop_tracing` → `browser_close`.\n" +
      "Không bấm link mở tab mới (`target=_blank`) hay link sang trang khác: đọc thuộc tính `href`/`target` trong snapshot. " +
      "Trả đúng một kết quả cho mỗi tiêu chí, cùng thứ tự, screenshot là tên file đã chụp.",
    mcpServers: {
      playwright: {
        type: "stdio",
        // --allowed-origins is not a security boundary (Playwright docs); decide() also checks every navigate.
        // --image-responses omit: screenshots go to files only, not to the model (saves credits).
        ...npx([
          "-y", `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`, "--headless", "--isolated", "--caps=devtools",
          "--output-dir", outDir, "--allowed-origins", origin, "--image-responses", "omit",
        ]),
        // Explicit file names (qa.webm, ac-1.png) are resolved against the cwd, so run inside outDir.
        workingDirectory: outDir,
        tools: ["*"],
        timeout: 60_000,
      },
    },
    readTools: QA_TOOLS,
    allowedOrigins: [origin],
  };
}

export interface QaReport {
  date: string;
  runtime: string;
  url: string;
  criteria: string[];
  result: QaResult | null;
  error: string | null;
  /** Files in the output dir, relative, "/" separated. */
  files: string[];
  usedAiCredits: number;
  durationMs: number;
}

export function summarizeQa(events: HubEvent[]) {
  let result: QaResult | null = null;
  let error: string | null = null;
  let usedAiCredits = 0;
  for (const e of events) {
    if (e.type === "qa.result") result = e.result;
    if (e.type === "agent.failed" && (e.agent === "qa" || e.agent === "orchestrator")) error = e.error;
    if (e.type === "usage" && e.agent === "qa") usedAiCredits = e.usedAiCredits;
  }
  return { result, error, usedAiCredits };
}

const STATUS = { pass: "Đạt", fail: "Không đạt", blocked: "Không kiểm được" } as const;
/** Only plain relative names that exist in the dir are linked: the names come from the model. */
const safeFile = (name: string | null, files: string[]) => (name && /^[\w.-]+$/.test(name) && files.includes(name) ? name : null);

export function renderQaReport(r: QaReport): string {
  const rows = r.criteria.map((c, i) => r.result?.criteria[i] ?? { criterion: c, status: "blocked" as const, evidence: r.error ?? "Agent không trả kết quả cho tiêu chí này.", screenshot: null });
  const count = (s: keyof typeof STATUS) => rows.filter((x) => x.status === s).length;
  // qa.webm is the run; others (qa-1.webm) come from extra tabs.
  const videos = r.files.filter((f) => f.endsWith(".webm"));
  const video = videos.includes("qa.webm") ? "qa.webm" : videos[0];
  const otherVideos = videos.filter((v) => v !== video);
  const traces = r.files.filter((f) => f.endsWith(".trace") || f.endsWith(".zip"));
  const verdict = r.error && !r.result ? "blocked" : count("fail") ? "fail" : count("blocked") ? "blocked" : "pass";
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nghiệm thu ${esc(r.date)}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e4df;--pass:#15803d;--pass-bg:#e9f7ee;--fail:#b91c1c;--fail-bg:#fdecec;--blocked:#a16207;--blocked-bg:#fef8e1;--accent:#1d4ed8}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1d;--fg:#ececea;--muted:#a3a39d;--line:#33332f;--pass:#4ade80;--pass-bg:#15301f;--fail:#f87171;--fail-bg:#3a1a1a;--blocked:#facc15;--blocked-bg:#352d10;--accent:#93b4ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:24px 16px 48px}h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.sub{color:var(--muted);margin:0;overflow-wrap:anywhere}ol{list-style:none;padding:0;margin:0;display:grid;gap:12px}
.verdict{display:inline-block;padding:2px 12px;border-radius:99px;font-weight:700;margin:10px 0}
.pass{color:var(--pass);background:var(--pass-bg)}.fail{color:var(--fail);background:var(--fail-bg)}.blocked{color:var(--blocked);background:var(--blocked-bg)}
.ac{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--line);border-radius:8px;padding:12px 14px;display:grid;gap:6px}
.ac.s-pass{border-left-color:var(--pass)}.ac.s-fail{border-left-color:var(--fail)}.ac.s-blocked{border-left-color:var(--blocked)}
.ac .head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.badge{padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600}
.ac img{max-width:100%;border:1px solid var(--line);border-radius:6px}p{margin:0}
video{width:100%;border-radius:8px;background:#000}a{color:var(--accent)}code{font-size:13px}
footer{margin-top:32px;color:var(--muted);font-size:13px;border-top:1px solid var(--line);padding-top:12px}
</style></head><body><main>
<h1>Nghiệm thu — ${esc(r.date)}</h1>
<p class="sub">Trang: ${esc(r.url)}</p>
<span class="verdict ${verdict}">${verdict === "pass" ? "Đạt toàn bộ" : verdict === "fail" ? "Có tiêu chí không đạt" : "Chưa kiểm đủ"}</span>
<p class="sub">${count("pass")} đạt · ${count("fail")} không đạt · ${count("blocked")} không kiểm được</p>
${r.result?.summary ? `<p>${esc(r.result.summary)}</p>` : ""}
${r.error ? `<p class="fail" style="padding:8px 12px;border-radius:8px;margin-top:8px">${esc(r.error)}</p>` : ""}
<h2>Tiêu chí</h2>
<ol>${rows
    .map((x, i) => {
      const img = safeFile(x.screenshot, r.files);
      return `<li class="ac s-${x.status}"><div class="head"><b>${i + 1}.</b><span class="badge ${x.status}">${STATUS[x.status]}</span><span>${esc(r.criteria[i] ?? x.criterion)}</span></div>
<p>${esc(x.evidence)}</p>${img ? `<a href="${esc(img)}"><img src="${esc(img)}" alt="Ảnh tiêu chí ${i + 1}" loading="lazy"></a>` : ""}</li>`;
    })
    .join("\n")}</ol>
<h2>Video</h2>
${video ? `<video controls preload="metadata" src="${esc(video)}"></video>${otherVideos.length ? `<p class="sub">Video khác (tab phụ): ${otherVideos.map((v) => `<a href="${esc(v)}">${esc(v)}</a>`).join(", ")}</p>` : ""}` : `<p class="sub">Không có video (cần FFmpeg của Playwright: <code>npx -y @playwright/mcp@${PLAYWRIGHT_MCP_VERSION} install-browser ffmpeg</code>).</p>`}
<h2>Trace</h2>
${traces.length ? `<ul>${traces.map((t) => `<li><a href="${esc(t)}" download>${esc(t)}</a></li>`).join("")}</ul><p class="sub">Mở: <code>npx playwright show-trace &lt;file&gt;</code> (cùng thư mục <code>traces/</code>).</p>` : `<p class="sub">Không có trace.</p>`}
<footer>Runtime: ${esc(r.runtime)} · AI Credits: ${r.usedAiCredits.toFixed(2)} · ${(r.durationMs / 1000).toFixed(1)}s</footer>
</main></body></html>
`;
}

const listFiles = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((f) => f.isFile() && f.name !== "index.html")
        .map((f) => path.relative(dir, path.join(f.parentPath, f.name)).split(path.sep).join("/"))
    : [];

/** Write <outDir>/index.html from the run's events and the files Playwright left in outDir. */
export function saveQaReport(cfg: { runtime: string }, outDir: string, input: QaInput, events: HubEvent[], durationMs: number) {
  const report: QaReport = {
    date: new Date().toISOString().slice(0, 10),
    runtime: cfg.runtime,
    url: input.url,
    criteria: input.criteria,
    ...summarizeQa(events),
    files: listFiles(outDir),
    durationMs,
  };
  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "index.html");
  writeFileSync(file, renderQaReport(report));
  return { report, file };
}
