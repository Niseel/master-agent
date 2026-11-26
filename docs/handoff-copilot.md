# Bàn giao Home → Work (2026-11-26, lần 4)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [WORK.md](WORK.md).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 0. Vai trò mới (từ 2026-11-26)

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code.

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Được làm: chạy các lệnh dưới đây, đọc `logs/audit-*.jsonl`, `reports/`, sửa `.env` (không commit).
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, `docs/mcp-tools.md`
  (nếu chạy `pnpm list-tools`), dòng `[Work]` trong `PLAN.md`.
- Gặp lỗi cần sửa code: **không sửa**. Ghi vào `docs/work-feedback.md`: lệnh đã chạy, file nghi ngờ, mã lỗi / thông
  báo lỗi (đã xoá tên người, tenant, workspace, org). Home sẽ sửa.

## 1. Trạng thái

- Home đã làm xong `handoff-claude.md` §3 (lần 5) mục 1–5, 7. Kiểm ở Home: `pnpm typecheck` xanh, `pnpm test` 31/31,
  `pnpm brief` (mock) 3 kịch bản, `byok` + mock MCP cho mục 1.
- Phase 2 bắt đầu: API dashboard `pnpm hub` (chưa có UI, chưa cần kiểm ở Work).
- Repo dùng LF. Nếu `git status` báo mọi file đều đổi sau khi pull: `git add --renormalize .`, không commit thay
  đổi chỉ do CRLF.

## 2. Home đã đổi gì (ảnh hưởng tới Work)

| Phần | Thay đổi | Kiểm ở Work |
|---|---|---|
| `runtime/sdk.ts` | `availableTools` = `mcp:<tên>` cho từng tool trong `readTools` (trước: `mcp:*`). Model không còn thấy built-in `github-mcp-server-*` và tool ngoài allowlist. `decide()` vẫn là lớp thứ hai. **Thu hẹp quyền.** | §3 bước 2, 3 |
| `scripts/sdk-smoke.ts` | Cờ `--tools`: in tool model thấy, không gửi prompt, **không tốn credit**. Exit 1 nếu có tool ngoài allowlist. | §3 bước 2 |
| `agents.ts` | Ghim `@azure/mcp@4.0.0-beta.10` (`AZURE_MCP_VERSION`). Giữ `--read-only`, `AZURE_TOKEN_CREDENTIALS=AzureCliCredential`. | §3 bước 3 |
| `scripts/playwright-smoke.ts` | Mới. `@playwright/mcp@0.0.86`, trang mẫu qua `127.0.0.1`, ảnh + video + trace vào `reports/playwright-smoke/`. Không qua model. | §3 bước 4 |
| mock workiq | `retrieve` nhận `capabilities`. | Không cần |
| `apps/server` | Mới: `pnpm hub` (API dashboard, chỉ `127.0.0.1`). | Không cần lần này |
| `docs/WORK.md` | Cách nâng `@azure/mcp`, mục 5b Playwright, ghi chú PowerShell UTF-8 và `list-tools`. | Đọc |

## 3. Việc ở Work (theo thứ tự)

PowerShell: chạy `[Console]::OutputEncoding = [Text.Encoding]::UTF8` trước khi ghi output ra file.

1. **Cài đặt:** `git pull`, `pnpm install`, `pnpm typecheck`, `pnpm test`. Phải xanh (31 test). Đỏ thì dừng, ghi lỗi
   vào work-feedback.
2. **Tool model thấy (không tốn credit), runtime `copilot`:**
   ```powershell
   $env:AGENTHUB_RUNTIME = "copilot"
   pnpm smoke comms-reader --tools
   pnpm smoke code-reader --tools
   pnpm smoke cloud-reader --tools
   pnpm smoke board-reader --tools
   ```
   Mong đợi: mỗi lệnh in danh sách tool, dòng `Tất cả trong allowlist.`, exit 0, **không có `github-mcp-server-*`**.
   Ghi số tool mỗi agent. Nếu thấy 0 tool, hoặc vẫn thấy `github-mcp-server-*`: ghi nguyên văn vào work-feedback
   (đó là dấu hiệu `mcp:<tên>` không khớp ở runtime công ty).
3. **`pnpm brief` runtime `copilot` (lần 6, khoảng 40 AI Credits).** Ghi vào `docs/step0-results.md` mục 9:
   - tổng thời gian, thời gian từng agent, AI Credits, số mục, số cảnh báo;
   - audit `logs/audit-<ngày>.jsonl`: số bản ghi, `allow`/`deny`, **không còn `github-mcp-server-*`**, không tool
     ghi nào `allow`;
   - `cloud-reader` (Azure MCP 4.0.0-beta.10): không lỗi cờ / `unknown arguments`; liệt kê lệnh `monitor_*` đã gọi.
4. **Playwright smoke** (không tốn credit), xem `docs/WORK.md` mục 5b:
   ```powershell
   npx -y @playwright/mcp@0.0.86 install-browser ffmpeg
   pnpm playwright-smoke      # không có Chrome: $env:PLAYWRIGHT_BROWSER = "msedge"
   ```
   Mong đợi: `Smoke Playwright: ok`, có `smoke.png`, `smoke.webm`, `traces/` trong `reports/playwright-smoke/`.
   Ghi kết quả vào `docs/step0-results.md` dòng 7 (lỗi tải qua proxy: ghi thông báo lỗi).
5. **Tuỳ chọn, không tốn credit:** `GITHUB_MCP_TOKEN` để trống (sửa `.env` tạm, nhớ đặt lại), chạy
   `pnpm smoke code-reader --tools`. Ghi trạng thái server và mã lỗi vào work-feedback, `step0-results.md` dòng 5.
6. **Ghi và đẩy về:**
   - `docs/step0-results.md`, `docs/work-feedback.md` (mục "2026-11-26 (lần 6)"), dòng `[Work]` trong `PLAN.md`.
   - `docs/handoff-claude.md`: §1 trạng thái mới, §3 việc Home cần làm (đề xuất, không tự sửa code).
   - `git status` chỉ có file trong `docs/` và `PLAN.md`. Commit, push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật. Áp dụng cả cho commit message.
- Không sửa code (§0). Không dùng `approveAll`, không đổi `readTools`, `security.ts`, quyền, danh tính.
- Không commit `.env`, `logs/`, `reports/`, token. Token lộ thì user thu hồi và tạo lại.
