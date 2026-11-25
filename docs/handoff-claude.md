# Bàn giao Work → Home (2026-11-25)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục 2026-11-25),
> [mcp-tools.md](mcp-tools.md), [step0-results.md](step0-results.md).
> Bàn giao trước (2026-11-23): Home đã làm xong mục 1–8 (commit `d309405`).

## 1. Trạng thái

- Base `e8cbe6b` (= `origin/main`). Mọi thay đổi ở mục 2 **chưa commit**; user sẽ commit rồi pull ở Home.
- Lúc bàn giao: `pnpm typecheck` xanh, `pnpm test` 22/22 xanh (runtime mock).
- Step 0 (runtime `copilot`) đã xong, trừ Playwright:

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. Tham số thật của `actions_list`, `pull_request_read`, `search_pull_requests` trong work-feedback |
| ADO Remote MCP (`board-reader`) | ok. `wit_query` `action:"wiql"`; `wit_work_item` `action:"get_batch"`/`"list_revisions"`/`"my"`. Model viết WIQL có subquery → lỗi, lần thử lại bỏ mất điều kiện "đang follow" |
| Work IQ (`comms-reader`) | ok sau khi user tự chấp nhận EULA (không cần admin consent). `fetch` nhận `{entityUrls: string[]}` |
| Azure MCP (`cloud-reader`) | ok. 4 tool, allowlist `AZURE_READ`. Chậm nhất (~59s, 15 lần gọi `monitor`) do thử sai tên lệnh/tham số |
| Playwright MCP | chưa chạy |
| `pnpm list-tools` | ok cả 4 server → `docs/mcp-tools.md` |
| `pnpm brief` runtime `copilot` | 4/4 agent ok, 60.5s, 44.29/120 AI Credits. Không tool ghi nào được allow; built-in `github-mcp-server-*` bị deny |

## 2. Thay đổi chưa commit

| File | Nội dung |
|---|---|
| `packages/core/src/agents.ts` | **Thay đổi quyền:** `cloud-reader` dùng `AZURE_READ` = `monitor`, `subscription_list`, `group_list`, `group_resource_list` thay cho `"*"`. Lệnh con của `monitor` (qua `args.command`) chỉ được giữ read-only nhờ cờ `--read-only` của server. Task `cloud-reader` **chưa** sửa |
| `packages/mock-mcp/src/server.ts` | azure: bỏ `monitor_alerts_list`/`monitor_logs_query`. Thêm `monitor` dạng dispatcher `{intent, command?, parameters?, learn?}` với 3 lệnh con (`monitor_workspace_list`, `monitor_workspace_log_query`, `monitor_activitylog_list`), cùng `subscription_list`, `group_list`, `group_resource_list`. Lỗi "command not available" và "Missing Required options" khớp thật. Giữ tool ghi giả `monitor_alert_dismiss` |
| `fixtures/data/azure.json` | Thêm `subscriptions`, `resourceGroups`, `resources`, `workspaces` (tự tạo) |
| `fixtures/scenarios/brief-ok.jsonl`, `brief-auth.jsonl` | Tool azure → `monitor` |
| `packages/core/test/security.test.ts` | `cloud-reader`: `azure-monitor` allow, `azure-monitor_alert_dismiss` deny; args server có `--read-only` |
| `packages/mock-mcp/test/server.test.ts` | Chọn tool đọc theo `inputSchema.required` rỗng (tool azure có tham số tuỳ chọn) |
| `scripts/list-tools.ts` | Tách dòng mô tả theo `\r?\n` (mô tả của Azure MCP có CRLF) |
| `docs/*`, `PLAN.md` | `mcp-tools.md` thêm azure; `step0-results.md`; `work-feedback.md` thêm 6 mục 2026-11-25; checklist PLAN; file này |

## 3. Việc cho Home (theo thứ tự)

Theo CLAUDE.md: sửa `packages/mock-mcp` + `fixtures/` trước, rồi mới sửa code. Chi tiết và thông điệp lỗi
nguyên văn: [work-feedback.md](work-feedback.md), các mục 2026-11-25.

1. **Mock workiq `fetch`.** Đổi schema `{paths}` → `{entityUrls: string[]}` (đường dẫn Graph tương đối).
   Sửa fixture tương ứng.
2. **Mock azure chặt hơn.**
   - Từ chối tham số lạ với thông điệp thật `Request rejected due to unknown arguments: <tên>` (ví dụ
     `resource-group` cho `monitor_workspace_log_query`).
   - Thêm lệnh con `monitor_table_list` `{subscription, resource-group, workspace}`.
   - KQL sai → lỗi dạng `{"status":400,...,ErrorCode: BadArgumentError}`; thêm fixture/scenario cho lỗi này.
   - `monitor_activitylog_list` trả activity log, không phải alert (server thật không có lệnh liệt kê alert).
3. **Mock ado WIQL.** `wit_query` `action:"wiql"` `{project, wiql, top}`; trả lỗi
   `Expecting constant value. The error is caused by «SELECT»` khi `wiql` chứa `(SELECT`. Đối chiếu các
   `action` của `wit_work_item` với work-feedback (`get_batch`, `list_revisions`, `my`).
4. **Task agent** (`packages/core/src/agents.ts`).
   - `cloud-reader`: bỏ "cảnh báo đang bật"; đổi thành lỗi nổi bật trong Log Analytics + activity log 24h.
     Ghi tên lệnh đầy đủ có tiền tố `monitor_` (`monitor_workspace_list` → `monitor_table_list` →
     `monitor_workspace_log_query`; `monitor_activitylog_list`) hoặc dặn gọi `learn:true` trước. Ghi rõ
     `monitor_workspace_log_query` không nhận `resource-group`. Mục tiêu: giảm số lần gọi và thời gian.
   - `board-reader`: WIQL không dùng subquery; item đang follow dùng `[System.Id] IN (@Follows)` hoặc
     `wit_work_item` `action:"my"`.
   - Prompt chung: lỗi tool không phải là item. Hiện lỗi bị lặp ở "Không lấy được" và "Cần bạn xử lý".
5. **`report.ts`.** Thêm gợi ý cho "Chưa cấu hình" (trỏ `.env` / `docs/WORK.md`), `unknown arguments`,
   `BadArgumentError`, lỗi WIQL. Cân nhắc bỏ item của agent nếu item chỉ nhắc lại lỗi tool đã biết.
6. **Audit log khi test.** `pnpm test` đang ghi vào `logs/audit-<ngày>.jsonl` thật, lẫn với bản ghi của
   brief thật. Thêm `AGENTHUB_LOG_DIR` (hoặc tham số cho logger); test dùng thư mục tạm.
7. Sau mỗi bước: `pnpm typecheck` + `pnpm test` xanh với `AGENTHUB_RUNTIME=mock`; `pnpm brief` (mock) mở
   được báo cáo. Tick dòng `[Home]` 2026-11-25 trong `PLAN.md`.

## 4. Việc còn lại ở Work

- Playwright MCP: chưa thử.
- User đối chiếu 44.29 AI Credits với trang billing công ty.
- Tuỳ chọn: chạy `pnpm brief` với `GITHUB_MCP_TOKEN` rỗng.
- Sau khi Home làm mục 3.4: chạy lại `pnpm brief` runtime `copilot`, so số lần gọi `monitor` và thời gian
  của `cloud-reader` với lần này (15 lần, ~59s).

## 5. Ràng buộc

- Không có dữ liệu công ty trong repo (tên org/project/tenant/tài khoản, nội dung mail/work item). Fixture
  là dữ liệu tự tạo.
- Không dùng `approveAll`; mọi quyết định tool đi qua `decide()` trong `packages/core/src/security.ts`.
- Không thêm tool ghi vào agent `kind: "reader"`. Thay đổi quyền phải ghi rõ trong commit message.
- Giữ `readTools` tường minh, không quay lại `"*"` (heuristic `looksLikeWrite` đoán sai, xem
  `docs/work-feedback.md`).
- Azure MCP phải giữ `--read-only`: gate chỉ thấy tên `azure-monitor`, không thấy lệnh con trong `args.command`.
- `mcpAuth` chỉ cấp token cho origin trong `ENTRA_MCP`. Thêm server mới thì thêm đúng origin + scope, không
  dùng scope rộng.
- Không commit `.env`, `logs/`, `reports/`, token.
