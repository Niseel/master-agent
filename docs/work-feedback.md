# Work feedback

> Ghi khác biệt giữa mock và thật, dạng cấu trúc. Không có dữ liệu thật.
> Home (Claude Code) đọc file này: sửa mock MCP + fixture trước, rồi mới sửa code.

Mẫu mỗi mục:

```
## <ngày> — <server/agent>
- Thấy: <tên event / tên tool / schema / mã lỗi>
- Mock đang giả định: <...>
- Đề xuất: <...>
```

## 2026-11-23 — workiq (comms-reader)
- Thấy: 13 tool thật: `accept_eula`, `ask`, `call_function`, `create_entity`, `delete_entity`, `do_action`,
  `fetch`, `fetch_blob`, `get_schema`, `list_agents`, `retrieve`, `search_paths`, `update_entity`.
  Allowlist: `retrieve`, `ask`, `fetch`, `search_paths`, `get_schema`.
- Thấy: trước khi user chấp nhận EULA, mọi tool trả lỗi (`postToolUseFailure`) với nội dung là thông báo EULA.
  Model từ chối tự gọi `accept_eula` (tool này cũng không nằm trong allowlist).
- Mock đang giả định: tool `mail_list_unread`, `teams_list_unread`.
- Đề xuất: đổi mock-mcp workiq sang tên thật (`retrieve`/`ask`/`fetch`...), sửa fixture, rồi bỏ
  `WORKIQ_MOCK_READ` trong `agents.ts`. Thêm fixture lỗi EULA (tool failure) để báo cáo hiển thị lý do rõ ràng.

## 2026-11-23 — ado (board-reader)
- Thấy: status `pending → needs-auth → pending → connected`. Cần `onMcpAuthRequest` trả
  `{kind:"token"}` với token Entra scope `https://mcp.dev.azure.com/.default` (lấy qua `az account get-access-token`).
- Thấy: nếu gửi prompt ngay sau `createSession`, lượt đầu chưa có tool ADO. Đã thêm `waitForMcp()` (poll
  `session.rpc.mcp.list()` tới khi hết `pending`/`needs-auth`, tối đa 60s).
- Thấy: tool call lỗi `VS30063` khi identity của `az` không thuộc org. OAuth vẫn báo `outcome:"token"` và
  server vẫn connected, nên lỗi chỉ lộ ra ở tool call đầu tiên.
- Thấy: tài khoản ADO khác tài khoản Azure → profile `az` riêng (`ADO_AZURE_CONFIG_DIR`, đường dẫn tuyệt đối;
  `process.loadEnvFile` không expand `$HOME`). Sau đó `core_list_projects` chạy được.
- Thấy: 26 tool, phần lớn dạng gộp có tham số `action` (`wit_work_item`, `wit_query`, `wit_backlog`, `work`...).
  Không có `wit_my_work_items`.
- Mock đang giả định: `wit_my_work_items` (fixture đã đổi sang `wit_query`).
- Đề xuất: đổi mock-mcp ado sang tool có `action`; thêm fixture lỗi `VS30063`.

## 2026-11-23 — github (code-reader) + built-in
- Thấy: runtime tự thêm server built-in `github-mcp-server` (6 tool, `configSource: "builtin"`) vào mọi session,
  kể cả agent không khai báo GitHub. Tên `github-mcp-server-*` trùng tiền tố `github-` nên kiểm tra theo
  tiền tố không đủ; chỉ allowlist tường minh mới chặn được.
- Thấy: heuristic đoán sai: `workiq-do_action`, `workiq-accept_eula` → read (thật là ghi/đổi trạng thái);
  `ado-pipelines_run`, `ado-testplan_test_run` → write (thật là đọc).
- Đề xuất: giữ `readTools` tường minh cho mọi agent; không quay lại `"*"`.

## 2026-11-23 — SDK
- Thấy: kiểu `McpAuthRequest`/`McpAuthResult` không được export từ gói; dùng
  `NonNullable<SessionConfig["onMcpAuthRequest"]>`.
- Thấy: mỗi lần smoke tốn khoảng 1 premium request (`totalPremiumRequestCost: 1`).
