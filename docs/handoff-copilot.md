# Bàn giao Home → Work (2026-11-25)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [PLAN.md](../PLAN.md), [WORK.md](WORK.md).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 1. Trạng thái

- `main` = `d309405`. Home đã làm xong mục 1–8 trong `handoff-claude.md` §3.
- Home đã kiểm tra:
  - `pnpm typecheck` xanh, `pnpm test` 22/22 xanh;
  - `pnpm brief` (runtime `mock`) chạy với 3 kịch bản `brief-ok`, `brief-failures`, `brief-auth`;
  - `pnpm list-tools` với runtime `byok` (SDK thật) kết nối được cả 4 server: workiq, ado, azure là mock, github là thật.
- Repo dùng line ending LF (`.gitattributes`). Nếu `git status` báo mọi file đều đổi sau khi pull,
  chạy `git add --renormalize .` rồi kiểm tra lại. Không commit thay đổi chỉ do CRLF.

## 2. Home đã đổi gì (ảnh hưởng tới Work)

| Phần | Thay đổi | Việc ở Work |
|---|---|---|
| `packages/mock-mcp` | Mock workiq dùng tên tool thật. Thêm server `ado` (tool gộp có `action`). | Không cần làm gì. Chỉ dùng cho `mock`/`byok`. |
| `agents.ts` | `board-reader` chỉ gọi ADO thật khi `AGENTHUB_RUNTIME=copilot`. `ADO_AZURE_CONFIG_DIR` là đường dẫn tương đối hoặc không tồn tại thì agent dừng ngay, kèm thông báo. | Kiểm tra `.env` dùng đường dẫn tuyệt đối. |
| `events.ts`, `report.ts`, `apps/cli/src/brief.ts` | `tool.completed` mang theo thông báo lỗi. Báo cáo gợi ý cách xử lý cho lỗi EULA, `VS30063`, `AADSTS65001`, hết ngân sách. Có thêm mục "Đã chặn". | Xem báo cáo thật có hiện đúng không. |
| `runtime/sdk.ts` | Gate in "Bị chặn: ..." khi từ chối tool. Nếu server chưa kết nối sau 60s, `waitForMcp` báo `MCP chưa kết nối sau 60s: <server>`. | Ghi lại nếu có cảnh báo này. |
| `config.ts` | `GITHUB_REPOS` nhận URL đầy đủ, tự chuẩn hoá về `owner/repo`. | Giữ nguyên giá trị đang có. |
| `packages/mock-mcp/test/server.test.ts` | Test fail nếu một tên trong allowlist không có trong mock. | Thêm tool vào allowlist thì thêm tool cùng tên vào `packages/mock-mcp/src/server.ts` (dữ liệu tự tạo), hoặc ghi vào `work-feedback.md` để Home làm. |

Allowlist (`readTools`) không đổi. Không thêm tool ghi nào.

## 3. Việc tiếp theo ở Work (theo thứ tự)

1. **Cài đặt sau khi pull:** `git pull`, `pnpm install`, `pnpm typecheck`, `pnpm test`. Tất cả phải xanh trước khi làm tiếp.
2. **Work IQ:** user tự chạy `npx -y @microsoft/workiq accept-eula` trong terminal. Agent không được gọi `accept_eula`.
   Sau đó chạy `pnpm smoke comms-reader`. Ghi kết quả vào `docs/step0-results.md` mục 2–3, và ghi có cần admin consent hay không.
3. **ADO, truy vấn 24h:** `pnpm smoke board-reader`, rồi `pnpm brief`. Kiểm tra agent liệt kê được work item
   giao cho user thay đổi trong 24h. Ghi lại tool và giá trị `action` mà model đã dùng.
4. **Input schema thật:** SDK không trả schema của tool MCP. Sau bước 2–3, mở `logs/audit-<ngày>.jsonl` và xem trường `args`.
   Với mỗi tool trong allowlist, ghi vào `docs/work-feedback.md`:
   - **Được ghi:** tên tham số, kiểu, giá trị enum của `action`.
   - **Không được chép:** giá trị dữ liệu như id, tên người, tên project, nội dung query.
5. **Azure MCP (`cloud-reader`):**
   - Đặt `AZURE_SUBSCRIPTION` và `AZURE_LOG_WORKSPACE`.
   - Chạy `az login` (profile mặc định), rồi `pnpm smoke cloud-reader`.
   - Nếu cờ `--namespace monitor --read-only` không hợp lệ: xem `npx -y @azure/mcp@latest server start --help` và sửa `args` trong `agents.ts`.
   - Chạy `pnpm list-tools`, sửa tay cột Loại trong `docs/mcp-tools.md`.
   - Thay `readTools: "*"` của `cloud-reader` bằng danh sách cụ thể (theo mẫu `WORKIQ_READ`).
   - Thêm tool cùng tên vào mock azure trong `packages/mock-mcp/src/server.ts`, để `pnpm test` vẫn xanh.
   - `pnpm list-tools` ghi đè `docs/mcp-tools.md`: sửa lại các ô Loại đã chỉnh tay (dấu `*`) trước khi commit.
6. **`pnpm brief` với `AGENTHUB_RUNTIME=copilot`:** đối chiếu với tiêu chí xong Phase 1 trong `WORK.md` §5:
   - báo cáo đúng;
   - chạy dưới 3 phút;
   - credit nằm trong ngân sách;
   - `logs/audit-*.jsonl` không có tool ghi nào `allow`.

   Đối chiếu số credit ở footer báo cáo với trang billing (giả định `1e9 nano-AIU = 1 AI Credit`).
7. **Tuỳ chọn:** thử `GITHUB_MCP_TOKEN` để trống, xem Copilot có tự auth GitHub MCP không. Ghi vào `step0-results.md` mục 5.
8. **Cập nhật và đẩy về:**
   - Cập nhật `docs/step0-results.md`, `docs/work-feedback.md`, checklist `PLAN.md`.
   - Ghi phần Home cần làm vào `docs/handoff-claude.md` §3 (thay nội dung cũ), kèm trạng thái mới ở §1.
   - Chạy `pnpm typecheck` và `pnpm test`, rồi commit và push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản; không nội dung mail, chat, work item, log. Áp dụng cả cho commit message.
- Không dùng `approveAll`. Mọi quyết định tool đi qua `decide()` trong `security.ts`.
- Không thêm tool ghi vào agent `kind: "reader"`. Thay đổi quyền phải ghi rõ trong commit message.
- Giữ `readTools` là danh sách tường minh. Không quay lại `"*"`, trừ `cloud-reader` cho tới khi xong bước 5.
- `mcpAuth` chỉ cấp token cho origin có trong `ENTRA_MCP`. Thêm server OAuth mới thì thêm đúng origin và scope, không dùng scope rộng.
- Không commit `.env`, `logs/`, `reports/`, token.
