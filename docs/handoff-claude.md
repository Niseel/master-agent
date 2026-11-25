# Bàn giao Work → Home (2026-11-25, lần 3 + 4 + chẩn đoán Azure MCP)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục "2026-11-25 (lần 3)", "(lần 4)"
> và "chẩn đoán workspace thứ hai"), [mcp-tools.md](mcp-tools.md), [step0-results.md](step0-results.md) (dòng 6, 9).
> Bàn giao trước: 2026-11-23 (Home xong mục 1–8, commit `d309405`); 2026-11-25 lần 2 (Home xong mục 1–7,
> commit `943360a`).

## 1. Trạng thái

- **Dùng được:** `pnpm brief` runtime `copilot` chạy ổn ở Work (lần 4: 4/4 agent ok, ~39 AI Credits, chỉ tool đọc).
  Còn 1 điểm chưa xác nhận qua agent: workspace thứ hai (đã sửa nguyên nhân, xem dưới, chưa chạy brief lại).
- Base `943360a` (= `origin/main`). Work đã pull, `pnpm install`. Sau thay đổi của Work: `pnpm typecheck` sạch,
  `pnpm test` 27/27 xanh.
- **Nguyên nhân 403/404 ở workspace thứ hai (đã tìm ra):** không phải subscription khác (hai workspace cùng
  subscription, khác resource group; tham số model gửi đúng). `@azure/mcp` (4.0.0-beta.10) dùng chuỗi
  DefaultAzureCredential và chọn một danh tính khác tài khoản `az login`; danh tính đó không thấy workspace thứ
  hai. Kiểm trực tiếp (không qua model): mặc định `workspace list` thiếu workspace đó và query trả 404; với env
  `AZURE_TOKEN_CREDENTIALS=AzureCliCredential` thì thấy đủ và query trả 200.
- Copilot CLI **gộp** `MCPStdioServerConfig.env` với env kế thừa (kiểm bằng MCP server giả, không tốn credit), nên
  chỉ cần khai báo biến mới trong `env`.
- `pnpm brief` runtime `copilot` lần 3 (sau task mới của Home): 4/4 agent ok, 8 mục, 77.4s,
  39.25/120 AI Credits. Audit 27 bản ghi, tất cả tool đọc `allow`, không `deny`, không tool ghi.
- So với lần 2:
  - `cloud-reader`: `monitor` 8 lần (trước 15), 47.6s (trước ~59s). Hết `unknown arguments` /
    `not available`. Còn 2× `BadArgumentError` (`SYN0002`, KQL dùng `last` làm tên cột), 1× 403
    `InsufficientAccessError` (workspace thứ hai, do credential, xem trên), không gọi `monitor_activitylog_list`.
  - `board-reader`: hết lỗi WIQL `«SELECT»`; dùng `@Me` + `@Follows`, giữ điều kiện "đang theo dõi".
  - Báo cáo: không item nào nhắc lại lỗi tool.
- `pnpm brief` runtime `copilot` lần 4 (sau khi Work sửa task `cloud-reader`): 4/4 agent ok, 7 mục, 46.5s,
  39.29/120 AI Credits. Audit 23 bản ghi, tất cả `allow`, không `deny`, không tool ghi.
  - `cloud-reader` 45.5s: hết `SYN0002` (dùng `lastSeen`), có `monitor_activitylog_list` ×2, không gọi `learn`.
    Workspace thứ hai trả 404 `Could not find workspace with name ...` (lần 3: 403), không thử lại.
  - `board-reader` 22.0s (lần 3: 76.4s): dùng thêm `wit_work_item` `action:"list_comments"` (mock chưa có).
- Step 0 (runtime `copilot`) đã xong, trừ Playwright. Bảng dưới là trạng thái từ lần 2, cập nhật theo lần 3:

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. Tham số thật của `actions_list`, `pull_request_read`, `search_pull_requests` trong work-feedback |
| ADO Remote MCP (`board-reader`) | ok. `wit_query` `action:"wiql"`; `wit_work_item` `action:"get_batch"`/`"list_revisions"`. Lần 3: hết lỗi WIQL subquery |
| Work IQ (`comms-reader`) | ok sau khi user tự chấp nhận EULA (không cần admin consent). `fetch` nhận `{entityUrls: string[]}` |
| Azure MCP (`cloud-reader`) | ok. 4 tool, allowlist `AZURE_READ`. Lần 4: 10 lần gọi, 45.5s, có activity log. Lần 3: 8 lần gọi `monitor`, 47.6s (lần 2: 15 lần, ~59s). Nay chạy với `AzureCliCredential` |
| Playwright MCP | chưa chạy |
| `pnpm list-tools` | ok cả 4 server → `docs/mcp-tools.md` |
| `pnpm brief` runtime `copilot` | Lần 4: 4/4 agent ok, 46.5s, 39.29/120. Lần 3: 77.4s, 39.25/120. Lần 2: 60.5s, 44.29/120. Không tool ghi nào được allow |

## 2. Thay đổi trong commit này (Work)

Không đổi tool: `readTools`, `security.ts`, cờ `--read-only` giữ nguyên. **Có đổi danh tính:** server `azure` của
`cloud-reader` (runtime thật) đăng nhập bằng tài khoản `az login` (`AzureCliCredential`) thay vì chuỗi
DefaultAzureCredential. Commit message ghi rõ điều này.

| File | Nội dung |
|---|---|
| `packages/core/src/agents.ts` (server `azure`) | Thêm `env: { AZURE_TOKEN_CREDENTIALS: "AzureCliCredential" }` cho server thật. Mock không đổi |
| `packages/core/src/report.ts` | Hint `blocking` cho `InsufficientAccessError` / `Could not find workspace`: kiểm tra `az account show` và quyền Reader trên workspace |
| `packages/core/src/agents.ts` | Chỉ chuỗi `task` và `missingConfig` của `cloud-reader`: không dùng từ khoá KQL (ví dụ `last`) làm tên cột, viết `lastSeen`; `hours` đã lọc thời gian; luôn gọi `monitor_activitylog_list` kể cả khi log query lỗi; 403 `InsufficientAccessError` là thiếu quyền, không thử lại (đã kiểm chứng bằng brief thật lần 4). Task liệt kê từng workspace kèm subscription của nó; `missingConfig` báo khi số subscription (>1) khác số workspace |
| `packages/core/src/config.ts` | `azure: { subscriptions: string[]; workspaces: string[] }` (trước: 2 chuỗi). Env tách theo dấu phẩy, bỏ khoảng trắng/rỗng. Ghép theo thứ tự; 1 subscription dùng cho mọi workspace |
| `agenthub.config.ts`, `.env.example`, `docs/WORK.md` | Theo shape config mới; ghi cách đặt nhiều giá trị |
| `packages/core/test/security.test.ts`, `brief.test.ts` | Test tách env, ghép subscription/workspace, `missingConfig` khi lệch số lượng; hint `.env` cho thông điệp mới; server `azure` có `AZURE_TOKEN_CREDENTIALS`; hint 403/404 workspace |
| `docs/step0-results.md` | Dòng 9: kết quả lần 3 và lần 4. Dòng 6: ghi chú credential |
| `docs/work-feedback.md` | 4 mục "2026-11-25 (lần 3)" và "(lần 4)": azure, ado. Mục "chẩn đoán workspace thứ hai"; kết luận cũ ở lần 4 đánh dấu sai |
| `PLAN.md` | Tick 2 dòng `[Work]` chạy lại brief; thêm dòng `[Home]` lần 3, lần 4; `[x]` nhiều subscription; `[x]` nguyên nhân credential; `[Work]` chạy lại brief, ghim phiên bản `@azure/mcp` (bỏ dòng "subscription thứ hai" vì sai) |
| `docs/handoff-claude.md` | File này |

## 3. Việc cho Home (theo thứ tự)

Theo CLAUDE.md: sửa `packages/mock-mcp` + `fixtures/` trước, rồi mới sửa code. Chi tiết và thông điệp lỗi
nguyên văn: [work-feedback.md](work-feedback.md), các mục "2026-11-25 (lần 3)", "(lần 4)" và "chẩn đoán
workspace thứ hai".

1. **Mock azure: lỗi cú pháp KQL.** `monitor_workspace_log_query` trả `BadArgumentError` kèm lỗi con
   `SyntaxError` `SYN0002` `Query could not be parsed at 'last'` khi query dùng `last` làm tên cột
   (ví dụ `last=max(TimeGenerated)`). Thêm test trong `packages/mock-mcp/test/server.test.ts`.
2. **Mock azure: 403 và 404.** Thêm workspace trong `fixtures/data/azure.json` mà mọi log query trả
   `{"status":403,"message":"The provided credentials have insufficient access to perform the requested operation\r\nSt...`
   kèm `ErrorCode: InsufficientAccessError`, và một workspace trả
   `{"status":404,"message":"Could not find workspace with name <name>. To mitigate this issue, please ref...`
   (lần 4, cùng workspace thật đã trả 403 ở lần 3). Thêm scenario nếu cần. Thật: cả hai lỗi do danh tính
   không thấy workspace (không phải do tham số), nên mock trả theo tên workspace là đủ.
3. **`report.ts`: đã làm ở Work** (hint `blocking` cho `InsufficientAccessError` / `Could not find workspace`, test
   trong `brief.test.ts`). Home: kiểm tra end-to-end với scenario mock ở mục 2 (hint hiện trong báo cáo khi
   agent vẫn ok nhờ workspace khác). Tuỳ chọn: hint cho `SYN0002` (từ khoá KQL làm tên cột).
4. **Credential Azure MCP: đã làm ở Work.** Server `azure` thật có `env.AZURE_TOKEN_CREDENTIALS`. Home: đảm bảo
   mock/runtime mock không phụ thuộc `env` (hiện `mockServer()` không có `env`, không cần đổi). Config nhiều
   subscription vẫn giữ (tuỳ chọn cho trường hợp workspace ở subscription khác); không cần subscription giả thứ hai.
5. **Activity log.** Lần 3 model không gọi `monitor_activitylog_list`; lần 4 (task mới) gọi ×2. Nếu mock
   scenario có thể kiểm tra, thêm test brief mock có sự kiện gọi lệnh này.
6. **Mock ado (nhỏ).** `list_revisions` nhận thêm `skip`, `expand` tuỳ chọn; `wit_work_item` thêm
   `action:"list_comments"` `{workItemId, project, top?}` (cả hai thấy trong audit thật).
7. Sau mỗi bước: `pnpm typecheck` + `pnpm test` xanh với `AGENTHUB_RUNTIME=mock`; `pnpm brief` (mock) mở
   được báo cáo. Tick dòng `[Home]` "lần 3" và "lần 4" trong `PLAN.md`; viết `docs/handoff-copilot.md` mới.

## 4. Việc còn lại ở Work

- Chạy lại `pnpm brief` runtime `copilot` (lần 5, ~39 AI Credits) để xác nhận workspace thứ hai đọc được qua
  agent. `.env` giữ nguyên (1 subscription).
- Tuỳ chọn: ghim phiên bản `@azure/mcp` (đang `@latest` = bản beta).
- User xoay vòng `GITHUB_MCP_TOKEN` (đã lộ trong phiên làm việc).
- Playwright MCP: chưa thử.
- User đối chiếu AI Credits (lần 2: 44.29, lần 3: 39.25, lần 4: 39.29) với trang billing công ty.
- Tuỳ chọn: chạy `pnpm brief` với `GITHUB_MCP_TOKEN` rỗng (chưa thử).

## 5. Ràng buộc

- Không có dữ liệu công ty trong repo (tên org/project/tenant/tài khoản, nội dung mail/work item). Fixture
  là dữ liệu tự tạo.
- Không dùng `approveAll`; mọi quyết định tool đi qua `decide()` trong `packages/core/src/security.ts`.
- Không thêm tool ghi vào agent `kind: "reader"`. Thay đổi quyền phải ghi rõ trong commit message.
- Giữ `readTools` tường minh, không quay lại `"*"` (heuristic `looksLikeWrite` đoán sai, xem
  `docs/work-feedback.md`).
- Azure MCP phải giữ `--read-only`: gate chỉ thấy tên `azure-monitor`, không thấy lệnh con trong `args.command`.
- Azure MCP giữ `AZURE_TOKEN_CREDENTIALS=AzureCliCredential`: bỏ đi thì credential mặc định có thể đổi danh tính.
- `mcpAuth` chỉ cấp token cho origin trong `ENTRA_MCP`. Thêm server mới thì thêm đúng origin + scope, không
  dùng scope rộng.
- Không commit `.env`, `logs/`, `reports/`, token.
