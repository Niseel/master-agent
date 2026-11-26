/**
 * Step 0 smoke test for Playwright MCP: open a synthetic report page, record a video, take a screenshot, save a trace.
 *   pnpm playwright-smoke                        # system Chrome
 *   PLAYWRIGHT_BROWSER=msedge pnpm playwright-smoke
 * No model and no SDK session: the script calls a fixed list of browser_* tools itself, so it costs no AI Credits.
 * The page is served from 127.0.0.1 and holds only made-up items, never company data.
 * Output: reports/playwright-smoke/ (gitignored), with index.html: the Phase 4 acceptance report built from the real files.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PLAYWRIGHT_MCP_VERSION, QA_TOOLS, saveQaReport, type QaResult } from "../packages/core/src/qa.ts";
import { renderReport } from "../packages/core/src/report.ts";

/** The only tools this script calls. All are in the qa agent's allowlist. */
const USED = [
  "browser_navigate", "browser_start_tracing", "browser_start_video", "browser_video_chapter", "browser_press_key",
  "browser_wait_for", "browser_take_screenshot", "browser_stop_video", "browser_stop_tracing", "browser_close",
];

const out = path.resolve(import.meta.dirname, "../reports/playwright-smoke");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const html = renderReport({
  date: "2000-01-01",
  runtime: "mock",
  items: Array.from({ length: 8 }, (_, i) => ({
    source: (["outlook", "teams", "ado", "github", "azure"] as const)[i % 5],
    title: `Mục mẫu ${i + 1}`,
    summary: "Dữ liệu tự tạo cho smoke test Playwright.",
    priority: (["high", "medium", "low"] as const)[i % 3],
    actionRequired: i % 2 === 0,
    suggestedAction: i % 2 === 0 ? "Xem lại" : null,
    link: null,
    timestamp: null,
  })),
  failures: {},
  warnings: ["cloud-reader: ví dụ cảnh báo"],
  usedAiCredits: 0,
  maxAiCredits: 120,
  durationMs: 0,
});
const http = createServer((_, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html));
await new Promise<void>((ok) => http.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/`;

const args = ["-y", `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`, "--headless", "--isolated", "--caps=devtools", "--output-dir", out];
if (process.env.PLAYWRIGHT_BROWSER) args.push("--browser", process.env.PLAYWRIGHT_BROWSER);
const [command, argv] = process.platform === "win32" ? ["cmd", ["/c", "npx", ...args]] : ["npx", args];
const client = new Client({ name: "agent-hub-playwright-smoke", version: "0" });
// cwd = output dir: relative file names are resolved against the workspace root (cwd when the client sends no roots).
await client.connect(new StdioClientTransport({ command, args: argv, cwd: out, stderr: "inherit" }));

const call = async (name: string, a: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: a })) as { isError?: boolean; content: { type: string; text?: string }[] };
  const text = r.content.find((c) => c.type === "text")?.text ?? "";
  console.log(`${r.isError ? "LỖI" : "ok  "} ${name} ${r.isError ? text.slice(0, 300) : ""}`);
  if (r.isError) throw new Error(`${name}: ${text.slice(0, 300)}`);
};

let failed = false;
const done: string[] = [];
try {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  console.log(`Playwright MCP ${PLAYWRIGHT_MCP_VERSION}: ${names.length} tool`);
  const missing = [...new Set([...USED, ...QA_TOOLS.map((t) => t.replace(/^playwright-/, ""))])].filter((t) => !names.includes(t));
  if (missing.length) throw new Error(`Thiếu tool (đổi tên?): ${missing.join(", ")}`);

  await call("browser_navigate", { url });
  await call("browser_start_tracing");
  await call("browser_take_screenshot", { filename: "smoke.png", fullPage: true });
  done.push("screenshot");
  // Needs Playwright's FFmpeg: `npx -y @playwright/mcp@<version> install-browser ffmpeg` (docs/WORK.md).
  await call("browser_start_video", { filename: "smoke.webm" });
  await call("browser_video_chapter", { title: "Báo cáo mock", description: "Smoke test Playwright MCP", duration: 1000 });
  await call("browser_press_key", { key: "End" });
  await call("browser_wait_for", { time: 1 });
  await call("browser_stop_video");
  done.push("video");
  await call("browser_stop_tracing");
  await call("browser_close");
} catch (e) {
  failed = true;
  console.error(e instanceof Error ? e.message : e);
} finally {
  await client.close();
  http.close();
}

// The acceptance report from these real files: what the qa agent would return for two checks the script made itself.
const result: QaResult = {
  summary: "Smoke: script gọi tool cố định, không có model.",
  criteria: [
    { criterion: "Trang mở được và chụp được ảnh", status: done.includes("screenshot") ? "pass" : "fail", evidence: "browser_navigate + browser_take_screenshot", screenshot: "smoke.png" },
    { criterion: "Quay được video có chapter", status: done.includes("video") ? "pass" : "blocked", evidence: "browser_start_video → browser_video_chapter → browser_stop_video", screenshot: null },
  ],
};
const qa = saveQaReport({ runtime: "smoke" }, out, { url, criteria: result.criteria.map((c) => c.criterion) }, [{ type: "qa.result", agent: "qa", result }], 0);
console.log(`Báo cáo nghiệm thu: ${qa.file}`);

const files = readdirSync(out, { recursive: true, withFileTypes: true }).filter((f) => f.isFile());
for (const f of files) {
  const p = path.join(f.parentPath, f.name);
  console.log(`  ${path.relative(out, p)} ${statSync(p).size} B`);
}
for (const want of ["smoke.webm", "smoke.png", "index.html"]) {
  if (!existsSync(path.join(out, want))) {
    failed = true;
    console.error(`Không thấy ${want}`);
  }
}
console.log(failed ? "Smoke Playwright: LỖI" : `Smoke Playwright: ok → ${out}`);
process.exit(failed ? 1 : 0);
