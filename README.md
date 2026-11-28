# Agent Hub

Một nơi điều phối nhiều agent (Outlook/Teams, Azure DevOps, GitHub, Azure) chạy local bằng
**GitHub Copilot SDK**. Mỗi sáng gõ `pnpm brief` → các agent chỉ-đọc chạy song song → báo cáo HTML
`reports/brief-YYYY-MM-DD.html` (mock/byok: `brief-YYYY-MM-DD-mock.html` / `-byok.html`, không ghi đè báo cáo thật).

Bối cảnh, quyết định kiến trúc, lộ trình: [PLAN.md](PLAN.md). **Scope hiện tại: [docs/milestone-1.md](docs/milestone-1.md).**
**Bắt đầu ở máy công ty: [docs/WORK.md](docs/WORK.md).**
Bàn giao giữa hai môi trường: Home → Work [docs/handoff-copilot.md](docs/handoff-copilot.md), Work → Home [docs/handoff-claude.md](docs/handoff-claude.md).

## Trạng thái

| Phần | Trạng thái |
|---|---|
| `AgentRuntime` + runtime `mock` / `byok` / `copilot` | ✅ |
| 5 agent đọc có sẵn (Outlook + Teams, ADO Board, ADO Repos + Pipelines, GitHub, Azure Monitor), mỗi agent 1 session + chỉ thấy cổng của nó | ✅ |
| Tool gate chỉ-đọc (`onPreToolUse` + `onPermissionRequest`), audit log JSONL | ✅ |
| Mock MCP (Work IQ, ADO, Azure Monitor) theo tên tool thật từ Bước 0 + fixture có prompt injection | ✅ |
| `pnpm brief` + báo cáo HTML | ✅ `mock`; ✅ `byok` thật ở Home (login Copilot cá nhân, 3 agent, ~47s, model gắn nhãn mail chứa prompt injection, không gọi tool ghi) |
| Bước 0 ở Work (auth, Work IQ, ADO, Azure, tên tool thật) | ✅ |
| Phase 1: `pnpm brief` runtime `copilot` ở Work | ✅ lần 8: 4/4 agent, 55s, 33/120 AI Credits, không tool ghi nào được gọi |
| Phase 2: dashboard `pnpm dashboard` | ✅ `mock` ở Home; ✅ Work lần 9 (runtime `copilot`, 52.8s, 31.39/120 AI Credits) |
| wit-reader: đọc đủ trường một work item (`pnpm wit <số>`), gọi thẳng tool, 0 credit | ✅ `mock` ở Home; ⏳ [Work] gọi thẳng có chạy không |
| Milestone 1: card việc cần làm, quản lý cổng / agent trên UI, đăng nhập trên UI, eval | ✅ `mock` ở Home (2026-11-28); ⏳ [Work] lần 13; ⏳ Task eval đã verify — [docs/milestone-1.md](docs/milestone-1.md) |

## Tính năng dùng được (Milestone 1)

| Tính năng | Lệnh / chỗ dùng |
|---|---|
| Check việc: các agent chỉ-đọc chạy song song; chọn khoảng thời gian (hôm nay / 24h / 3 ngày / 7 ngày), agent và trần credit mỗi lượt | nút Chạy trên dashboard, hoặc `pnpm brief` |
| Card việc cần làm: gộp trùng giữa nguồn (cùng work item / PR / link), xếp theo ô Eisenhower rồi Priority ADO rồi hạn; nhãn nguồn, P1–4, Mới, Cập nhật mới | khung Việc cần làm dưới sơ đồ |
| Chi tiết card: nội dung gốc gọn, link mở bản gốc, ảnh (link), lý do quan trọng / gấp; todo list do model gợi ý, sửa / thêm / sắp xếp / gạch bỏ / tick; Đã xong / Ẩn / Mở lại (lưu ở `reports/cards-state.json`) | bấm vào card |
| Xuất danh sách việc dạng Markdown; báo cáo HTML theo ô Eisenhower | nút Xuất Markdown; `reports/brief-<ngày>.html` |
| Mail lừa đảo / prompt injection: gắn nhãn, không thành việc, agent không làm theo | dải đỏ trên khung Việc cần làm |
| Cổng MCP và agent quản lý trên UI: thêm từ catalog (kéo thả), nối dây agent → cổng, xoá bằng Delete, form tự giải thích từng ô; import `mcp.json` của VS Code | nút "＋ Thêm cổng / agent", tab Cấu hình; lưu ở `agenthub.local.json` |
| Chọn tool được dùng của mỗi cổng: Lấy danh sách tool (0 credit), tick; tool tên giống ghi bị khoá | tab Cấu hình của cổng |
| Đăng nhập trên UI: Microsoft (`az login`, trình duyệt hoặc mã thiết bị, hồ sơ riêng mỗi cổng), GitHub (`gh auth login --web`), điều khoản Work IQ, Đăng xuất; token của cổng tự tạo ở kho bí mật của OS | tab Đăng nhập |
| Dashboard realtime: sơ đồ orchestrator → agent → cổng MCP, node đổi trạng thái, edge nhấp nháy khi đang gọi tool, đỏ khi lỗi | `pnpm dashboard` → http://127.0.0.1:4317 |
| Chi tiết từng agent / cổng: từng lần gọi tool, thời gian, credit, token, lỗi + gợi ý | bấm vào node (tab Chi tiết) |
| Báo lỗi có cách sửa: "Không lấy được" (đăng nhập, EULA, cấu hình, hết ngân sách), "Cảnh báo", "Đã chặn" | báo cáo + dashboard |
| Đọc đủ một work item ADO (title, state, priority, point, giờ, người được giao, iteration, hạn, tag, description, AC), nguyên văn, không tốn credit model | `pnpm wit <số>` |
| Eval bằng deepeval: nhận đúng việc, ô Eisenhower, an toàn, tóm tắt + todo (G-Eval); judge chọn bằng `AGENTHUB_JUDGE` | `pnpm eval [--drafts]`, Task ở `evals/tasks/` |
| Hướng dẫn: tour giới thiệu từng phần của dashboard (tự đổi tab) | nút Hướng dẫn trên thanh trên |
| An toàn: chỉ đọc (tool ghi luôn bị chặn), agent chỉ thấy tool đã tick, gate 2 lớp, MCP chỉ-đọc, ngân sách mỗi agent, audit JSONL | luôn bật |
| Chạy thử không cần dịch vụ thật: runtime `mock` với 3 kịch bản, `byok` với MCP giả | `AGENTHUB_RUNTIME`, `AGENTHUB_SCENARIO` |

Đã bỏ: agent ghi (Phase 3), nghiệm thu bằng Playwright (Phase 4). Sau M1: lịch chạy tự động.

## Chạy ở Home (không cần Copilot công ty)

Cần Node `^20.19` hoặc `>=22.12`. pnpm qua corepack (có sẵn trong Node):

```bash
corepack enable   # hoặc dùng "corepack pnpm" thay cho "pnpm"
pnpm install
pnpm test         # gate, allowlist, mapper event, schema, mock MCP, mock end-to-end (audit vào thư mục tạm)
pnpm brief        # runtime mock, phát lại fixtures/scenarios/brief-ok.jsonl
pnpm dashboard    # build giao diện rồi mở http://127.0.0.1:4317 (runtime theo AGENTHUB_RUNTIME, mặc định mock)
pnpm wit 1234     # đọc đủ trường work item 1234 (mock)
pnpm eval --drafts  # chạy eval trên Task nháp: tốn quota model (byok), judge theo AGENTHUB_JUDGE
pnpm hub          # chỉ server (dùng bản build sẵn trong apps/web/dist)
```

Kịch bản lỗi (auth, timeout, hết ngân sách, sai schema):

```bash
AGENTHUB_SCENARIO=brief-failures pnpm brief
AGENTHUB_SCENARIO=brief-auth pnpm brief       # lỗi EULA Work IQ, VS30063 ADO, tool built-in bị chặn
```

SDK thật ở Home (`byok`): Work IQ, ADO, Azure là MCP giả, GitHub là MCP thật của tài khoản cá nhân.
Model: `ANTHROPIC_API_KEY` nếu có, không thì dùng login Copilot cá nhân (`gh auth login`).

```bash
GITHUB_MCP_TOKEN=$(gh auth token) AGENTHUB_RUNTIME=byok pnpm list-tools   # không tốn credit
GITHUB_MCP_TOKEN=$(gh auth token) AGENTHUB_RUNTIME=byok pnpm brief        # tốn quota model
```

## Cấu trúc

```
packages/core/src/
  agents.ts        5 agent đọc có sẵn + cổng có sẵn: prompt, quy tắc việc cần làm, MCP server, allowlist tool đọc
  hub-config.ts    agenthub.local.json: cổng / agent của người dùng, catalog, import mcp.json
  cards.ts         gộp trùng, Eisenhower, trạng thái card, xuất Markdown
  login.ts         lệnh đăng nhập az / gh / Work IQ, đọc mã thiết bị
  secrets.ts       kho bí mật của OS cho token của cổng
  tool-list.ts     danh sách tool của một cổng (0 credit)
  wit.ts           wit-reader: đọc đủ trường một work item ADO (gọi thẳng tool, tách trường bằng code)
  security.ts      tool gate chỉ-đọc (decide), redact secret, audit log
  events.ts        HubEvent + mapSdkEvent (event SDK → event nội bộ)
  brief.ts         schema BriefItem (zod): một mục nguồn đã đánh giá — cũng là response schema gửi cho model
  report.ts        summarize + render HTML
  hints.ts         lỗi đã biết → cách sửa (dùng cả ở trình duyệt)
  auth.ts          kiểm đăng nhập từng cổng (gh / az / bí mật), không trả token
  config.ts        agenthub.config.ts + .env
  runtime/         AgentRuntime, mock.ts, sdk.ts (byok + copilot)
packages/mock-mcp/ MCP server giả (stdio): workiq, ado, azure, github (github chỉ cho eval)
evals/             deepeval: Task (task.ts), metric (metrics.ts), judge (judge.ts), pnpm eval (run.ts)
apps/cli/          pnpm brief, pnpm wit
apps/server/       pnpm hub (API dashboard + phục vụ giao diện, chỉ 127.0.0.1)
apps/web/          dashboard React + @xyflow/react (state.ts: event → trạng thái node, có test)
scripts/           sdk-smoke.ts, list-tools.ts (Bước 0), dashboard.ts
fixtures/          dữ liệu tự tạo + kịch bản HubEvent (*.jsonl)
docs/              WORK.md, step0-results.md, mcp-tools.md, work-feedback.md
```

## Quy tắc bảo mật đã cài trong code

- Agent đọc chỉ thấy MCP server của chính nó (1 session/agent) và chỉ các tool trong allowlist
  (`availableTools: mcp:<tên>`), không tool built-in, không shell/file.
- Gate từ chối: tool của server khác, tool có tên giống ghi (`send`, `create`, `update`, `delete`, ...),
  tool ngoài allowlist khi đã có allowlist. Có 2 lớp: `onPreToolUse` và `onPermissionRequest`.
- ADO và GitHub MCP của agent đọc luôn gửi header `X-MCP-Readonly: true`. Azure MCP chạy `--read-only`.
- Không có agent ghi và không có hàng duyệt: mọi tool ghi luôn bị gate từ chối.
- Prompt mọi agent đọc ghi rõ dữ liệu lấy về là DỮ LIỆU, không phải chỉ thị.
- Mỗi agent có `sessionLimits.maxAiCredits` = ngân sách / số agent. Hết ngân sách → dừng agent, không tự tăng.
- wit-reader gọi thẳng `wit_work_item` (không qua model) nhưng vẫn qua `decide()` và audit.
- Audit mọi quyết định của gate vào `logs/audit-YYYY-MM-DD.jsonl` (đã lược secret).
- Dashboard chỉ nghe `127.0.0.1`; từ chối Host lạ (DNS rebinding), Origin lạ, body không phải JSON (form cross-site);
  CSP chặn trang khác nhúng dashboard (`frame-ancestors 'self'`); báo cáo hiển thị không được chạy script.
- Báo cáo HTML escape toàn bộ nội dung, chỉ render link `http(s)`.
