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

## 2026-11-25 — ado (board-reader), tham số thật từ audit
- Thấy: `wit_query` `{action:"wiql", project:string, wiql:string, top:number}`.
- Thấy: `wit_work_item` dùng các `action`:
  - `get_batch` `{ids:number[], fields:string[]}`
  - `list_revisions` `{project, workItemId:number, top}`
  - `my` `{project, type:"myactivity", top}`
- Thấy: lần `wit_query` đầu lỗi `Expecting constant value. The error is caused by «SELECT»`. Nguyên nhân: model
  viết subquery `[System.Id] IN (SELECT ...)`, WIQL không hỗ trợ. Lần thử lại bỏ subquery, nhưng cũng bỏ luôn
  điều kiện "đang follow".
- Mock đang giả định: `wit_query` trả kết quả với mọi WIQL.
- Đề xuất: thêm vào task của board-reader gợi ý WIQL: không dùng subquery, item đang follow dùng
  `[System.Id] IN (@Follows)`, hoặc dùng `wit_work_item` `action:"my"`. Mock trả lỗi trên khi `wiql` chứa `(SELECT`.

## 2026-11-25 — github (code-reader), tham số thật từ audit
- Thấy: `actions_list` `{method:"list_workflow_runs", owner, repo, perPage:number, workflow_runs_filter?:{status?, event?}}`
  (giá trị đã gặp: `status:"completed"`, `event:"push"`).
- Thấy: `pull_request_read` `{method:"get_comments"|"get_review_comments", owner, repo, pullNumber:number}`.
- Thấy: `search_pull_requests` `{query:string}`; `get_me` `{}`.

## 2026-11-25 — workiq (comms-reader)
- Thấy: `fetch` `{entityUrls:string[]}`. Vẫn lỗi EULA.
- Thấy: khi tool lỗi EULA, model vẫn trả 1 item (source Outlook, priority high) nói về EULA. Lỗi này hiện hai
  lần trong báo cáo: ở "Không lấy được" và ở "Cần bạn xử lý".
- Đề xuất: khi agent có lỗi tool với nguyên nhân đã biết (EULA, cấu hình, auth), bỏ các item của agent đó nếu
  item chỉ nhắc lại lỗi. Hoặc dặn trong prompt: lỗi tool không phải là item.

## 2026-11-25 — test / audit
- Thấy: `pnpm test` ghi audit vào `logs/audit-<ngày>.jsonl` thật (agent, tool giả, gồm cả
  `github-add_issue_comment` → reject). Bản ghi test lẫn với bản ghi của brief thật, nên khó kiểm
  tiêu chí "không có tool ghi nào được allow".
- Đề xuất: khi chạy test, ghi audit vào thư mục tạm (ví dụ biến `AGENTHUB_LOG_DIR` hoặc tham số cho logger).

## 2026-11-25 — workiq (comms-reader), sau khi chấp nhận EULA
- Thấy: user chấp nhận EULA thủ công, không cần admin consent. Lỗi EULA ở mục trên đã hết.
- Thấy: `fetch` `{entityUrls:string[]}` (đường dẫn Graph tương đối) chạy được; 2 lần gọi, agent ok.
- Mock đang giả định: `fetch` `{paths:string[]}`.
- Đề xuất: đổi schema mock `fetch` sang `entityUrls`, sửa fixture tương ứng.

## 2026-11-25 — azure (cloud-reader)
- Thấy: server chạy `--namespace monitor --read-only`, 4 tool:
  - `monitor` `{intent, command?, parameters?, learn?}`, không có `readOnlyHint`
  - `subscription_list` `{tenant?}`
  - `group_list` `{subscription?, tenant?}`
  - `group_resource_list` `{"resource-group", subscription?, tenant?}`
- Thấy: `monitor` có 22 lệnh con, tên đầy đủ có tiền tố `monitor_`. Không có lệnh liệt kê alert.
  An toàn dựa vào `--read-only` + allowlist `AZURE_READ` (đã thay `"*"`).
- Thấy: chuỗi gọi của model: `monitor_workspace_list` `{subscription}` → `monitor_table_list`
  `{subscription, resource-group, workspace}` → `monitor_workspace_log_query`
  `{subscription, workspace, table, query, hours}` → `monitor_activitylog_list` `{subscription, resource-group, hours}`.
- Thấy: lỗi thật:
  - `The command '<cmd>' is not available for the 'monitor' tool.` (khi thiếu tiền tố `monitor_`)
  - `Request rejected due to unknown arguments: resource-group` (trên `log_query`)
  - `Missing Required options: --resource-name` kèm Command Spec JSON
  - KQL sai: `{"status":400,...,ErrorCode: BadArgumentError}`
- Thấy: runtime vẫn thử gọi `github-mcp-server-*` built-in; bị deny đúng.
- Thấy: cloud-reader chậm nhất (~59s), nhiều lần gọi `monitor` (15) do thử sai.
- Mock đã sửa ở Work: thông điệp lỗi command-not-available và Missing Required options khớp thật.
- Mock đang giả định: chấp nhận tham số lạ; không có `monitor_table_list`; `activitylog_list` trả alert.
- Đề xuất:
  - Viết lại task cloud-reader: Log Analytics + activity log (bỏ "cảnh báo đang bật"), ghi tên lệnh đầy đủ
    hoặc dặn gọi `learn:true` trước; `log_query` không nhận `resource-group`.
  - Mock: từ chối tham số lạ với thông điệp thật, thêm `monitor_table_list`, thêm fixture `BadArgumentError`.
  - `report.ts`: thêm HINT cho "Chưa cấu hình" (trỏ `.env`/WORK.md) và cho `unknown arguments`/`BadArgumentError`.
- Ghi chú: lỗi WIQL subquery của board-reader lặp lại (xem mục ado ở trên).
