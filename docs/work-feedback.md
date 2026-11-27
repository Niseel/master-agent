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

## 2026-11-25 (lần 3) — azure (cloud-reader), sau task mới của Home
- Thấy: 8 lần `monitor` (trước 15), 47.6s (trước ~59s). Không còn `unknown arguments` / `not available`.
  Mọi lần gọi `monitor` có đủ `{command, intent, parameters}`.
- Thấy: trình tự thật: `monitor_workspace_list` → `group_list` → `monitor_table_list` ×2 → `group_resource_list` ×2
  → 3 `monitor_workspace_log_query` song song `{subscription, workspace, table, query, hours:24}` (đúng, không có
  `resource-group`) → 2 lần thử lại thành công.
- Thấy: `AZURE_LOG_WORKSPACE` chứa 2 tên workspace cách nhau bằng dấu phẩy. Model tự tách và truy vấn cả hai.
  Config chỉ là `string`; task ghi nguyên chuỗi vào `"..."`.
- Thấy: lỗi thật (đã bỏ định danh):
  - `{"status":400,"message":"The request had some invalid properties\r\nStatus: 400 (Bad Request)\r\nErrorCode: BadArgumentError ...`
    với lỗi con `SyntaxError` mã `SYN0002` `Query could not be parsed at 'last'`. Nguyên nhân: model đặt tên cột
    `last` trong `summarize` (`last=max(TimeGenerated)`); `last` là từ khoá KQL, không dùng làm tên cột được.
  - `{"status":403,"message":"The provided credentials have insufficient access to perform the requested operation\r\nSt...`
    `ErrorCode: InsufficientAccessError`. Gặp ở workspace thứ hai (tài khoản thiếu quyền đọc), không phải lỗi tham số.
    Model không thử lại.
- Thấy: model gọi `group_resource_list` nhưng **không gọi `monitor_activitylog_list`**: activity log bị bỏ qua.
- Thấy: báo cáo không có item nào nhắc lại lỗi tool (3 item Azure). Agent không bị tính là lỗi (đúng `summarize`).
- Đã sửa ở Work (chỉ chuỗi `task`): không dùng từ khoá KQL (ví dụ `last`) làm tên cột, dùng `lastSeen`;
  luôn gọi `monitor_activitylog_list` kể cả khi log query lỗi; 403 `InsufficientAccessError` là thiếu quyền, không thử lại.
- Mock đang giả định: KQL sai chỉ khi không bắt đầu bằng tên bảng; mọi workspace đều đọc được.
- Đề xuất:
  - Mock: `monitor_workspace_log_query` trả `BadArgumentError` kèm `SYN0002` khi query có `last=` (hoặc
    `, last =`); thêm 1 workspace trong fixture trả 403 `InsufficientAccessError`.
  - `report.ts`: gợi ý cho `InsufficientAccessError` (cần quyền đọc Log Analytics trên workspace, ví dụ role
    Log Analytics Reader). Không coi là lỗi chặn nếu workspace khác vẫn đọc được.
  - Tuỳ chọn: `azure.workspace` nhận danh sách (tách theo dấu phẩy) và ghi rõ từng workspace trong task.

## 2026-11-25 (lần 3) — ado (board-reader)
- Thấy: hết lỗi WIQL `«SELECT»`. 2 lần `wit_query` `{action:"wiql", project, wiql}` (không có `top`): một câu
  dùng `@Me`, một câu dùng `@Follows`, không có subquery. Giữ được điều kiện "đang theo dõi".
- Thấy: sau đó `wit_work_item` `get_batch` ×1 `{action, ids, project}` và `list_revisions` ×4
  `{action, project, workItemId, top, skip?, expand?}`. Không dùng `action:"my"`.
- Thấy: board-reader chậm nhất (76.4s), trong đó có 4 lần `list_revisions`.
- Đề xuất: mock `list_revisions` nhận thêm `skip`, `expand` (tuỳ chọn).

## 2026-11-25 (lần 4) — azure (cloud-reader), sau khi Work sửa task
- Thấy: 4/4 agent ok, 7 mục, 46.5s, 39.29/120 AI Credits. cloud-reader 45.5s (lần 3: 47.6s).
- Thấy: trình tự thật (10 lần gọi, tất cả `allow`): `monitor_workspace_list` → `group_list` →
  `monitor_table_list` ×1 `{subscription, resource-group, workspace}` → `group_resource_list` ×2 →
  `monitor_workspace_log_query` ×3 `{subscription, workspace, table, query, hours}` → `monitor_activitylog_list` ×2
  `{subscription, resource-group, resource-name, hours}`. Không gọi `learn`.
- Thấy: task mới có tác dụng:
  - Query dùng `lastSeen=max(TimeGenerated)`, bắt đầu bằng tên bảng, không dùng `ago()`. Hết `SYN0002`.
  - `log_query` không có `resource-group`.
  - `monitor_activitylog_list` được gọi (có `resource-name` lấy từ `group_resource_list`), kể cả sau khi log query lỗi.
- Thấy: lỗi thật duy nhất (đã bỏ định danh), ở workspace thứ hai:
  `{"status":404,"message":"Could not find workspace with name <name>. To mitigate this issue, please ref...`
  Cùng subscription, cùng tên workspace, cùng khoá tham số như lần 3, nhưng lần 3 trả 403
  `InsufficientAccessError`. Model gọi workspace này 1 lần, không thử lại, chuyển sang activity log.
  Kết luận: tài khoản Work không đọc được workspace thứ hai; lỗi có thể là 403 hoặc 404 tuỳ lần.
  **Kết luận này sai, xem mục "chẩn đoán workspace thứ hai" bên dưới.**
- Thấy: báo cáo không item nào nhắc lại lỗi 404.
- Mock đang giả định: mọi tên workspace trong config đều tìm thấy được.
- Đề xuất:
  - Mock: thêm 1 workspace trong fixture trả 404 `Could not find workspace with name <name>` (cùng chỗ với
    workspace 403 đã đề xuất ở lần 3).
  - `report.ts`: gợi ý chung cho 403/404 trên workspace: kiểm tra tên, subscription/resource group và quyền đọc
    (ví dụ Log Analytics Reader), hoặc bỏ workspace khỏi `AZURE_LOG_WORKSPACE`.
  - Tuỳ chọn: câu "403 ... không thử lại" trong task `cloud-reader` mở rộng thành "403/404".

## 2026-11-25 (lần 4) — ado (board-reader)
- Thấy: 22.0s (lần 3: 76.4s). 6 lần gọi, tất cả `allow`: `wit_query` ×2 `{action:"wiql", project, wiql}`
  (một câu `@Me`, một câu `@Follows`, không subquery), `wit_work_item` `list_revisions` ×2
  `{action, workItemId, project, top, skip}`, `wit_work_item` `action:"list_comments"` ×2
  `{action, workItemId, project, top}`.
- Mock đang giả định: `wit_work_item.action` chỉ nhận `get`, `get_batch`, `list_revisions`, `my`.
- Đề xuất: mock `wit_work_item` thêm `action:"list_comments"` `{workItemId, project, top?}` trả vài bình luận tự tạo.

## 2026-11-25 — chẩn đoán workspace thứ hai (403 lần 3, 404 lần 4)
- Thấy: cả hai workspace trong `AZURE_LOG_WORKSPACE` cùng một subscription, khác resource group. Tham số model
  gửi là đúng (đúng subscription, đúng tên). Không phải do thiếu subscription thứ hai.
- Thấy: `az` CLI và REST (token của `az account get-access-token`) liệt kê và truy vấn được cả hai workspace.
- Thấy: chạy `@azure/mcp` (4.0.0-beta.10) trực tiếp, credential mặc định (chuỗi DefaultAzureCredential):
  `monitor workspace list` trả 2 workspace, **không có** workspace thứ hai; `log query` trên nó trả 404.
  Chuỗi credential mặc định chọn một danh tính khác với tài khoản `az login`.
- Thấy: cùng lệnh với env `AZURE_TOKEN_CREDENTIALS=AzureCliCredential`: `workspace list` trả 4 workspace (có cả
  hai), `log query` trên workspace thứ hai trả 200.
- Thấy: `server start` không có cờ chọn credential; chỉ có env `AZURE_TOKEN_CREDENTIALS`.
- Thấy: `MCPStdioServerConfig.env` được Copilot CLI **gộp** với env kế thừa (kiểm bằng MCP server giả, không gọi
  model): PATH, biến của tiến trình cha và biến trong `env` đều có.
- Đã sửa ở Work: server `azure` (cloud-reader, runtime thật) có `env: { AZURE_TOKEN_CREDENTIALS: "AzureCliCredential" }`.
  Đổi danh tính, không đổi tool; vẫn `--read-only`. Test trong `security.test.ts`. `report.ts` có gợi ý cho
  `InsufficientAccessError` / `Could not find workspace` (kiểm tra tài khoản `az login` và quyền Reader).
- Mock đang giả định: mọi workspace đều đọc được; server mock không quan tâm `env`.
- Đề xuất: mock trả 403/404 cho 1 workspace fixture (như lần 3/4) để test gợi ý mới end-to-end.

## 2026-11-25 (lần 5) — azure (cloud-reader), sau thay đổi Home lần 3
- Thấy: 4/4 agent ok, 5 mục, 0 cảnh báo, 49.5s (tổng lệnh 51.7s), 40.06/120 AI Credits. cloud-reader 48.0s.
- Thấy: 12 lần gọi, tất cả `allow`, không lỗi tool: `group_list` ×1, `group_resource_list` ×2, `monitor` ×9
  (`monitor_workspace_list` ×1, `monitor_table_list` ×2, `monitor_workspace_log_query` ×4,
  `monitor_activitylog_list` ×2).
- Thấy: **workspace thứ hai đọc được qua agent**: `monitor_table_list` ×1 + `monitor_workspace_log_query` ×1, không
  lỗi (lần 4: 404, lần 3: 403). Workspace đầu: `monitor_table_list` ×1 + `monitor_workspace_log_query` ×3. Sửa
  `AzureCliCredential` có tác dụng.
- Thấy: báo cáo có 3 item Azure, không có mục "Cảnh báo" (không còn lỗi 403/404). Đường "Cảnh báo" của Home chỉ
  kiểm được bằng mock.
- Mock đang giả định: `law-payments` trả 403, `law-archive` trả 404.
- Đề xuất: giữ hai workspace lỗi trong mock (lỗi thật vẫn có thể gặp khi thiếu quyền hoặc credential đổi). Không sửa gì.

## 2026-11-25 (lần 5) — comms-reader + built-in `github-mcp-server`
- Thấy: comms-reader 31.2s, 5 lần gọi: `workiq-fetch` ×3 `{entityUrls}`, `workiq-retrieve` ×1 `{query, capabilities}`
  (`capabilities` là mảng `{name}`, giá trị đã gặp: `"TeamsMessages"`), và tool built-in
  `github-mcp-server-get_file_contents` ×1 `{owner, repo}` → `deny` (không thuộc MCP server của comms-reader).
  Báo cáo hiện ở mục "Đã chặn"; agent vẫn ok. Lần 2, cloud-reader cũng gọi built-in ×2.
- Thấy: `sdk.ts` đặt `availableTools: ["mcp:*"]`. Server built-in `github-mcp-server` là MCP server
  (`configSource: "builtin"`), nên `mcp:*` vẫn khớp: model thấy 6 tool built-in trong mọi session. `decide()` chặn
  đúng, nhưng tốn một lượt model.
- Thấy (SDK 1.0.34, `toolSet.d.ts`): `ToolSet.addMcp(toolName)` nhận tên wire của tool MCP (ví dụ
  `"github-list_issues"`) hoặc `"*"`. Dạng chuỗi tương ứng trong `availableTools` là `mcp:<tên>`. `excludedTools` cùng
  cú pháp và luôn thắng. Không có mẫu theo tên server (dạng `mcp:<server>-*` không được tài liệu hoá).
- Mock đang giả định: workiq `retrieve` chỉ có `{query}`.
- Đề xuất:
  - `sdk.ts`: khi `readTools` là danh sách, đặt ``availableTools: a.readTools.map((t) => `mcp:${t}`)`` thay cho
    `["mcp:*"]`. Model chỉ thấy tool trong allowlist. Giữ `decide()` làm lớp thứ hai. Đây là thu hẹp quyền.
    Kiểm ở Home bằng `byok` + mock MCP; Work kiểm audit brief thật không còn `github-mcp-server-*`.
  - Tuỳ chọn (nếu cách trên không được): task comms-reader thêm "chỉ dùng Work IQ, không đọc repo/code GitHub".
  - Mock workiq `retrieve`: thêm `capabilities?: {name: string}[]`.

## 2026-11-25 (lần 5) — ado (board-reader), code-reader
- Thấy: board-reader 21.8s, 7 lần gọi, tất cả `allow`: `wit_query` ×2 `{action:"wiql", project, wiql}` (`@Me`,
  `@Follows`, không subquery), `wit_work_item` `get_batch` ×1 `{action, ids, fields}` (không có `project`),
  `list_comments` ×2 `{action, project, workItemId, top}`, `list_revisions` ×2 `{action, project, workItemId, top}`
  (lần này không có `skip`).
- Thấy: code-reader 21.2s, 7 lần gọi: `get_me` ×1, `search_pull_requests` ×2, `pull_request_read` ×2,
  `actions_list` ×2. Tham số khớp mục "github" ở trên.
- Mock đang giả định: khớp (`project`, `skip` đều tuỳ chọn).
- Đề xuất: không sửa gì.

## 2026-11-25 (lần 5) — công cụ ở Work
- Thấy: xoay vòng `GITHUB_MCP_TOKEN` (token `gho_` của `gh`): thu hồi đúng token cũ qua `POST /credentials/revoke`
  (202), rồi `gh auth login --web`. Không dùng "Revoke access" của OAuth app GitHub CLI (đăng xuất `gh` ở mọi máy).
- Thấy: kiểm GitHub MCP không tốn credit: gửi `initialize` + `tools/list` thẳng tới endpoint, cùng header với
  `agents.ts` → 32 tool, đủ `GITHUB_READ`. `Invoke-WebRequest` treo với phản hồi SSE; dùng `HttpClient` với
  `ResponseHeadersRead` và đọc dòng `data:` đầu tiên.
- Thấy: `pnpm list-tools` ghi đè `docs/mcp-tools.md` và bật mọi MCP server, không hợp để chỉ kiểm một token.
- Thấy: `pnpm brief *> file` trong PowerShell giải mã UTF-8 theo code page của console, tiếng Việt bị lỗi. Đặt
  `[Console]::OutputEncoding = [Text.Encoding]::UTF8` trước.
- Đề xuất: thêm hai ghi chú cuối vào `docs/WORK.md`.

## 2026-11-26 (lần 6) — `availableTools` theo allowlist (`pnpm smoke <agent> --tools`)
- Thấy: runtime `copilot`, cả 4 agent exit 0, in `Tất cả trong allowlist.`, không có `github-mcp-server-*`,
  `totalPremiumRequests: 0`, `totalNanoAiu: 0` (không tốn credit).
- Thấy: số tool model thấy:
  - comms-reader 5: `workiq-ask`, `workiq-fetch`, `workiq-get_schema`, `workiq-retrieve`, `workiq-search_paths`
  - code-reader 15: `github-*`, đúng `GITHUB_READ`
  - cloud-reader 4: `azure-group_list`, `azure-group_resource_list`, `azure-monitor`, `azure-subscription_list`
  - board-reader 7: `ado-*`, đúng `ADO_READ`
- Thấy: server vẫn tải đủ tool (`session.mcp_server_tools_loaded`, ví dụ github 32). `session.info`
  (`infoType: "configuration"`) báo `Disabled tools: ...` gồm tool built-in của CLI (`create`, `edit`, ...) và tool
  `github-*` ngoài allowlist. `mcp:<tên>` khớp đúng trên runtime công ty.
- Đề xuất: không sửa gì.

## 2026-11-26 (lần 6) — brief runtime `copilot`
- Thấy: exit 0, 76.3s (tổng lệnh 78.2s), AI Credits 26.88 / 120 (lần 5: 40.06), 7 mục (1 cần xử lý), báo cáo ghi
  0 lỗi, 0 cảnh báo. cloud-reader 19.3s, code-reader 20.4s, board-reader 24.7s, comms-reader 75.4s (lần 5: 31.2s).
  Credit thấp hơn có lẽ vì cloud-reader dừng sau 1 lần gọi (lần 5: 12 lần, 48.0s); suy luận.
- Thấy: audit 19 bản ghi, 18 `allow`, 1 `deny`, **0 `github-mcp-server-*`**, không tool ghi nào được `allow`.
- Thấy: tham số thật (chỉ khoá):
  - comms-reader: `workiq-ask` ×1 `{question}` (lần đầu gặp ở brief thật; mock khớp), `workiq-fetch` ×3
    `{entityUrls}`, `workiq-retrieve` ×1 `{query, capabilities}`.
  - code-reader: `get_me` ×1 `{}`, `search_pull_requests` ×2 `{owner, query, repo}` (lần 5: chỉ `{query}`),
    `actions_list` ×2 `{method:"list_workflow_runs", owner, repo, perPage, workflow_runs_filter?}`,
    `list_workflow_runs` ×1 → `deny` (mục dưới).
  - board-reader: `wit_query` ×2 `{action:"wiql", project, wiql}`, `wit_work_item` `get_batch` ×1
    `{action, ids, fields}`, `list_revisions` ×2 `{action, project, workItemId, top, skip}`, `list_comments` ×2
    `{action, project, workItemId, top}`.
  - cloud-reader: `azure-monitor` ×1 `{intent, command:"monitor_workspace_list", parameters:{subscription}}` → 401
    (mục dưới).
- Mock đang giả định: khớp.
- Đề xuất: không sửa mock.

## 2026-11-26 (lần 6) — code-reader gọi tool ngoài allowlist
- Thấy: code-reader gọi `github-list_workflow_runs` ×1. Tool này không có trên GitHub MCP (32 tool) và không có trong
  `GITHUB_READ`; model không thấy nó (smoke `--tools` ở trên). Model tự đoán tên từ `method` của `actions_list`.
- Thấy: `decide()` → `deny`, reason `Tool github-list_workflow_runs không có trong allowlist của code-reader`. Báo cáo
  hiện ở mục "Bị chặn". Model tự chuyển sang `actions_list` `method:"list_workflow_runs"` ×2, agent vẫn ok.
- Thấy: console ghi `↳ code-reader → builtin/github-list_workflow_runs` (tên server `builtin` cho tool không thuộc
  server nào).
- Mock đang giả định: model chỉ gọi tool có trong session.
- Đề xuất:
  - Task `code-reader` (`agents.ts`): ghi rõ "workflow run: dùng `actions_list` với `method: \"list_workflow_runs\"`
    (không có tool `list_workflow_runs` riêng)". Bớt một lượt model và mục "Bị chặn" giả.
  - Tuỳ chọn: scenario fixture có 1 lần `deny` tên tool không tồn tại, để kiểm mục "Bị chặn" với tên lạ.

## 2026-11-26 (lần 6) — azure (cloud-reader): 401, token `az` bị thu hồi
- Thấy: cloud-reader gọi đúng 1 lần `monitor_workspace_list`, lỗi tool:
  `MCP server 'azure': {"status":401,"message":"Azure credentials not found or unavailable. Please run 'az login' to authenticate, then try again. For the complete list of supported credentials, see: https://aka.ms/azmcp/auth. Details: AzureCl...`
  Model dừng, không thử lại. Không lỗi cờ / `unknown arguments` với `@azure/mcp@4.0.0-beta.10`.
- Thấy: nguyên nhân ở môi trường, không phải code. `az account get-access-token` (cùng `AZURE_CONFIG_DIR`) →
  `AADSTS50173` `invalid_grant`: grant cấp trước khi đổi mật khẩu, bị thu hồi. `az account show` vẫn ok (đọc profile
  cache), nên kiểm bằng `az account show` không đủ.
- Thấy: Azure MCP dùng `AZURE_CONFIG_DIR` (biến mức Machine); board-reader dùng `ADO_AZURE_CONFIG_DIR` (`.env`) và vẫn ok.
- Sửa ở Work: user chạy `az logout` rồi `az login` (tương tác) với đúng `AZURE_CONFIG_DIR`. Chưa chạy lại brief.
- Mock đang giả định: Azure MCP luôn xác thực được.
- Đề xuất:
  - Mock / scenario: thêm lỗi tool cloud-reader đúng chuỗi trên (`{"status":401,"message":"Azure credentials not found or unavailable...`).
  - Gợi ý trong `report.ts` (mục dưới) và `docs/WORK.md`: kiểm token bằng `az account get-access-token`, không phải
    `az account show`.

## 2026-11-26 (lần 6) — `report.ts`: lỗi tool không khớp HINT bị bỏ qua
- Thấy: 401 ở trên không khớp `HINTS`, nên `summarize()` bỏ qua: báo cáo ghi "7 mục, 0 lỗi, 0 cảnh báo", cloud-reader
  hiện ✓ (19.3s). Người đọc không biết nguồn Azure trống. Console có dòng `✗ cloud-reader: MCP server 'azure': ...`
  nhưng báo cáo HTML không có.
- Thấy: 2 item ở mục Azure của báo cáo có lẽ do comms-reader lấy từ mail cảnh báo (suy luận; audit không ghi agent
  sinh item). Thêm HINT `blocking` chỉ bỏ item của cloud-reader.
- Đề xuất:
  - `HINTS`: thêm `{ re: /"status":\s*401|Azure credentials not found|AADSTS50173|invalid_grant/, kind: "blocking",
    text: "Token az hết hạn/bị thu hồi: chạy az logout + az login (đúng AZURE_CONFIG_DIR); kiểm bằng az account get-access-token." }`.
  - Tuỳ chọn: lỗi tool không khớp HINT nào vẫn hiện dưới "Cảnh báo" (dạng `agent: lỗi`, cắt ngắn), để báo cáo không
    ghi 0 lỗi khi agent có lỗi tool. Test bằng scenario ở mục trên.

## 2026-11-26 — Playwright ở Work
- Thấy: `npx -y @playwright/mcp@0.0.86 install-browser ffmpeg` exit 0, tải FFmpeg v1013 (1.6 MiB) từ
  `cdn.playwright.dev`, không vướng proxy. Sau lệnh, `%LOCALAPPDATA%\ms-playwright` chỉ còn `ffmpeg-1013`,
  `winldd-1007` (thư mục browser cũ bị xoá; smoke dùng Chrome cài sẵn nên không ảnh hưởng).
- Thấy: `pnpm playwright-smoke` exit 0, 13.5s, Chrome mặc định (`PLAYWRIGHT_BROWSER` không đặt), 38 tool, mọi bước ok.
  `smoke.png` đúng trang brief mock (runtime mock, 0.00 / 120). Có `smoke.webm`, trace + 17 khung `traces/screencast/`.
- Thấy: `pnpm install` cảnh báo `Ignored build scripts: esbuild, koffi` (không ảnh hưởng test/smoke).
- Đề xuất: không sửa gì.

## 2026-11-26 — github (code-reader), `GITHUB_MCP_TOKEN` rỗng
- Thấy: `.env` đặt `GITHUB_MCP_TOKEN=` (khôi phục nguyên byte sau khi chạy), `pnpm smoke code-reader --tools`: exit 0,
  server `github` `pending → connected` (`configSource: "user"`), `toolCount: 32`, model thấy 15,
  `Tất cả trong allowlist.`, không lỗi, không `needs-auth`. Giống hệt lần có token. Dòng `auth:` báo
  `authType: "gh-cli"`.
- Thấy: khi token rỗng `agents.ts` không gửi header `Authorization`. Suy luận: Copilot CLI tự gắn xác thực của nó
  cho `api.githubcopilot.com/mcp/`. Chưa kiểm lời gọi tool khi token rỗng (tốn credit).
- Đề xuất: không cần `missingConfig` cho `GITHUB_MCP_TOKEN`. Tuỳ chọn: ghi trong `docs/WORK.md` là token không bắt buộc
  khi Copilot CLI đã đăng nhập; nếu muốn chắc, Work chạy 1 brief với token rỗng và so audit code-reader.

## 2026-11-26 (lần 7) — kiểm thay đổi Home (test + mock)
- Thấy: base `d33a9a0` (= `origin/main`). `pnpm install` exit 0, `pnpm typecheck` exit 0, `pnpm test` 33/33 (~8.1s).
- Thấy: `pnpm brief` runtime `mock` (thư mục report/log tạm, không ghi vào repo):
  - `brief-auth`: 1 mục, 3 lỗi, 0 cảnh báo, 4.20 credits. "Không lấy được": comms-reader (EULA), board-reader
    (`VS30063`), cloud-reader (401 + gợi ý mới `az logout` + `az login`, `az account get-access-token`). "Bị chặn" có
    `github-list_workflow_runs`.
  - `brief-ok`: 10 mục, 0 lỗi, 1 cảnh báo (403 workspace + gợi ý), 31.50 credits.
  - `brief-failures`: 0 mục, 4 lỗi.
- Thấy: console mock `brief-auth` in `✓ cloud-reader` ngay sau dòng `✗ cloud-reader: MCP server 'azure': {"status":401,...`
  (lỗi `blocking`). Báo cáo HTML đúng (cloud-reader ở "Không lấy được"); chỉ console gây hiểu nhầm.
- Đề xuất: `apps/cli/src/brief.ts` (dòng 41): agent có lỗi tool `blocking` (`isBlocking()`) thì không in `✓`, in ví dụ
  `⚠ <agent> (…s): không lấy được dữ liệu`. Tuỳ chọn.

## 2026-11-26 (lần 7) — brief runtime `copilot`
- Thấy: exit 0, 75.7s (tổng lệnh 77.3s), AI Credits 34.59 / 120 (lần 6: 26.88, lần 5: 40.06), 8 mục (3 cần xử lý).
  Báo cáo: 0 lỗi, không có "Không lấy được", 2 cảnh báo (mục dưới). board-reader 16.1s, code-reader 20.6s,
  cloud-reader 50.5s, comms-reader 74.7s.
- Thấy: audit 29 bản ghi, 27 `allow`, 2 `deny`, không tool ghi nào được `allow`, không `github-mcp-server-*`.
- Thấy: tham số thật (chỉ khoá):
  - comms-reader: `workiq-fetch` ×1, `workiq-ask` ×3.
  - code-reader: `get_me`, `list_pull_requests`, `pull_request_read` ×2, `actions_list` ×2
    `{method:"list_workflow_runs", owner, repo, perPage, workflow_runs_filter}`, 2 `deny` (mục dưới).
  - board-reader: `wit_query` ×2, `wit_work_item` ×3.
  - cloud-reader: `group_list` ×1, `group_resource_list` ×2, `azure-monitor` ×9 `{intent, command, parameters}`:
    `monitor_workspace_list` ×1, `monitor_table_list` ×2 (2 workspace khác nhau), `monitor_workspace_log_query` ×3
    (2 workspace, khoá `workspace, table, query, hours=24`), `monitor_activitylog_list` ×3 (3 resource, khoá
    `resource-group, resource-name, hours=24`). 1 subscription. **Không lỗi tool, hết 401** (sau `az logout` +
    `az login`, kiểm `az account get-access-token` ok trước khi chạy). Giống lần 5 (lần 5: log_query ×4, activitylog ×2).
- Mock đang giả định: khớp.
- Đề xuất: không sửa mock Azure.

## 2026-11-26 (lần 7) — code-reader vẫn đoán tên tool
- Thấy: task mới (`actions_list` + `method:"list_workflow_runs"`) bỏ được tên `github-list_workflow_runs`, nhưng model
  đoán 2 tên khác (lần 6: 1 lần):
  - `github-list_workflow_runs_placeholder`, args `{}`;
  - `github-list`, args `{method:"list_workflow_runs", owner, repo, perPage, workflow_runs_filter}` (đúng args của
    `actions_list`, sai tên tool).
- Thấy: cả 2 bị `deny` (reason `Tool <tên> không có trong allowlist của code-reader`), model tự sửa sang
  `github-actions_list` ×2, agent ok. code-reader 20.6s (lần 6: 20.4s), tốn ít.
- Mock đang giả định: tên đoán sai chỉ có `github-list_workflow_runs` (`brief-auth`).
- Đề xuất:
  - Gate (`packages/core/src/runtime/sdk.ts` / `security.ts`, chỉ đổi **nội dung reason**, không đổi quyết định): với tool
    không có trong allowlist, reason nêu tool đúng gần nhất hoặc danh sách tool cùng server, ví dụ
    `Tool github-list không có. Workflow run: dùng github-actions_list với method "list_workflow_runs".` Model đọc
    reason này (hook trả về cho model), sửa ngay ở lượt sau.
  - Hoặc chấp nhận: gate chặn đúng, chi phí ~1 lượt model. Không cần thêm vào allowlist.

## 2026-11-26 (lần 7) — `report.ts`: lời gọi bị chặn bị đếm thêm ở "Cảnh báo"
- Thấy: với lời gọi bị `deny`, runtime thật sinh `tool.completed` có `error`:
  `Denied by preToolUse hook: Tool <tên> không có trong allowlist của code-reader` (tiền tố do Copilot CLI thêm).
  Lỗi này không khớp `HINTS`, nên `summarize()` đưa vào "Cảnh báo" (nhánh lỗi không khớp HINT, Home thêm lần 6).
  Lời gọi đó đã có ở "Bị chặn" (`message` "Bị chặn: …"). Kết quả: báo cáo "2 cảnh báo" nhưng không có cảnh báo thật.
- Thấy: console in thêm 2 dòng `✗ code-reader: Denied by preToolUse hook: …` (như lỗi tool) cạnh dòng `⛔`.
- Mock đang giả định: `packages/core/src/runtime/mock.ts` (dòng ~53) sinh `tool.completed` `ok:false` **không có
  `error`** khi `deny`, nên mock không tái hiện được (mock `brief-auth`: 0 cảnh báo).
- Đề xuất:
  - Mock trước: `mock.ts` sinh `error: "Denied by preToolUse hook: " + reason` khi `deny`, cho khớp thật.
  - `summarize()`: bỏ lỗi bắt đầu bằng `Denied by preToolUse hook` khỏi `warnings`/`unknown` (đã có ở `blocked`).
    Test: `brief-auth` → 0 cảnh báo, 1 dòng "Bị chặn".
  - `apps/cli/src/brief.ts` (dòng 38): không in `✗` cho lỗi này (dòng `⛔` đã đủ).

## 2026-11-26 (lần 7) — gợi ý 403 workspace
- Thấy: HINT `InsufficientAccessError|Could not find workspace` (`report.ts`) vẫn ghi "kiểm tra `az account show`".
  Lần 6 cho thấy `az account show` đọc cache, không phát hiện token bị thu hồi.
- Đề xuất: đổi thành `az account get-access-token` cho khớp HINT 401 và `docs/WORK.md`. Tuỳ chọn.

## 2026-11-26 (lần 8) — kiểm thay đổi Home (test + mock)
- Thấy: base `f100b61` (= `origin/main`). `pnpm install` exit 0, `pnpm typecheck` exit 0, `pnpm test` 34/34.
- Thấy: `pnpm brief` runtime `mock` (báo cáo thật đã sao lưu trước, mock ghi đè `reports/brief-<ngày>.html`):
  - `brief-auth`: 1 mục, 3 lỗi, **0 cảnh báo**, 4 dòng "Đã chặn". Console: `⚠ … không lấy được dữ liệu` cho
    comms-reader, board-reader, cloud-reader; không còn dòng `✗ … Denied by preToolUse hook`.
  - `brief-ok`: 10 mục, 0 lỗi, 1 cảnh báo.
  - `brief-failures`: 0 mục, 4 lỗi, 0 cảnh báo.
  - Khớp số liệu Home ghi trong handoff-copilot.md §1.
- Thấy (nhỏ, chỉ mock): `brief-failures` in 2 dòng trạng thái cho cloud-reader: `✗ cloud-reader: Kết quả sai schema…`
  (`agent.failed`) rồi `⚠ cloud-reader (0.5s): không lấy được dữ liệu` (`agent.completed`). Báo cáo HTML đúng.
  Nguyên nhân: `packages/core/src/runtime/mock.ts` (dòng ~77) đổi `agent.result` sai schema thành `agent.failed` nhưng
  vẫn phát `agent.completed` của kịch bản. `runtime/sdk.ts` (dòng ~153–157) chỉ phát một trong hai.
- Đề xuất: tuỳ chọn, mock bỏ `agent.completed` của agent đã `agent.failed`, cho khớp `sdk.ts`. Không ảnh hưởng runtime thật.

## 2026-11-26 (lần 8) — brief runtime `copilot`
- Thấy: exit 0, 55.0s (tổng lệnh 56.7s), AI Credits 33.11 / 120 (lần 7: 34.59, lần 6: 26.88; trong khoảng ước tính
  27–40), 9 mục (2 cần xử lý). Báo cáo: 0 lỗi, không có "Không lấy được", **0 cảnh báo**, "Bị chặn" 1 dòng.
  code-reader 15.5s, board-reader 25.5s, cloud-reader 41.6s, comms-reader 53.9s.
- Thấy: console 4 agent `✓`, không `⚠`, không dòng `✗`, 1 dòng `⛔` (code-reader).
- Thấy: audit 26 bản ghi, 25 `allow`, 1 `deny`, không tool ghi nào được `allow`, không `github-mcp-server-*`.
  Reason `deny` trong audit vẫn ngắn (`Tool <tên> không có trong allowlist của code-reader`), không chứa `denyHint`.
  Báo cáo và console cũng không chứa `denyHint`.
- Thấy: tham số thật (chỉ khoá):
  - comms-reader: `workiq-ask` ×1, `workiq-fetch` ×1.
  - code-reader: `get_me`, `list_pull_requests`, `actions_list` ×1 `{method:"list_workflow_runs", …}`,
    `pull_request_read` ×2 (`method` `get_comments`, `get_review_comments`), 1 `deny` (mục dưới).
  - board-reader: `wit_query` ×2, `wit_work_item` ×5.
  - cloud-reader: `group_list` ×1, `group_resource_list` ×2, `azure-monitor` ×8 `{intent, parameters}`:
    `monitor_workspace_list` ×1, `monitor_table_list` ×2, `monitor_workspace_log_query` ×3
    (khoá `subscription, workspace, table, query, hours`), `monitor_activitylog_list` ×2
    (khoá `subscription, resource-group, resource-name, hours`). 2 workspace, 1 subscription. Không lỗi tool.
- Mock đang giả định: khớp.
- Đề xuất: không sửa mock.

## 2026-11-26 (lần 8) — kết quả mục A (đoán tên tool) và E (`deny` trong "Cảnh báo")
- Thấy (E): đã hết. "Cảnh báo" không còn dòng `Denied by preToolUse hook`; báo cáo 0 cảnh báo, lời gọi bị chặn chỉ ở
  "Bị chặn".
- Thấy (A): giảm còn 1 `deny` (lần 7: 2, lần 6: 1). Thứ tự gọi của code-reader: `get_me` → `list_pull_requests` →
  `github-list_list_workflow_runs_placeholder` (args `{}`, `deny`) → `github-actions_list`
  `method:"list_workflow_runs"` (`allow`) → `pull_request_read` ×2. Model sửa ngay ở lượt kế tiếp, không thử tên khác.
  code-reader 15.5s (lần 7: 20.6s).
- Thấy: task code-reader (`packages/core/src/agents.ts` dòng ~156–157) đã nêu `actions_list` + `method`. Model vẫn ghép
  tên từ giá trị `list_workflow_runs` thêm hậu tố `_placeholder`, args rỗng. Có thể là lời gọi giữ chỗ khi model gọi
  song song.
- Đề xuất: chấp nhận. Gate chặn đúng, chi phí ~1 lượt model, model tự sửa nhờ reason. Không thêm vào allowlist.
  Nếu muốn thử thêm: mock `brief-auth` thêm tên `github-list_list_workflow_runs_placeholder` (args `{}`) để test
  `denyHint` với tên dạng này. Tuỳ chọn.

## 2026-11-26 (lần 8) — tài liệu
- Thấy: tiêu đề `docs/handoff-copilot.md` ghi "lần 6", nội dung là bàn giao cho lần 8 (§3 bước 2 "lần 8").
- Đề xuất: đặt tiêu đề theo số lần chạy Work kế tiếp khi viết handoff mới.

## 2026-11-26 (lần 9) — cài đặt, test, `pnpm dashboard`
- Thấy: base `0f4b421` (= `origin/main`). `pnpm install` exit 0, `pnpm typecheck` exit 0, `pnpm test` 51/51 (~13s).
  handoff-copilot.md §1 ghi 39/39, §3 ghi 51: số đúng là 51.
- Thấy: ở Work, pnpm chạy qua `corepack pnpm` (không có `pnpm` trên PATH). `corepack pnpm dashboard` lỗi
  `'pnpm' is not recognized…` vì script `dashboard` (`package.json` dòng 17) gọi `pnpm` trần.
  Cách chạy được: `corepack pnpm --filter @agenthub/web build` rồi `corepack pnpm exec tsx apps/server/src/main.ts`
  với `AGENTHUB_RUNTIME=copilot`. Build in cảnh báo vô hại `"use client"` của `@xyflow`.
- Đề xuất: script `dashboard` không gọi `pnpm` trần, ví dụ `vite build` qua `pnpm -C apps/web exec`, hoặc
  `npm run`/`corepack pnpm`, hoặc một script `tsx` gọi build. Tuỳ chọn, Work vẫn chạy được bằng 2 lệnh trên.

## 2026-11-26 (lần 9) — dashboard: đăng nhập, sơ đồ, giao diện
- Thấy: tab Đăng nhập (`/api/auth`): github/code-reader, ado/board-reader, azure/cloud-reader `ok`;
  workiq/comms-reader `unknown` ("Chưa rõ", chỉ biết khi chạy). Không tốn credit.
- Thấy: sơ đồ 14 node, 16 cạnh: orchestrator, 4 reader + 4 server, 3 writer (comms-, board-, code-writer), qa +
  server playwright.
- Thấy: console trình duyệt sau khi tải lại: 0 lỗi, 0 cảnh báo. Rộng 600px và 800px: không tràn ngang
  (`scrollWidth` = `clientWidth`).
- Thấy: không ghi nhận nhấp nháy cạnh (không kiểm bằng mắt từng khung hình).
- Đề xuất: không.

## 2026-11-26 (lần 9) — "Check việc" từ dashboard (runtime `copilot`)
- Thấy: 52.8s, AI Credits 31.39 / 120 (lần 8: 33.11, 55.0s), 6 mục (3 cần xử lý): Azure DevOps 2, Outlook 1, Azure 3,
  GitHub 0, Teams 0. Báo cáo 0 lỗi, 0 cảnh báo, "Bị chặn" 1.
- Thấy: 4 agent bắt đầu cách nhau ≤2ms (song song). code-reader 18.9s (7 lời gọi), board-reader 23.6s (7),
  comms-reader 51.1s (2), cloud-reader 51.7s (11). Credit theo agent: code 5.74, board 9.35, comms 7.29, cloud 9.01.
- Thấy: audit 27 bản ghi, 26 `allow`, 1 `deny`, không tool ghi nào được `allow`. `deny` duy nhất:
  `github-list_workflow_runs_placeholder` (không có trong allowlist), code-reader tự sửa như lần 8 (mục A).
- Thấy (lỗi): comms-reader trả 1 mục `source: "outlook"` với `title` `""`, `summary` `""`, `suggestedAction` `""`,
  `link` null, `timestamp` null, `priority: "low"`, `actionRequired: false`. Dashboard và báo cáo hiện thẻ rỗng chỉ có
  "Thấp" + "Outlook". Có vẻ model dùng một mục rỗng thay cho "không có gì". Schema `BriefItem`
  (`packages/core/src/brief.ts` dòng 8–9) cho phép chuỗi rỗng.
- Mock đang giả định: mọi mục đều có `title`/`summary`.
- Đề xuất: (1) task comms-reader (hoặc luật chung cho reader) nói rõ "không có gì thì trả `items: []`";
  (2) orchestrator bỏ mục có `title` và `summary` đều rỗng, ghi 1 dòng cảnh báo; (3) thêm 1 mục rỗng vào một kịch bản
  mock để test. Không nên đổi schema sang `min(1)` vì sai schema làm cả agent `agent.failed`.

## 2026-11-26 (lần 9) — `list-tools --writers`
- Thấy: `pnpm list-tools --writers` sinh `docs/mcp-tools-writers.md` (runtime `copilot`). 3 server connected:
  workiq (comms-writer) 13 tool, ado (board-writer) 43 tool, github (code-writer) 49 tool.
- Thấy: đối chiếu `packages/core/src/agents.ts` dòng 240–244:
  - `COMMS_WRITE` `create_entity`, `COMMS_READ` `search_paths`, `get_schema`: có đủ.
  - `CODE_WRITE` `create_branch`, `create_pull_request`, `add_issue_comment`, `CODE_READ` `get_me`, `list_branches`:
    có đủ.
  - **`BOARD_WRITE` `wit_add_work_item_comment`, `wit_update_work_item`: không có trên server thật.** Tên thật:
    `ado-wit_work_item_comment_write` (mô tả: thêm hoặc sửa comment, theo `action`) và `ado-wit_work_item_write`
    (tạo hoặc sửa work item, theo `action`). Đọc work item: `ado-wit_work_item`. board-writer đang có `readTools: []`
    (dòng 280).
- Thấy: cột "Loại (đoán)" sai ở vài tool (chỉ hiển thị, không tool nào trong allowlist reader):
  `workiq-do_action`, `ado-wiki_upsert_page`, `ado-wit_work_item_attachment_link`, `github-request_copilot_review`
  đoán `read` nhưng là ghi/hành động; `ado-pipelines_run` đoán `write` nhưng mô tả là đọc.
- Mock đang giả định: `packages/mock-mcp/src/server.ts` (dòng ~159) và `fixtures/scenarios/act-board-writer.jsonl`
  (dòng 2) dùng `wit_add_work_item_comment`.
- Đề xuất: `BOARD_WRITE` đổi sang `wit_work_item_comment_write` (và `wit_work_item_write` nếu cần sửa trường);
  board-writer thêm `readTools` `wit_work_item`. Tuỳ chọn: gate chỉ cho `action` cụ thể (ví dụ không cho tạo work item
  mới), vì một tên tool gộp nhiều hành động. Cập nhật mock-mcp + fixture theo tên thật. Đây là thay đổi quyền, ghi
  rõ trong commit message.

## 2026-11-26 (lần 9) — giao việc từ dashboard (board-writer, chỉ Từ chối)
- Thấy: không có mục GitHub; mục Azure hiện "Chưa có agent ghi cho nguồn này". Giao việc cho mục Azure DevOps duy nhất
  có nút.
- Thấy: board-writer 8.4s, 1.505 credit, **0 lời gọi tool**, không có yêu cầu duyệt, 0 dòng audit. Event:
  `agent.started` → `agent.message` → `usage` → `action.result` (`summary` có chữ, `link` null) → `agent.completed`.
- Thấy: model trả lời là không có tool ghi ADO, chỉ có git, curl, gh. `runtime/sdk.ts` (dòng ~74, `sessionTools`)
  chỉ đưa tên `mcp:` vào `availableTools`, nên có lẽ model nói theo prompt môi trường mặc định của CLI.
- Thấy: Duyệt/Từ chối **chưa kiểm được** vì không có lời gọi ghi nào. Work không bấm Duyệt.
- Đề xuất: sửa tên `BOARD_WRITE` (mục trên), rồi Work chạy lại bước này. Xác nhận các tool built-in (shell, git, gh,
  curl) không được đưa vào session writer và `decide()` từ chối nếu model gọi.

## 2026-11-26 (lần 9) — `pnpm playwright-smoke`
- Thấy: exit 0, `Smoke Playwright: ok`. `reports/playwright-smoke/index.html` nhúng `smoke.png` (ảnh + link),
  `<video src="smoke.webm">` (163 KB), link trace `traces/trace-*.trace` (22 KB). Thêm `.network` (0 B), 22 jpeg
  screencast, 2 `page-*.yml`.
- Đề xuất: không.

## 2026-11-26 (lần 9) — Nghiệm thu (QA) từ dashboard
- Thấy: 29.8s, 6.49 credit, 14 lời gọi Playwright, đều `allow` (14 dòng audit `qa`), 0 chặn. 3/3 tiêu chí Đạt, có ảnh
  `ac-1.png`, `ac-2.png`, `ac-3.png`. Node qa "Có cảnh báo". Thư mục `reports/qa-<ngày>-<giờ>/` 49 file (`qa.files` 48,
  thiếu `index.html` vì ghi sau).
- Thấy: model gọi song song theo lượt: (`start_tracing`, `start_video`, `navigate`) → (`video_chapter` 1, `snapshot`)
  → (`take_screenshot` ac-1, `video_chapter` 2, `click`) → (`take_screenshot` ac-2, `video_chapter` 3,
  `take_screenshot` ac-3, `stop_video`, `stop_tracing`, `close`).
  - `browser_video_chapter` cuối lỗi `Target page, context or browser has been closed` (chạy cùng lượt `browser_close`).
  - Lớp phủ chapter dính vào ảnh: `ac-1.png` có lớp phủ "Tiêu chí 2" đang hiện; `ac-3.png` có lớp phủ "Tiêu chí 3",
    phần trên trang bị mờ.
  - Click một link `target=_blank` mở tab mới tới origin khác: `--allowed-origins` chặn, nhưng sinh thêm `qa-1.webm`
    (55 KB) bên cạnh `qa.webm` (1.2 MB).
- Thấy (lỗi): `index.html` nhúng `<video src="qa-1.webm">` thay vì `qa.webm`. `packages/core/src/qa.ts` dòng 136
  lấy file `.webm` đầu tiên theo thứ tự tên.
- Thấy (lỗi): thanh credit dashboard hiện `32.9 / 120` = brief 31.39 + giao việc 1.505, thiếu 6.49 của QA.
  `apps/web/src/state.ts` dòng 209 chỉ cộng `reader` và `writer`, không cộng `tester`.
- Thấy: `GET /qa/<lần>/` trả 200 với CSP chặt; đường dẫn
  `..` trả 404. `HEAD` trả 404 (chỉ định tuyến `GET`), nhỏ.
- Mock đang giả định: model gọi tuần tự, không mở tab mới, chỉ có một video.
- Đề xuất:
  1. Task qa (`qa.ts` dòng ~80–83): gọi từng tool một, không song song; chụp ảnh tiêu chí n trước `video_chapter`
     n+1 (hoặc sau khi lớp phủ tắt, ví dụ `duration` ngắn rồi `browser_wait_for`); `stop_video`, `stop_tracing`,
     `close` chỉ sau tiêu chí cuối; không click link `target=_blank`, kiểm `href` trong snapshot.
  2. `renderQaReport`: ưu tiên `qa.webm`, hoặc liệt kê mọi video.
  3. `state.ts`: cộng `sum("tester")` vào `usedAiCredits`.
  4. Tuỳ chọn: server trả `HEAD` cho `/qa/*`.
  5. Mock: thêm kịch bản qa có lời gọi lỗi và 2 file `.webm` để test mục 2.

## 2026-11-26 (lần 9) — tổng credit
- Thấy: brief 31.39 + giao việc 1.505 + QA 6.49 ≈ 39.39 AI Credits cho cả lần 9. Không có lần chạy lại.

## 2026-11-26 (lần 10) — cài đặt, test, `pnpm dashboard`
- Thấy: base `3a724d1` (= `origin/main`). `corepack pnpm typecheck` exit 0, `corepack pnpm test` 52/52.
- Thấy: `corepack pnpm dashboard` (runtime `copilot`) chạy thẳng: build `apps/web` (`apps/web/dist` ghi mới) rồi
  server lên `127.0.0.1:4317`. Hết lỗi `pnpm` trần của lần 9, không cần cách chạy vòng.
- Đề xuất: không.

## 2026-11-26 (lần 10) — `list-tools --writers`
- Thấy: sinh lại `docs/mcp-tools-writers.md` (runtime `copilot`). Dòng đầu `# MCP tools`, 3 mục, đều `connected`:
  `workiq` (comms-writer) 13 tool, `ado` (board-writer) 43, `github` (code-writer) 49. Có
  `ado-wit_work_item_comment_write`, `ado-wit_work_item_write`, `ado-wit_work_item`. Nội dung khác `handoff-claude.md`
  (lỗi chép nhầm của lần 9 không còn).
- Đề xuất: không.

## 2026-11-26 (lần 10) — "Check việc" từ dashboard (runtime `copilot`)
- Thấy: 61.8s, 31.11/120 AI Credits, 5 mục, 2 cần xử lý, 0 nguồn lỗi, 0 cảnh báo, "Đã chặn" 1.
- Thấy theo agent:

  | Agent | Thời gian | Credit | Lời gọi tool |
  |---|---|---|---|
  | code-reader | 17.7s | 6.5 | 7 |
  | board-reader | 23.7s | 9.6 | 8 |
  | cloud-reader | 46.4s | 9.1 | 11 |
  | comms-reader | 58.8s | 5.9 | 2 |

- Thấy: audit 28 dòng mới, 27 `allow`, 1 `deny`, không `ask`/`reject`, không tool ghi nào được gọi. Tool:
  - board: `ado-wit_query` ×2, `ado-wit_work_item` ×6;
  - cloud: `azure-group_list` ×1, `azure-group_resource_list` ×2, `azure-monitor` ×8;
  - code: `github-actions_list` ×2, `github-get_me` ×1, `github-list_pull_requests` ×1,
    `github-pull_request_read` ×2, `github-list_workflow_runs_placeholder` ×1 (`deny`);
  - comms: `workiq-ask` ×1, `workiq-fetch` ×1.
- Thấy: `deny` là tên đoán `github-list_workflow_runs_placeholder` ("không có trong allowlist của code-reader"). Lần 8, 9,
  10 đều có đúng 1 lần, code-reader tự chuyển sang `github-actions_list` dù task đã có gợi ý (`agents.ts` dòng ~166).
- Mock đang giả định: không có lời gọi đoán tên.
- Đề xuất: ưu tiên thấp, xem handoff-claude §3 mục 3.

## 2026-11-26 (lần 10) — mục rỗng
- Thấy: comms-reader trả 0 mục, Chi tiết có dòng "Bỏ 1 mục rỗng". Báo cáo không còn thẻ rỗng. Sửa của lần 9 đạt.
- Đề xuất: không.

## 2026-11-26 (lần 10) — giao việc board-writer: bị chặn vì không có mục để giao
- Thấy: 2 mục cần xử lý đều nguồn Azure, cả hai hiện "Chưa có agent ghi cho nguồn này.". Báo cáo có mục Azure DevOps
  nhưng đều `actionRequired: false`. Tab Việc cần làm (`apps/web/src/App.tsx` dòng 420) chỉ lấy mục `actionRequired`,
  nên không có nút Giao việc nào.
- Thấy: Work không gọi thẳng `POST /api/act` (mọi bước phải đi qua UI như người dùng). Bước giao việc và Từ chối chưa
  kiểm được lần thứ hai (lần 9: tên tool sai; lần 10: không có mục).
- Thấy: server không lọc `actionRequired` (`Hub.act` trong `apps/server/src/server.ts` dòng 110–121 chỉ kiểm writer,
  schema `BriefItem`, `instruction`). Chỉ UI lọc.
- Mock đang giả định: luôn có mục ADO `actionRequired: true` để giao.
- Đề xuất: xem handoff-claude §3 mục 1. Tab Việc cần làm cho giao việc cả mục không `actionRequired` nếu nguồn có
  writer.

## 2026-11-26 (lần 10) — Từ chối: kết quả chưa hiện đủ trên UI (đọc code, chưa chạy thật)
- Yêu cầu người dùng: mọi trạng thái, lý do và kết quả (kể cả Từ chối) phải xem được trên UI.
- Thấy (đọc code):
  - Event `approval.resolved` (`packages/core/src/events.ts` dòng 19) chỉ có `{id, decision}`, không có lý do.
    `Approval` (`apps/web/src/state.ts` dòng 81–88) không lưu lý do, cũng không lưu giờ xử lý.
  - Mục "Đã xử lý" ở tab Duyệt (`App.tsx` dòng 365–371) chỉ hiện `✗ Từ chối: <agent> → <tool>`. Không có lý do,
    tham số hay giờ.
  - Kết quả writer ở tab Việc cần làm (`App.tsx` dòng 471) chỉ hiện khi `snap.mode === "act"` và `open === i`, tức là
    form của mục đó đang mở. Đóng form là mất. Chỉ hiện `action.summary`, không hiện trạng thái (đang soạn, chờ duyệt,
    lỗi).
  - Gate (`packages/core/src/runtime/sdk.ts` dòng 176–200) đã ghi audit `ask` rồi `reject` với `reason` = lý do, và trả
    `deny` cho model. UI không có chỗ xem. Không có dòng nào nói rõ "không có gì được gửi".
- Mock đang giả định: như SDK (`mock.ts` dòng 59–67), cũng không đưa lý do vào event.
- Đề xuất: xem handoff-claude §3 mục 2.

## 2026-11-26 (lần 10) — nghiệm thu (QA)
- Thấy: chưa chạy lần này (dừng sau bước giao việc bị chặn). Chuyển sang lần 11.

## 2026-11-26 (lần 10) — tổng credit
- Thấy: chỉ có check việc, 31.11 AI Credits. Không giao việc, không QA.
