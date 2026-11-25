# Bàn giao Home → Work (2026-11-25, lần 2)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [PLAN.md](../PLAN.md), [WORK.md](WORK.md).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 1. Trạng thái

- Home đã commit bản Work 2026-11-25, rồi làm xong mục 1–7 trong `handoff-claude.md` §3.
- Home đã kiểm tra:
  - `pnpm typecheck` xanh, `pnpm test` 26/26 xanh;
  - `pnpm brief` (runtime `mock`) chạy với 3 kịch bản `brief-ok`, `brief-failures`, `brief-auth`.
- Repo dùng line ending LF (`.gitattributes`). Nếu `git status` báo mọi file đều đổi sau khi pull,
  chạy `git add --renormalize .` rồi kiểm tra lại. Không commit thay đổi chỉ do CRLF.

## 2. Home đã đổi gì (ảnh hưởng tới Work)

| Phần | Thay đổi | Việc ở Work |
|---|---|---|
| `agents.ts` task `board-reader` | Dặn WIQL không dùng subquery; item đang theo dõi dùng `[System.Id] IN (@Follows)`, hoặc `wit_work_item` action `my`. | Xem lần chạy thật còn lỗi `«SELECT»` không, và có giữ điều kiện "đang theo dõi" không. |
| `agents.ts` task `cloud-reader` | Bỏ "cảnh báo đang bật". Giờ là lỗi trong Log Analytics + activity log 24h, kèm trình tự lệnh `monitor_*` và tham số (không truyền `resource-group` cho `monitor_workspace_log_query`; `monitor_activitylog_list` cần `resource-name`). | So số lần gọi `monitor` và thời gian với lần trước (15 lần, ~59s). |
| `agents.ts` prompt chung | Lỗi tool không phải item. | Xem báo cáo không còn lặp lỗi ở "Cần bạn xử lý". |
| `report.ts` | Hàm `summarize(events)` (thay logic cũ trong `apps/cli/src/brief.ts`). Lỗi **chặn** (EULA, `AADSTS65001`, `VS30063`, "Chưa cấu hình", hết ngân sách) làm agent thành lỗi và bỏ item của agent đó. Lỗi model tự thử lại (`unknown arguments`, `BadArgumentError`, WIQL) không làm agent lỗi; có gợi ý khi agent lỗi vì chúng. | Xem báo cáo thật hiện đúng không. |
| `security.ts`, `scripts/test-setup.ts` | `AGENTHUB_LOG_DIR` (mặc định `logs/`). `pnpm test` ghi audit vào thư mục tạm, nên `logs/` chỉ có lần chạy thật. | Không cần đặt biến này ở `.env`. |
| `packages/mock-mcp` | workiq `fetch {entityUrls}`; ado `wit_query` action `wiql` (lỗi subquery), `wit_work_item` `get_batch`/`list_revisions`/`my`; azure từ chối tham số lạ, thêm `monitor_table_list`, KQL sai trả `BadArgumentError`, `monitor_activitylog_list` trả activity log. | Không cần làm gì. Chỉ dùng cho `mock`/`byok`. |

Allowlist (`readTools`) không đổi. Không thêm tool ghi nào.

## 3. Việc tiếp theo ở Work (theo thứ tự)

1. **Cài đặt sau khi pull:** `git pull`, `pnpm install`, `pnpm typecheck`, `pnpm test`. Tất cả phải xanh trước khi làm tiếp.
2. **`pnpm brief` với `AGENTHUB_RUNTIME=copilot`.** Ghi vào `docs/step0-results.md` mục 9 (lần 3):
   - tổng thời gian, thời gian từng agent, AI Credits;
   - `cloud-reader`: số lần gọi `azure-monitor` (đếm trong `logs/audit-<ngày>.jsonl`), có lỗi `unknown arguments` /
     `not available` / `BadArgumentError` không;
   - `board-reader`: còn lỗi WIQL `«SELECT»` không, model dùng `@Follows` hay `action:"my"`;
   - báo cáo có item nào chỉ nhắc lại lỗi tool không.
3. **Audit:** `logs/audit-<ngày>.jsonl` không có tool ghi nào `allow`. Sau bước 1, file này không còn bản ghi của test.
4. **Nếu task mới vẫn sai:** ghi lỗi nguyên văn (đã xoá định danh) và tham số model dùng vào `docs/work-feedback.md`.
   Có thể tự sửa chuỗi `task` trong `agents.ts`, nhưng không đổi `readTools`.
5. **Tuỳ chọn:** thử `GITHUB_MCP_TOKEN` để trống. Ghi vào `step0-results.md` mục 5.
6. **Tuỳ chọn:** user đối chiếu AI Credits ở footer báo cáo với trang billing (giả định `1e9 nano-AIU = 1 AI Credit`).
7. **Cập nhật và đẩy về:**
   - Cập nhật `docs/step0-results.md`, `docs/work-feedback.md`, checklist `PLAN.md` (dòng `[Work]` chạy lại brief).
   - Ghi phần Home cần làm vào `docs/handoff-claude.md` §3 (thay nội dung cũ), kèm trạng thái mới ở §1.
   - Chạy `pnpm typecheck` và `pnpm test`, rồi commit và push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật. Áp dụng cả cho commit message.
- Không dùng `approveAll`. Mọi quyết định tool đi qua `decide()` trong `security.ts`.
- Không thêm tool ghi vào agent `kind: "reader"`. Thay đổi quyền phải ghi rõ trong commit message.
- Giữ `readTools` là danh sách tường minh. Không quay lại `"*"`.
- Azure MCP phải giữ `--read-only`: gate chỉ thấy tên `azure-monitor`, không thấy lệnh con.
- `mcpAuth` chỉ cấp token cho origin có trong `ENTRA_MCP`. Thêm server OAuth mới thì thêm đúng origin và scope, không dùng scope rộng.
- Không commit `.env`, `logs/`, `reports/`, token.
