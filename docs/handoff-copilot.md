# Bàn giao Home → Work (2026-11-25, lần 3)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [PLAN.md](../PLAN.md), [WORK.md](WORK.md).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 1. Trạng thái

- Home đã commit bản Work lần 3 + 4 (Azure MCP dùng `AzureCliCredential`, nhiều workspace), rồi làm xong mục 1–7
  trong `handoff-claude.md` §3.
- Home đã kiểm tra:
  - `pnpm typecheck` xanh, `pnpm test` 27/27 xanh;
  - `pnpm brief` (runtime `mock`) chạy với 3 kịch bản `brief-ok`, `brief-failures`, `brief-auth`.
- Mới: thiết kế UI/UX Phase 2 (dashboard) ở [design/dashboard.excalidraw](design/dashboard.excalidraw). Chỉ là
  wireframe, chưa có code. Mở bằng excalidraw.com (Open, file local) hoặc extension Excalidraw trong VS Code.
- Repo dùng line ending LF (`.gitattributes`). Nếu `git status` báo mọi file đều đổi sau khi pull,
  chạy `git add --renormalize .` rồi kiểm tra lại. Không commit thay đổi chỉ do CRLF.

## 2. Home đã đổi gì (ảnh hưởng tới Work)

| Phần | Thay đổi | Việc ở Work |
|---|---|---|
| `report.ts` | Lỗi `InsufficientAccessError` / `Could not find workspace` không còn là lỗi chặn. Nay là **cảnh báo**: hiện ở mục "Cảnh báo" kèm cách sửa, và **giữ** item của workspace khác. Trước đó một workspace 403/404 làm `cloud-reader` bị tính lỗi và mất hết item Azure. Thêm gợi ý cho `SYN0002`. | Xem báo cáo thật: nếu workspace thứ hai vẫn lỗi, phải thấy mục "Cảnh báo" và vẫn có item Azure. |
| `apps/cli/src/brief.ts` | Dòng cuối in thêm số cảnh báo. | Không cần làm gì. |
| `packages/mock-mcp` | azure: `SYN0002` khi KQL đặt tên cột `last`; workspace `law-payments` trả 403, `law-archive` trả 404 (dữ liệu tự tạo). ado: `wit_work_item` thêm `list_comments`, `list_revisions` nhận `skip`/`expand`. | Không cần làm gì. Chỉ dùng cho `mock`/`byok`. |

Allowlist (`readTools`) không đổi. Không thêm tool ghi nào. Danh tính Azure MCP giữ `AzureCliCredential`.

## 3. Việc tiếp theo ở Work (theo thứ tự)

1. **Cài đặt sau khi pull:** `git pull`, `pnpm install`, `pnpm typecheck`, `pnpm test`. Tất cả phải xanh trước khi làm tiếp.
2. **`pnpm brief` với `AGENTHUB_RUNTIME=copilot` (lần 5, khoảng 39 AI Credits).** Mục tiêu: xác nhận workspace thứ hai
   đọc được qua agent sau khi đổi sang `AzureCliCredential`. Ghi vào `docs/step0-results.md` mục 9:
   - tổng thời gian, thời gian từng agent, AI Credits;
   - `cloud-reader`: workspace thứ hai trả 200 hay vẫn 403/404; báo cáo có mục "Cảnh báo" không;
   - audit `logs/audit-<ngày>.jsonl`: không có tool ghi nào `allow`.
3. **Tuỳ chọn:** ghim phiên bản `@azure/mcp` trong `agents.ts` (đang `@latest`, bản beta). Chạy lại `pnpm test`.
4. **Tuỳ chọn:** thử `GITHUB_MCP_TOKEN` để trống. Ghi vào `step0-results.md` mục 5.
5. **Góp ý thiết kế dashboard (không bắt buộc):** nếu thấy panel nào thiếu thông tin cần ở Work (ví dụ trạng thái
   auth cụ thể), ghi vào `docs/work-feedback.md`. Không chép dữ liệu thật vào file thiết kế.
6. **Cập nhật và đẩy về:**
   - Cập nhật `docs/step0-results.md`, `docs/work-feedback.md`, checklist `PLAN.md`.
   - Ghi phần Home cần làm vào `docs/handoff-claude.md` §3 (thay nội dung cũ), kèm trạng thái mới ở §1.
   - Chạy `pnpm typecheck` và `pnpm test`, rồi commit và push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật. Áp dụng cả cho commit message.
- Không dùng `approveAll`. Mọi quyết định tool đi qua `decide()` trong `security.ts`.
- Không thêm tool ghi vào agent `kind: "reader"`. Thay đổi quyền phải ghi rõ trong commit message.
- Giữ `readTools` là danh sách tường minh. Không quay lại `"*"`.
- Azure MCP phải giữ `--read-only` và `AZURE_TOKEN_CREDENTIALS=AzureCliCredential`.
- `mcpAuth` chỉ cấp token cho origin có trong `ENTRA_MCP`. Thêm server OAuth mới thì thêm đúng origin và scope, không dùng scope rộng.
- Không commit `.env`, `logs/`, `reports/`, token. Token đã lộ thì user thu hồi và tạo lại.
