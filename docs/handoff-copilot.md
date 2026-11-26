# Bàn giao Home → Work (2026-11-26, lần 5)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [WORK.md](WORK.md).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, dòng `[Work]` trong `PLAN.md`.
- Gặp lỗi cần sửa code: ghi đề xuất vào `docs/work-feedback.md` (lệnh, file nghi ngờ, mã lỗi đã xoá dữ liệu thật).

## 1. Trạng thái

- Home đã làm `handoff-claude.md` §3 (lần 6) mục 1–3, 5, 6. Kiểm ở Home: `pnpm typecheck` xanh, `pnpm test` 33/33,
  `pnpm brief` (mock) 3 kịch bản: `brief-ok` 10 mục / 0 lỗi / 1 cảnh báo; `brief-failures` 4 lỗi;
  `brief-auth` 1 mục / 3 lỗi (có cloud-reader 401).

## 2. Home đã đổi gì

| Phần | Thay đổi | Kiểm ở Work |
|---|---|---|
| `report.ts` | Lỗi 401 / `Azure credentials not found` / `AADSTS50173` / `invalid_grant` là **lỗi chặn**: agent hiện ở "Không lấy được" kèm gợi ý `az logout` + `az login`, kiểm bằng `az account get-access-token`. Lỗi tool không khớp gợi ý nào hiện ở "Cảnh báo" (trước: bị bỏ qua, báo cáo ghi 0 lỗi). | §3 bước 3 |
| `agents.ts` | Task `code-reader`: workflow run dùng `actions_list` với `method: "list_workflow_runs"`. Không đổi `readTools`. | §3 bước 3 |
| mock | `brief-auth` có 401 Azure thật và tên tool đoán sai `github-list_workflow_runs`. | Không cần |
| `docs/WORK.md`, `.env.example` | `GITHUB_MCP_TOKEN` không bắt buộc; kiểm token Azure bằng `az account get-access-token`. | Đọc |

## 3. Việc ở Work (theo thứ tự)

PowerShell: chạy `[Console]::OutputEncoding = [Text.Encoding]::UTF8` trước khi ghi output ra file.

1. **Đăng nhập lại Azure (user tự làm, tương tác):** `az logout`, rồi `az login` với đúng `AZURE_CONFIG_DIR`.
   Kiểm: `az account get-access-token` trả token, không lỗi `AADSTS50173`.
2. **Cài đặt:** `git pull`, `pnpm install`, `pnpm typecheck`, `pnpm test` (33 test). Đỏ thì dừng, ghi lỗi vào work-feedback.
3. **`pnpm brief` runtime `copilot` (lần 7, khoảng 27–40 AI Credits).** Ghi vào `docs/step0-results.md` mục 9:
   - tổng thời gian, thời gian từng agent, AI Credits, số mục, số lỗi, số cảnh báo;
   - `cloud-reader`: gọi chuỗi `monitor_*` không lỗi như lần 5 (liệt kê lệnh đã gọi); nếu vẫn 401, báo cáo phải có
     cloud-reader ở mục "Không lấy được" kèm gợi ý (không còn ✓);
   - `code-reader`: không còn `deny` `github-list_workflow_runs`; dùng `actions_list`;
   - audit `logs/audit-<ngày>.jsonl`: số bản ghi, `allow`/`deny`, không tool ghi nào `allow`;
   - mục "Cảnh báo" của báo cáo: có dòng nào không (chép dạng cấu trúc: agent + mã lỗi, không chép dữ liệu).
4. **Ghi và đẩy về:**
   - `docs/step0-results.md`, `docs/work-feedback.md` (mục "lần 7"), dòng `[Work]` trong `PLAN.md`.
   - `docs/handoff-claude.md`: §1 trạng thái mới, §3 đề xuất cho Home.
   - `git status` chỉ có file trong `docs/` và `PLAN.md`. Commit, push.

Tuỳ chọn: góp ý thiết kế dashboard ([design/dashboard.excalidraw](design/dashboard.excalidraw)) vào work-feedback.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật. Áp dụng cả cho commit message.
- Không sửa code (§0). Không dùng `approveAll`, không đổi `readTools`, `security.ts`, quyền, danh tính.
- Không commit `.env`, `logs/`, `reports/`, token.
