# Agent Hub

Một nơi điều phối nhiều agent (Outlook/Teams, Azure DevOps, GitHub, Azure) chạy local bằng
**GitHub Copilot SDK**. Mỗi sáng gõ `pnpm brief` → các agent chỉ-đọc chạy song song → báo cáo HTML
`reports/brief-YYYY-MM-DD.html` (mock/byok: `brief-YYYY-MM-DD-mock.html` / `-byok.html`, không ghi đè báo cáo thật).

Bối cảnh, quyết định kiến trúc, lộ trình: [PLAN.md](PLAN.md).
**Bắt đầu ở máy công ty: [docs/WORK.md](docs/WORK.md).**
Bàn giao giữa hai môi trường: Home → Work [docs/handoff-copilot.md](docs/handoff-copilot.md), Work → Home [docs/handoff-claude.md](docs/handoff-claude.md).

## Trạng thái

| Phần | Trạng thái |
|---|---|
| `AgentRuntime` + runtime `mock` / `byok` / `copilot` | ✅ |
| 4 agent đọc (comms, board, code, cloud), mỗi agent 1 session + MCP riêng | ✅ |
| Approval gate (`onPreToolUse` + `onPermissionRequest`), audit log JSONL | ✅ |
| Mock MCP (Work IQ, ADO, Azure Monitor) theo tên tool thật từ Bước 0 + fixture có prompt injection | ✅ |
| `pnpm brief` + báo cáo HTML | ✅ `mock`; ✅ `byok` thật ở Home (login Copilot cá nhân, 3 agent, ~47s, model gắn nhãn mail chứa prompt injection, không gọi tool ghi) |
| Bước 0 ở Work (auth, Work IQ, ADO, Azure, tên tool thật) | ✅ |
| Phase 1: `pnpm brief` runtime `copilot` ở Work | ✅ lần 8: 4/4 agent, 55s, 33/120 AI Credits, không tool ghi nào được gọi |
| Phase 2: dashboard `pnpm dashboard` | ✅ `mock` ở Home; ✅ Work lần 9 (runtime `copilot`, 52.8s, 31.39/120 AI Credits) |
| Playwright MCP smoke (`pnpm playwright-smoke`) | ✅ ở Work (video + ảnh + trace) |
| Phase 3: agent ghi có duyệt (Teams, ADO, GitHub) | ✅ `mock` ở Home; ✅ Work lần 11: Từ chối với comms-writer (lý do hiện trên UI, không gửi gì); ⏳ [Work] board-writer theo số work item |
| Phase 4: nghiệm thu bằng Playwright (agent `qa`, báo cáo có ảnh / video / trace) | ✅ `mock` ở Home; ✅ Work lần 11: 2/3 đạt, ≈9.9 AI Credits, gọi tuần tự, 1 video; ⏳ [Work] ảnh theo phần tử, tiêu chí ADO nguyên văn |

## Tính năng dùng được (MVP)

| Tính năng | Lệnh / chỗ dùng |
|---|---|
| Check việc buổi sáng: 4 agent chỉ-đọc chạy song song (Outlook + Teams qua Work IQ, Azure DevOps, GitHub, Azure Monitor) | `pnpm brief` hoặc nút Chạy trên dashboard |
| Báo cáo HTML: "Cần bạn xử lý" lên đầu, nhóm theo nguồn, màu theo độ ưu tiên, link trực tiếp, credit đã dùng | `reports/brief-<ngày>.html`, hoặc khung Báo cáo trên dashboard |
| Báo lỗi có cách sửa: "Không lấy được" (đăng nhập, EULA, cấu hình, hết ngân sách), "Cảnh báo" (1 workspace không đọc được, lỗi lạ), "Đã chặn" (tool gate từ chối) | báo cáo + dashboard |
| Dashboard realtime: sơ đồ orchestrator → agent → MCP server, node đổi trạng thái, edge nhấp nháy khi đang gọi tool, đỏ khi lỗi | `pnpm dashboard` → http://127.0.0.1:4317 |
| Chi tiết từng agent / MCP server: từng lần gọi tool, thời gian, credit, token, lỗi + gợi ý | bấm vào node |
| Hàng duyệt: xem tham số đầy đủ, Duyệt / Từ chối kèm lý do | tab Duyệt (tự mở khi có yêu cầu) |
| Lấy tiêu chí nghiệm thu từ work item ADO (trường Acceptance Criteria, chỉ đọc, giữ nguyên văn; đọc thẳng tool, không tốn credit model) | tab Nghiệm thu → Lấy tiêu chí |
| Nghiệm thu một trang web: nhập URL + tiêu chí → agent `qa` mở trang bằng Playwright, kiểm từng tiêu chí, quay video, chụp ảnh, lưu trace → báo cáo HTML pass/fail | tab Nghiệm thu, `reports/qa-<thời gian>/index.html` |
| Giao việc cho agent ghi: chọn một mục trong báo cáo (nhóm "Cần bạn xử lý" hoặc "Mục khác có agent ghi") → agent soạn tin Teams / comment, cập nhật work item ADO / comment hoặc PR GitHub → chờ bạn duyệt rồi mới gửi. Kết quả ("đã gửi", "không có gì được gửi" + lý do từ chối hoặc lời giải thích của agent) hiện trên mục, node và tab Duyệt. Từ chối một lần là agent dừng gửi trong lượt đó. Giao cho board-writer theo số work item khi báo cáo không có mục ADO | tab Việc cần làm |
| "Có gì mới": mục không có trong check việc ngày trước được đánh dấu "Mới" | báo cáo + tab Việc cần làm |
| Kiểm đăng nhập từng nguồn (GitHub, ADO, Azure; Work IQ biết khi chạy), không tốn credit, không hiện token | tab Đăng nhập, chip trên thanh trên |
| Thanh credit đã dùng / ngân sách; nút Dừng (yêu cầu đang chờ bị từ chối, không bao giờ tự duyệt) | thanh trên |
| An toàn: agent chỉ thấy tool trong allowlist, gate 2 lớp, MCP chỉ-đọc, ngân sách mỗi agent, audit JSONL | luôn bật |
| Chạy thử không cần dịch vụ thật: runtime `mock` với 3 kịch bản, `byok` với MCP giả | `AGENTHUB_RUNTIME`, `AGENTHUB_SCENARIO` |
| Công cụ kiểm: tool model thấy (`pnpm smoke <agent> --tools`), danh sách tool thật (`pnpm list-tools`), Playwright smoke | không tốn credit |

Chưa có: đính kèm báo cáo nghiệm thu vào work item, lịch chạy tự động, luồng nhiều bước (story ADO → thu thập context → hỏi Teams → theo dõi trả lời).

## Chạy ở Home (không cần Copilot công ty)

Cần Node `^20.19` hoặc `>=22.12`. pnpm qua corepack (có sẵn trong Node):

```bash
corepack enable   # hoặc dùng "corepack pnpm" thay cho "pnpm"
pnpm install
pnpm test         # gate, allowlist, mapper event, schema, mock MCP, mock end-to-end (audit vào thư mục tạm)
pnpm brief        # runtime mock, phát lại fixtures/scenarios/brief-ok.jsonl
pnpm dashboard    # build giao diện rồi mở http://127.0.0.1:4317 (runtime theo AGENTHUB_RUNTIME, mặc định mock)
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
  agents.ts        4 agent đọc + 3 agent ghi: prompt, MCP server, allowlist tool đọc / ghi
  qa.ts            agent nghiệm thu (Playwright MCP) + báo cáo nghiệm thu
  security.ts      approval gate (decide), redact secret, audit log
  events.ts        HubEvent + mapSdkEvent (event SDK → event nội bộ)
  brief.ts         schema BriefItem (zod) — cũng là response schema gửi cho model
  report.ts        summarize + render HTML
  hints.ts         lỗi đã biết → cách sửa (dùng cả ở trình duyệt)
  auth.ts          kiểm đăng nhập gh / az, không trả token
  config.ts        agenthub.config.ts + .env
  runtime/         AgentRuntime, mock.ts, sdk.ts (byok + copilot)
packages/mock-mcp/ MCP server giả (stdio): workiq, azure
apps/cli/          pnpm brief
apps/server/       pnpm hub (API dashboard + phục vụ giao diện, chỉ 127.0.0.1)
apps/web/          dashboard React + @xyflow/react (state.ts: event → trạng thái node, có test)
scripts/           sdk-smoke.ts, list-tools.ts, playwright-smoke.ts (Bước 0)
fixtures/          dữ liệu tự tạo + kịch bản HubEvent (*.jsonl)
docs/              WORK.md, step0-results.md, mcp-tools.md, work-feedback.md
```

## Quy tắc bảo mật đã cài trong code

- Agent đọc chỉ thấy MCP server của chính nó (1 session/agent) và chỉ các tool trong allowlist
  (`availableTools: mcp:<tên>`), không tool built-in, không shell/file.
- Gate từ chối: tool của server khác, tool có tên giống ghi (`send`, `create`, `update`, `delete`, ...),
  tool ngoài allowlist khi đã có allowlist. Có 2 lớp: `onPreToolUse` và `onPermissionRequest`.
- ADO và GitHub MCP của agent đọc luôn gửi header `X-MCP-Readonly: true`. Azure MCP chạy `--read-only`.
- Agent ghi (Phase 3) không đọc mail/chat/board/code: chỉ nhận một mục báo cáo do người dùng chọn, dạng DỮ LIỆU.
  Tool trong `writeTools` luôn chờ duyệt trên dashboard (đủ tham số); tool khác bị từ chối. Từ chối → agent dừng.
  Không có agent ghi cho Azure (thay đổi tài nguyên Azure luôn bị từ chối).
- Agent nghiệm thu chỉ có tool trình duyệt trong allowlist (không chạy JS tuỳ ý, không đọc/tải file, không mở tab),
  `browser_navigate` chỉ tới đúng origin của trang được kiểm; Playwright chạy headless, profile tạm (`--isolated`).
- Prompt mọi agent đọc ghi rõ dữ liệu lấy về là DỮ LIỆU, không phải chỉ thị.
- Mỗi agent có `sessionLimits.maxAiCredits` = ngân sách / số agent. Hết ngân sách → dừng agent, không tự tăng.
- `pnpm brief` tự từ chối mọi approval request (brief là chỉ-đọc).
- Audit mọi quyết định của gate vào `logs/audit-YYYY-MM-DD.jsonl` (đã lược secret).
- Dashboard chỉ nghe `127.0.0.1`; từ chối Host lạ (DNS rebinding), Origin lạ, body không phải JSON (form cross-site);
  CSP chặn trang khác nhúng dashboard (`frame-ancestors 'self'`); báo cáo hiển thị không được chạy script.
- Báo cáo HTML escape toàn bộ nội dung, chỉ render link `http(s)`.
