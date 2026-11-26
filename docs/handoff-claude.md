# Bàn giao Work → Home (2026-11-25, lần 5)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục "2026-11-25 (lần 5)"),
> [step0-results.md](step0-results.md) (dòng 5, 9).
> Bàn giao trước: 2026-11-23 (Home xong mục 1–8, commit `d309405`); 2026-11-25 lần 2 (Home xong mục 1–7,
> commit `943360a`); 2026-11-25 lần 3 + 4 (Home xong mục 1–7, xem [handoff-copilot.md](handoff-copilot.md)).

## 1. Trạng thái

> **Home 2026-11-26:** xong §3 mục 1–5 và 7 (mục 6 không cần vì mục 1 làm được). Playwright: ảnh + trace ok, video
> chờ FFmpeg. Từ nay Work chỉ chạy và kiểm chứng, không sửa code (AGENTS.md). Việc Work tiếp theo:
> [handoff-copilot.md](handoff-copilot.md).

- Base `7ac413b` (= `origin/main`). Work đã pull, `pnpm install`. `pnpm typecheck` sạch, `pnpm test` 27/27 xanh.
- **Workspace thứ hai đọc được qua agent.** Sửa `AzureCliCredential` có tác dụng: `cloud-reader` gọi
  `monitor_table_list` + `monitor_workspace_log_query` trên workspace đó, không lỗi (lần 4: 404, lần 3: 403).
- `pnpm brief` runtime `copilot` lần 5: 4/4 agent ok, 5 mục, 0 cảnh báo, 49.5s (tổng lệnh 51.7s),
  40.06/120 AI Credits. code-reader 21.2s, board-reader 21.8s, comms-reader 31.2s, cloud-reader 48.0s.
- Audit lần 5: 31 bản ghi, 30 `allow`, 1 `deny`, không tool ghi nào được `allow`. `deny` duy nhất: comms-reader gọi
  tool built-in `github-mcp-server-get_file_contents`. Gate chặn đúng, báo cáo hiện ở mục "Đã chặn", nhưng tốn một
  lượt model (xem §3 mục 1).
- Báo cáo lần 5 không có mục "Cảnh báo" (không còn 403/404), nên đường cảnh báo của Home mới chỉ kiểm bằng mock.
- `GITHUB_MCP_TOKEN` đã xoay vòng (token cũ đã thu hồi). Kiểm không tốn credit: GitHub MCP trả 32 tool, đủ allowlist.
- Step 0 (runtime `copilot`) đã xong, trừ Playwright.

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. Token mới, 32 tool. Tham số thật của `actions_list`, `pull_request_read`, `search_pull_requests` trong work-feedback |
| ADO Remote MCP (`board-reader`) | ok. Lần 5: `wit_query` (`@Me`, `@Follows`), `get_batch`, `list_comments`, `list_revisions`, không lỗi |
| Work IQ (`comms-reader`) | ok. `fetch` `{entityUrls}`; `retrieve` `{query, capabilities}` |
| Azure MCP (`cloud-reader`) | ok. Lần 5: 12 lần gọi, 48.0s, đọc được cả hai workspace, có activity log. Chạy với `AzureCliCredential` |
| Playwright MCP | chưa chạy |
| `pnpm list-tools` | ok cả 4 server → `docs/mcp-tools.md` |
| `pnpm brief` runtime `copilot` | Lần 5: 49.5s, 40.06/120. Lần 4: 46.5s, 39.29. Lần 3: 77.4s, 39.25. Lần 2: 60.5s, 44.29. Không tool ghi nào được allow |

## 2. Thay đổi trong commit này (Work)

Chỉ đổi tài liệu. Không đổi code, `readTools`, `security.ts`, quyền hay danh tính.

| File | Nội dung |
|---|---|
| `docs/step0-results.md` | Dòng 9: kết quả lần 5. Dòng 5: xoay vòng token |
| `docs/work-feedback.md` | Các mục "2026-11-25 (lần 5)": azure, comms-reader + built-in `github-mcp-server`, ado + code-reader, công cụ ở Work |
| `PLAN.md` | Tick `[Work]` chạy lại brief (lần 5); thêm `[Home]` lần 5 (`availableTools`, ghim `@azure/mcp`, Playwright smoke) và `[Work]` kiểm lại sau khi Home sửa |
| `docs/handoff-claude.md` | File này |

## 3. Việc cho Home (theo thứ tự)

Theo CLAUDE.md: sửa `packages/mock-mcp` + `fixtures/` trước, rồi mới sửa code. Mỗi mục một commit. Chi tiết:
[work-feedback.md](work-feedback.md), các mục "2026-11-25 (lần 5)". Work chỉ kiểm lại (§4), nên mọi mục dưới đây
phải chạy được end-to-end với `mock` (hoặc `byok`) ở Home.

1. **Ẩn tool built-in `github-mcp-server-*` khỏi session.** (`packages/core/src/runtime/sdk.ts`, `createSession`,
   đang `availableTools: ["mcp:*"]`.)
   - Vì sao: server built-in là MCP server (`configSource: "builtin"`) nên khớp `mcp:*`. Model thấy 6 tool đó trong
     mọi session (lần 5: comms-reader gọi 1 lần; lần 2: cloud-reader 2 lần). Gate `deny` đúng, nhưng mỗi lần tốn một
     lượt model.
   - Đã đối chiếu ở Work (`toolSet.d.ts`, SDK 1.0.34): `ToolSet.addMcp()` nhận "canonical wire name" dạng
     `<serverKey>-<tool>` (ví dụ trong JSDoc: `github-list_issues`), tức đúng dạng phần tử `readTools`.
     `excludedTools` luôn thắng `availableTools`.
   - Làm: khi `readTools` là danh sách, đặt ``availableTools: a.readTools.map((t) => `mcp:${t}`)`` (hoặc
     `new ToolSet().addMcp(...)`). Khi `readTools === "*"`: giữ `["mcp:*"]`. Giữ `onPreToolUse` → `decide()` làm lớp
     thứ hai. Nên tách thành hàm thuần để có unit test.
   - Không đổi `scripts/list-tools.ts` (cần `mcp:*` để liệt kê đủ tool, đã reject mọi lời gọi).
     `scripts/sdk-smoke.ts`: đổi giống `sdk.ts` nếu smoke chạy theo agent.
   - Đây là **thu hẹp** quyền: ghi rõ trong commit message.
   - Kiểm ở Home bằng `byok` + mock MCP: tool ngoài allowlist không xuất hiện trong session, tool trong allowlist vẫn
     gọi được. Nếu `mcp:<tên>` không khớp như mong đợi: giữ `["mcp:*"]`, làm mục 6, ghi lý do vào handoff-copilot.
2. **Ghim `@azure/mcp@4.0.0-beta.10`.** (`packages/core/src/agents.ts`, `args` của server `azure`, đang `@latest`.)
   - Vì sao: đây là bản Work đã dùng cho brief lần 1–5 (kiểm trong npx cache ở Work). `@latest` là beta, cờ hoặc tên
     lệnh con có thể đổi bất kỳ lúc nào. Gate chỉ thấy tên `azure-monitor`, nên `--read-only` là lớp chặn ghi duy nhất
     cho lệnh con.
   - Kiểm ở Home: `npx -y @azure/mcp@4.0.0-beta.10 server start --help` còn `--namespace` và `--read-only`.
   - Sửa `docs/WORK.md` mục "Azure MCP" (đang ghi `@latest`): ghi bản đã ghim và cách nâng bản (đổi số bản, chạy
     `pnpm list-tools` ở Work, so lệnh `monitor_*` với `docs/mcp-tools.md` và task `cloud-reader`).
   - Không đổi quyền. Commit message ghi rõ: giữ `--read-only` và `AZURE_TOKEN_CREDENTIALS=AzureCliCredential`.
3. **Playwright MCP (Bước 0, `PLAN.md` mục "Playwright MCP: quay thử video").** Làm được ở Home vì không cần dữ liệu
   công ty.
   - Mục tiêu: một script smoke (theo mẫu `scripts/sdk-smoke.ts` / `scripts/list-tools.ts`) khởi động Playwright MCP,
     mở một trang không có dữ liệu thật (báo cáo mock trong `reports/`, qua `file://`), quay video, chụp ảnh. Kết
     quả lưu trong `reports/` (đã gitignore). Thêm lệnh vào `package.json`.
   - `PLAN.md` (mục Playwright ở phần công cụ) ghi `npx @playwright/mcp@latest --caps=devtools`, tool
     `browser_start_video` / `browser_stop_video`, cờ `--save-trace`, `--save-session`. Các tên này lấy từ docs,
     **chưa kiểm**. Lấy tên thật từ `--help` và `listTools`, sửa `PLAN.md` nếu khác. Ghim bản đã kiểm.
   - Ghi tên tool + cờ thật vào `docs/step0-results.md` (dòng Playwright). Không ghi vào `docs/mcp-tools.md` (bị
     `pnpm list-tools` ghi đè).
   - Không thêm Playwright vào agent `kind: "reader"` nào. Agent `qa` thuộc Phase 4, chưa làm.
   - Nếu script đi qua SDK session: không dùng `approveAll`; chỉ cho phép tool `browser_*` cần cho smoke.
   - Thêm cách chạy vào `docs/WORK.md` để Work chạy lại (kiểm tải browser và proxy trên máy công ty).
4. **Mock workiq `retrieve`.** Thêm tham số tuỳ chọn `capabilities: {name: string}[]` (giá trị thật đã gặp:
   `"TeamsMessages"`). Không đổi kết quả trả về.
5. **Giữ mock 403/404** (`law-payments`, `law-archive`). Lỗi thật vẫn có thể gặp khi thiếu quyền hoặc credential đổi.
6. **Tuỳ chọn: task `comms-reader`.** Chỉ khi mục 1 không làm được: thêm "chỉ dùng Work IQ, không đọc repo/code GitHub".
7. **Tuỳ chọn: `docs/WORK.md`.** Thêm 2 ghi chú: PowerShell `*>` làm lỗi UTF-8 (đặt
   `[Console]::OutputEncoding = [Text.Encoding]::UTF8` trước); `pnpm list-tools` ghi đè `docs/mcp-tools.md` và bật mọi
   MCP server.
8. Sau mỗi bước: `pnpm typecheck` + `pnpm test` xanh với `AGENTHUB_RUNTIME=mock`; `pnpm brief` (mock) mở được báo
   cáo. Tick các dòng `[Home]` lần 5 trong `PLAN.md`. Viết `docs/handoff-copilot.md` mới, liệt kê đúng việc Work cần
   kiểm (§4) và lệnh chạy.

Không giao cho Home: thử `GITHUB_MCP_TOKEN` rỗng. Việc này cần xác thực Copilot của công ty, chỉ kiểm được ở Work (§4).

## 4. Việc còn lại ở Work (sau khi Home xong §3)

- Pull, `pnpm install`, `pnpm typecheck` + `pnpm test`.
- Chạy lại `pnpm brief` runtime `copilot` (~40 AI Credits), một lần cho cả mục 1 và 2:
  - audit không còn `github-mcp-server-*`, 4/4 agent vẫn ok;
  - `cloud-reader` chạy với `@azure/mcp@4.0.0-beta.10`: không lỗi cờ, lệnh `monitor_*` như lần 5.
- Chạy script smoke Playwright của Home: tải được browser (proxy công ty), có file video + ảnh trong `reports/`.
- Tuỳ chọn: `pnpm smoke code-reader` với `GITHUB_MCP_TOKEN` rỗng. Ghi trạng thái server và mã lỗi vào
  work-feedback. Nếu Copilot không tự xác thực, lần sau Home thêm `missingConfig` hoặc gợi ý rõ trong báo cáo.
- User đối chiếu AI Credits (lần 2: 44.29, lần 3: 39.25, lần 4: 39.29, lần 5: 40.06) với trang billing công ty.
- Tuỳ chọn: góp ý thiết kế dashboard ([design/dashboard.excalidraw](design/dashboard.excalidraw)).

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
