# Bàn giao Home → Work (2026-11-26, lần 6)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [WORK.md](WORK.md).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, dòng `[Work]` trong `PLAN.md`.
- Gặp lỗi cần sửa code: ghi đề xuất vào `docs/work-feedback.md` (lệnh, file nghi ngờ, mã lỗi đã xoá dữ liệu thật).

## 1. Trạng thái

- Home đã làm `handoff-claude.md` §3 (lần 7) mục 1–4. Kiểm ở Home: `pnpm typecheck` xanh, `pnpm test` 34/34,
  `pnpm brief` (mock): `brief-ok` 10 mục / 0 lỗi / 1 cảnh báo; `brief-failures` 4 lỗi;
  `brief-auth` 1 mục / 3 lỗi / **0 cảnh báo**, 4 dòng "Đã chặn".

## 2. Home đã đổi gì

| Phần | Thay đổi | Kiểm ở Work |
|---|---|---|
| `report.ts` | Lỗi `Denied by preToolUse hook: …` không còn vào "Cảnh báo" (đã có ở "Đã chặn"). Gợi ý 403 dùng `az account get-access-token`. | §3 bước 2 |
| `security.ts`, `runtime/sdk.ts` | Khi chặn, lý do gửi cho **model** kèm danh sách tool agent được dùng (`denyHint`). Quyết định allow/deny và `readTools` không đổi. Audit và báo cáo vẫn ghi lý do ngắn. | §3 bước 2 |
| `apps/cli/src/brief.ts` | Console: không in `✗` cho lời gọi bị chặn; agent gặp lỗi chặn hoặc lỗi in `⚠ … không lấy được dữ liệu` thay cho `✓`. | §3 bước 2 |
| mock | Lời gọi bị chặn sinh đúng chuỗi lỗi thật; `brief-auth` thêm tên đoán sai `github-list`. | Không cần |

## 3. Việc ở Work (theo thứ tự)

PowerShell: chạy `[Console]::OutputEncoding = [Text.Encoding]::UTF8` trước khi ghi output ra file.

1. **Cài đặt:** `git pull`, `pnpm install`, `pnpm typecheck`, `pnpm test` (34 test). Đỏ thì dừng, ghi lỗi vào work-feedback.
   Nếu `pnpm brief` báo 401 Azure: kiểm `az account get-access-token` trước, đăng nhập lại nếu cần.
2. **`pnpm brief` runtime `copilot` (lần 8, khoảng 27–40 AI Credits).** Ghi vào `docs/step0-results.md` mục 9:
   - tổng thời gian, thời gian từng agent, AI Credits, số mục, số lỗi, số cảnh báo;
   - mục "Cảnh báo": **không còn** dòng `Denied by preToolUse hook`;
   - `code-reader`: số lần `deny` (lần 6: 1, lần 7: 2), tên tool bị chặn, sau đó có tự dùng `github-actions_list` không;
     thời gian code-reader;
   - console: không còn dòng `✗ … Denied by preToolUse hook`; agent nào in `⚠` thay cho `✓` (nếu có);
   - audit `logs/audit-<ngày>.jsonl`: số bản ghi, `allow`/`deny`, không tool ghi nào `allow`.
3. **Ghi và đẩy về:**
   - `docs/step0-results.md`, `docs/work-feedback.md` (mục "lần 8"), dòng `[Work]` trong `PLAN.md`.
   - `docs/handoff-claude.md`: §1 trạng thái mới, §3 đề xuất cho Home.
   - `git status` chỉ có file trong `docs/` và `PLAN.md`. Commit, push.

Tuỳ chọn: góp ý thiết kế dashboard ([design/dashboard.excalidraw](design/dashboard.excalidraw)) vào work-feedback.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật. Áp dụng cả cho commit message.
- Không sửa code (§0). Không dùng `approveAll`, không đổi `readTools`, `security.ts`, quyền, danh tính.
- Không commit `.env`, `logs/`, `reports/`, token.
