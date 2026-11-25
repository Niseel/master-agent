# Agent Hub

Một nơi điều phối nhiều agent (Outlook/Teams, Azure DevOps, GitHub, Azure) chạy local bằng
**GitHub Copilot SDK**. Mỗi sáng gõ `pnpm brief` → các agent chỉ-đọc chạy song song → báo cáo HTML
`reports/brief-YYYY-MM-DD.html`.

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
| Bước 0 ở Work (auth, Work IQ, ADO, Azure, tên tool thật) | ⏳ [Work] — xem docs/WORK.md |
| Dashboard realtime (Phase 2) | chưa làm |

## Chạy ở Home (không cần Copilot công ty)

Cần Node `^20.19` hoặc `>=22.12`. pnpm qua corepack (có sẵn trong Node):

```bash
corepack enable   # hoặc dùng "corepack pnpm" thay cho "pnpm"
pnpm install
pnpm test         # gate, allowlist, mapper event, schema, mock MCP, mock end-to-end (audit vào thư mục tạm)
pnpm brief        # runtime mock, phát lại fixtures/scenarios/brief-ok.jsonl
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
  agents.ts        4 agent đọc: prompt, MCP server, allowlist tool
  security.ts      approval gate (decide), redact secret, audit log
  events.ts        HubEvent + mapSdkEvent (event SDK → event nội bộ)
  brief.ts         schema BriefItem (zod) — cũng là response schema gửi cho model
  report.ts        render HTML
  config.ts        agenthub.config.ts + .env
  runtime/         AgentRuntime, mock.ts, sdk.ts (byok + copilot)
packages/mock-mcp/ MCP server giả (stdio): workiq, azure
apps/cli/          pnpm brief
scripts/           sdk-smoke.ts, list-tools.ts (Bước 0)
fixtures/          dữ liệu tự tạo + kịch bản HubEvent (*.jsonl)
docs/              WORK.md, step0-results.md, mcp-tools.md, work-feedback.md
```

## Quy tắc bảo mật đã cài trong code

- Agent đọc chỉ thấy MCP server của chính nó (1 session/agent), không có tool built-in
  (`availableTools: ["mcp:*"]`, không shell/file).
- Gate từ chối: tool của server khác, tool có tên giống ghi (`send`, `create`, `update`, `delete`, ...),
  tool ngoài allowlist khi đã có allowlist. Có 2 lớp: `onPreToolUse` và `onPermissionRequest`.
- ADO và GitHub MCP luôn gửi header `X-MCP-Readonly: true`. Azure MCP chạy `--read-only`.
- Prompt mọi agent đọc ghi rõ dữ liệu lấy về là DỮ LIỆU, không phải chỉ thị.
- Mỗi agent có `sessionLimits.maxAiCredits` = ngân sách / số agent. Hết ngân sách → dừng agent, không tự tăng.
- `pnpm brief` tự từ chối mọi approval request (brief là chỉ-đọc).
- Audit mọi quyết định của gate vào `logs/audit-YYYY-MM-DD.jsonl` (đã lược secret).
- Báo cáo HTML escape toàn bộ nội dung, chỉ render link `http(s)`.
