# Bàn giao Work → Home (2026-11-23)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md), [mcp-tools.md](mcp-tools.md),
> [step0-results.md](step0-results.md).

## 1. Trạng thái

- Base `a3f2b77` (= `origin/main`). Mọi thay đổi ở mục 2 **chưa commit**; user sẽ commit rồi pull ở Home.
- Lúc bàn giao: `pnpm typecheck` xanh, `pnpm test` 15/15 xanh (runtime mock).
- Step 0 (runtime `copilot`):

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | connected, tool đọc chạy qua gate |
| ADO Remote MCP (`board-reader`) | connected qua OAuth (`mcpAuth`), `core_list_projects` chạy qua gate. Chưa thử truy vấn work item 24h |
| Work IQ (`comms-reader`) | connected, nhưng mọi tool lỗi cho tới khi user chấp nhận EULA |
| Azure MCP (`cloud-reader`) | chưa chạy, `readTools` vẫn là `"*"` |
| Playwright MCP | chưa chạy |
| `pnpm list-tools` | ok cho workiq/ado/github → `docs/mcp-tools.md` |
| `pnpm brief` với runtime thật | chưa chạy |

## 2. Thay đổi chưa commit

| File | Nội dung |
|---|---|
| `packages/core/src/runtime/sdk.ts` | `ENTRA_MCP` (origin → scope + tên biến env của profile `az`). `mcpAuth` (`onMcpAuthRequest`): lấy token qua `az account get-access-token`, origin lạ → `cancelled`. `waitForMcp()`: chờ server hết `pending`/`needs-auth` (tối đa 60s), gọi trước `sendAndWait` |
| `packages/core/src/agents.ts` | `readTools` tường minh: `WORKIQ_READ`, `ADO_READ`, `GITHUB_READ`. `WORKIQ_MOCK_READ` là tạm cho mock. `cloud-reader` vẫn `"*"` |
| `packages/core/test/security.test.ts` | Tool built-in `github-mcp-server-*` và tool ghi/đổi trạng thái bị `deny`; `mcpAuth` trả `cancelled` cho origin lạ |
| `scripts/sdk-smoke.ts`, `scripts/list-tools.ts` | Dùng `mcpAuth` (smoke dùng thêm `waitForMcp`) |
| `.env.example` | `ADO_AZURE_CONFIG_DIR` (tuỳ chọn, đường dẫn tuyệt đối) |
| `fixtures/scenarios/brief-*.jsonl` | `wit_my_work_items` → `wit_query` |
| `docs/mcp-tools.md` | Tên tool thật: workiq 13, ado 26, github 32; cột phân loại đã sửa tay (chạy lại `pnpm list-tools` sẽ ghi đè) |
| `docs/step0-results.md`, `docs/work-feedback.md`, `docs/WORK.md`, `PLAN.md` | Kết quả Step 0, khác biệt mock/thật, hướng dẫn auth ADO hai profile `az` |

## 3. Việc cho Home (theo thứ tự)

> **2026-11-24: Home đã làm xong 1–8** (commit sau `213fdce`). Riêng phần "mở rộng `list-tools` để in
> schema" ở mục 4: SDK không trả input schema (`McpTools` chỉ có `name`, `description`, `ui`), nên thay
> bằng cách đọc `args` trong audit log ở Work (docs/WORK.md mục 4).

Theo CLAUDE.md: sửa `packages/mock-mcp` + `fixtures/` trước, rồi mới sửa code.

1. **mock-mcp workiq → tên thật.** Thay `mail_list_unread`/`teams_list_unread`/`mail_send` bằng
   `retrieve`, `ask`, `fetch`, `search_paths`, `get_schema` (đọc, `readOnlyHint`) và ít nhất một tool ghi
   thật (`do_action` hoặc `create_entity`) để test gate. Input schema thật chưa có (xem mục 4): đoán tối
   thiểu, đánh dấu `ponytail`. Sửa `fixtures/data/workiq.json` và `fixtures/scenarios/*.jsonl` cho khớp.
   Sau đó xoá `WORKIQ_MOCK_READ`, dùng `WORKIQ_READ` cho mọi runtime.
2. **mock-mcp ado (mới).** `board-reader` hiện luôn trỏ `https://mcp.dev.azure.com/<org>`, kể cả runtime
   `byok`, và mock-mcp chưa có server `ado`. Thêm server `ado` với tool dạng gộp có tham số `action` (enum),
   khớp `ADO_READ`: `wit_query` (`get`, `get_results`), `wit_work_item`, `wit_backlog`, `work`,
   `search_workitem`, `core_list_projects`, `core_list_project_teams`, cộng một tool ghi giả để test gate.
   Thêm `fixtures/data/ado.json` (dữ liệu tự tạo). Trong `agents.ts`, `board-reader` dùng
   `mockServer(cfg, "ado")` khi không phải `copilot` (giống workiq/azure).
3. **Fixture lỗi** (thêm vào `brief-failures.jsonl` hoặc scenario mới), rồi kiểm tra `report.ts` hiển thị
   rõ lý do:
   - workiq EULA: server connected, tool call fail, nội dung là thông báo EULA. Báo cáo nên gợi ý user
     tự chạy `npx -y @microsoft/workiq accept-eula` (agent không được gọi `accept_eula`).
   - ado `VS30063`: OAuth báo `outcome:"token"`, server connected, nhưng tool call đầu tiên fail với
     `VS30063`. Báo cáo nên gợi ý kiểm tra tài khoản `az` / `ADO_AZURE_CONFIG_DIR`.
4. **Built-in `github-mcp-server`.** Runtime tự thêm server này vào mọi session. Unit test gate đã có.
   Tuỳ chọn: thêm event trong scenario mock (agent khác `code-reader` thử gọi `github-mcp-server-get_me`)
   để kiểm tra e2e bị chặn và hiện trong báo cáo.
5. **Test cho `waitForMcp`.** Chưa có. Dùng session giả (`rpc.mcp.list` trả `pending` → `needs-auth` →
   `connected`), kiểm tra dừng đúng lúc và dừng khi hết `ms`. Cân nhắc phát event cảnh báo khi hết hạn mà
   server vẫn đang kết nối (hiện tại im lặng chạy tiếp).
6. **Cảnh báo cấu hình ADO auth (tuỳ chọn).** `ADO_AZURE_CONFIG_DIR` thiếu hoặc là đường dẫn tương đối →
   lặng lẽ dùng profile `az` mặc định → `VS30063` ở tool call. Có thể kiểm tra `path.isAbsolute` và thư
   mục tồn tại khi biến được đặt. Không in token.
7. **`GITHUB_REPOS` dạng URL.** `config.ts` tách theo `,` và giả định `owner/repo`; ở Work giá trị được nhập
   dạng URL đầy đủ. Chuẩn hoá trong `loadConfig` (bỏ tiền tố `https://github.com/`, đuôi `.git`, `/` cuối)
   kèm test, và ghi rõ định dạng trong `.env.example`.
8. Sau mỗi bước: `pnpm typecheck` + `pnpm test` xanh với `AGENTHUB_RUNTIME=mock`; `pnpm brief` (mock) mở
   được báo cáo. Cập nhật checklist `PLAN.md`.

## 4. Việc còn lại ở Work

Đánh dấu `[Work]` trong `PLAN.md` nếu chưa có.

- ADO: chạy kịch bản "work item giao cho tôi thay đổi trong 24h"; ghi tool + `action` model đã dùng vào
  `docs/work-feedback.md`.
- Ghi **input schema** (tên tham số, enum `action`) của các tool trong allowlist vào `docs/mcp-tools.md`
  để mock khớp thật. Home có thể chuẩn bị trước: mở rộng `scripts/list-tools.ts` để in schema, sau khi
  kiểm tra trong `node_modules/@github/copilot-sdk/dist/types.d.ts` rằng `rpc.mcp.listTools` có trả schema.
- Work IQ: user tự chấp nhận EULA, rồi thử lại tóm tắt mail/Teams.
- Azure MCP: đặt `AZURE_SUBSCRIPTION`/`AZURE_LOG_WORKSPACE`, chạy `pnpm list-tools`, thay `readTools: "*"`
  của `cloud-reader` bằng danh sách cụ thể. `cloud-reader` dùng profile `az` mặc định.
- Playwright MCP: chưa thử.
- `pnpm brief` với `AGENTHUB_RUNTIME=copilot`.

## 5. Ràng buộc

- Không có dữ liệu công ty trong repo (tên org/project/tenant/tài khoản, nội dung mail/work item). Fixture
  là dữ liệu tự tạo.
- Không dùng `approveAll`; mọi quyết định tool đi qua `decide()` trong `packages/core/src/security.ts`.
- Không thêm tool ghi vào agent `kind: "reader"`. Thay đổi quyền phải ghi rõ trong commit message.
- Giữ `readTools` tường minh, không quay lại `"*"` (heuristic `looksLikeWrite` đoán sai, xem
  `docs/work-feedback.md`).
- `mcpAuth` chỉ cấp token cho origin trong `ENTRA_MCP`. Thêm server mới thì thêm đúng origin + scope, không
  dùng scope rộng.
- Không commit `.env`, `logs/`, `reports/`, token.
