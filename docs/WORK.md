# Bắt đầu ở máy công ty (Work)

Mục tiêu buổi đầu: hoàn thành **Bước 0** trong [PLAN.md](../PLAN.md) — xác nhận Copilot SDK chạy được
bằng license công ty, từng MCP server kết nối được, và lấy **tên tool thật** để làm allowlist.
Ghi kết quả vào `docs/step0-results.md` và `docs/mcp-tools.md`.

> **Quy tắc dữ liệu:** không chép nội dung mail, chat, work item, log, tên người, email, tenant id
> vào repo. Chỉ ghi thông tin cấu trúc: tên tool, schema, mã lỗi, thông báo lỗi (đã xoá định danh).
> Kiểm tra quy định công ty về việc clone repo cá nhân trước khi làm.

Lệnh dưới đây viết cho PowerShell (Windows). Trên macOS/Linux thay `$env:X="..."; lệnh` bằng `X=... lệnh`.
Cách dễ nhất cho cả hai: điền file `.env` (copy từ `.env.example`), khi đó chỉ cần gõ lệnh `pnpm ...`.

## 1. Cài đặt (5 phút)

```powershell
git clone <url repo>
cd master-agent
node -v                 # cần ^20.19 hoặc >=22.12
corepack enable         # nếu bị chặn quyền: dùng "corepack pnpm" thay cho "pnpm" ở mọi lệnh
pnpm install
pnpm test               # phải xanh (không gọi dịch vụ thật)
pnpm brief              # runtime mock → mở reports/brief-<ngày>-mock.html (runtime copilot: brief-<ngày>.html)
copy .env.example .env  # rồi sửa .env
```

Nếu `pnpm install` bị proxy công ty chặn: cấu hình `npm config set proxy ...` / `https-proxy`, hoặc
hỏi IT registry nội bộ.

## 2. Copilot SDK + license công ty

SDK dùng tài khoản GitHub đang đăng nhập (`gh` hoặc `copilot` CLI), hoặc biến `COPILOT_GITHUB_TOKEN`.

```powershell
gh auth login           # đăng nhập tài khoản GitHub có license Copilot công ty
```

Trong `.env`: `AGENTHUB_RUNTIME=copilot`.

**Kiểm tra:** `pnpm smoke code-reader` → dòng đầu `auth: {"isAuthenticated":true,...}`, sau đó có
event `tool.execution_start` và phần `=== reply ===`.

- Lỗi kiểu policy/không có quyền Copilot CLI → org chưa bật **Copilot CLI policy**. Ghi lỗi (đã xoá
  tên org) vào step0-results.md, hỏi admin GitHub org.
- Chưa chọn được model → thêm `AGENTHUB_MODEL=<model org cho phép>` vào `.env`.

## 3. Từng MCP server

Chạy lần lượt. Mỗi lệnh đặt `maxAiCredits: 30` (mức tối thiểu runtime cho phép mỗi session), thực tế dùng ít hơn nhiều:

| Agent | Lệnh | Cần chuẩn bị |
|---|---|---|
| GitHub | `pnpm smoke code-reader` | `.env`: `GITHUB_REPOS`. `GITHUB_MCP_TOKEN` không bắt buộc: để trống thì server vẫn kết nối bằng đăng nhập của Copilot CLI (kiểm ở Work 2026-11-26, 32 tool); đặt `gh auth token` nếu muốn chắc |
| Azure DevOps | `pnpm smoke board-reader` | `.env`: `ADO_ORG`, `ADO_PROJECT`. Lần đầu có thể mở trình duyệt đăng nhập Entra |
| Outlook/Teams | `pnpm smoke comms-reader` | Chạy trước 1 lần: `npx -y @microsoft/workiq accept-eula`. Có thể hiện màn hình xin **admin consent** |
| Azure Monitor | `pnpm smoke cloud-reader` | `az login` (Azure MCP chạy với `AZURE_TOKEN_CREDENTIALS=AzureCliCredential`, nên dùng đúng tài khoản `az account show`; tài khoản này cần quyền đọc workspace). Kiểm token còn dùng được bằng `az account get-access-token`: `az account show` đọc cache, vẫn ok khi token đã bị thu hồi (lỗi `AADSTS50173` / `invalid_grant`, thường sau khi đổi mật khẩu; sửa: `az logout` rồi `az login`); `.env`: `AZURE_SUBSCRIPTION`, `AZURE_LOG_WORKSPACE` (cách nhau bằng dấu phẩy; 1 subscription cho mọi workspace, hoặc mỗi workspace một subscription cùng thứ tự) |

Mỗi lệnh in mọi event SDK. Ghi vào step0-results.md: thành công/thất bại, **tên event và mã lỗi**,
không chép nội dung trả về.

Ghi chú theo từng server:

- **Work IQ** bị chặn (consent/license) → bỏ qua, MVP vẫn chạy 3 nguồn còn lại. Không thay bằng MCP
  bên thứ ba truy cập M365 khi chưa hỏi IT.
- **Azure MCP**: ghim `@azure/mcp@4.0.0-beta.10` (`AZURE_MCP_VERSION` trong `packages/core/src/agents.ts`),
  chạy với `--namespace monitor --read-only`. Gate chỉ thấy tên `azure-monitor`, không thấy lệnh con, nên
  `--read-only` là lớp chặn ghi duy nhất cho lệnh con. Nâng bản:
  1. `npx -y @azure/mcp@<bản mới> server start --help`: còn `--namespace` và `--read-only`.
  2. Đổi `AZURE_MCP_VERSION`, chạy `pnpm list-tools`.
  3. So lệnh `monitor_*` trong `docs/mcp-tools.md` với task `cloud-reader` trong `agents.ts`; khác thì sửa task
     và mock (`packages/mock-mcp`).
  4. `pnpm brief`, xem audit không có lỗi cờ / `unknown arguments`.
- **ADO**: URL `https://mcp.dev.azure.com/<org>` + header `X-MCP-Readonly: true`. Auth do
  `mcpAuth` (trong `packages/core/src/runtime/sdk.ts`) lấy token từ `az`, nên cần `az login` bằng tài
  khoản **là thành viên org ADO**. Lỗi `VS30063` = identity của `az` không thuộc org.
  Remote ADO MCP chỉ nhận token Entra, không nhận PAT. Nếu tài khoản ADO khác tài khoản Azure, dùng
  profile `az` riêng cho ADO (profile mặc định giữ nguyên cho `cloud-reader`):

  ```powershell
  $env:AZURE_CONFIG_DIR = "$HOME\.azure-ado"; az login --allow-no-subscriptions; Remove-Item Env:AZURE_CONFIG_DIR
  ```

  Rồi thêm `ADO_AZURE_CONFIG_DIR=<đường dẫn tuyệt đối tới .azure-ado>` vào `.env`. Tenant ADO khác
  tenant mặc định thì thêm `--tenant <tenant>` vào `az login`.
- **Work IQ**: nếu tool trả về thông báo EULA, tự chạy `npx -y @microsoft/workiq accept-eula` trong terminal
  (agent không được phép gọi `accept_eula`).
- **Windows + npx**: agent dùng `cmd /c npx ...`. Nếu vẫn lỗi spawn, ghi lại thông báo lỗi.

## 4. Lấy tên tool thật → allowlist

```powershell
pnpm list-tools
```

Không gửi prompt nên không tốn credit. Lệnh ghi đè `docs/mcp-tools.md` bằng tên tool thật của mọi
server kết nối được, kèm cột "Loại (đoán)". Sau đó:

1. Sửa tay cột Loại cho đúng (`read` / `write`).
2. Trong `packages/core/src/agents.ts`, thay `readTools: "*"` của từng agent bằng danh sách tên
   `read` (dạng `<server>-<tool>`, ví dụ `"github-list_pull_requests"`). Có thể nhờ Copilot agent mode
   làm việc này (xem [AGENTS.md](../AGENTS.md)).
3. `pnpm test` phải vẫn xanh. Test `packages/mock-mcp/test/server.test.ts` kiểm tra mọi tên trong
   allowlist có trong mock MCP: thêm tool mới vào allowlist thì báo về Home (work-feedback.md) để thêm
   vào mock, hoặc tự thêm vào `packages/mock-mcp/src/server.ts`.

**Input schema của tool:** SDK không trả schema (`rpc.mcp.listTools` chỉ có `name`, `description`).
Mock đang đoán tên tham số và giá trị `action`. Sau một lần `pnpm smoke`/`pnpm brief` thật, xem trường
`args` trong `logs/audit-<ngày>.jsonl` (đã lược secret) và ghi **tên tham số + giá trị `action`** (không
chép giá trị dữ liệu như id, tên, query có tên người) vào `docs/work-feedback.md`.

## 5. Chạy thật

```powershell
pnpm brief
```

Báo cáo có mục "Không lấy được" kèm gợi ý cho lỗi đã biết (EULA Work IQ, `VS30063`, `AADSTS65001`,
hết ngân sách) và mục "Đã chặn" liệt kê tool gate đã từ chối (ví dụ built-in `github-mcp-server-*`).
Nếu một server OAuth chưa kết nối sau 60s, console in `MCP chưa kết nối sau 60s: <server>`.

**Tiêu chí xong Phase 1:** báo cáo đúng, < 3 phút, credit nằm trong ngân sách
(`AGENTHUB_MAX_AI_CREDITS`), trong `logs/audit-<ngày>.jsonl` không có tool ghi nào `allow`.

Ngân sách: runtime bắt buộc `maxAiCredits >= 30` mỗi session, nên 4 agent cần ít nhất 120
(mặc định). Đây là trần mềm, không phải số tiêu thực tế. Kiểm tra số credit ở footer báo cáo với trang billing GitHub: code đang giả định
`1 AI Credit = 1e9 nano-AIU` (event `session.usage_checkpoint`). Sai thì ghi vào work-feedback.md.

## 5b. Playwright MCP (smoke, không tốn AI Credits)

```powershell
npx -y @playwright/mcp@0.0.86 install-browser ffmpeg   # 1 lần: FFmpeg để quay video
pnpm playwright-smoke                                    # Chrome hệ thống
$env:PLAYWRIGHT_BROWSER = "msedge"; pnpm playwright-smoke # nếu máy không có Chrome
```

Script mở một trang mẫu (dữ liệu tự tạo) qua `127.0.0.1`, chụp ảnh, quay video, lưu trace vào
`reports/playwright-smoke/`. Kết quả mong đợi: dòng cuối `Smoke Playwright: ok`, có `smoke.png`, `smoke.webm`,
`traces/`. Lỗi tải browser/FFmpeg (proxy công ty): ghi thông báo lỗi vào `docs/work-feedback.md`.

## 5c. Dashboard (Phase 2)

```powershell
$env:AGENTHUB_RUNTIME = "copilot"
pnpm dashboard          # build apps/web rồi mở server; vào http://127.0.0.1:4317
```

- Bấm **Chạy** (hoặc Ctrl+Enter) với lệnh "check việc". Tốn AI Credits như `pnpm brief`, ghi cùng báo cáo
  `reports/brief-<ngày>.html` và audit.
- Tab **Đăng nhập** kiểm `gh auth status` và `az account get-access-token` (ADO dùng `ADO_AZURE_CONFIG_DIR`),
  không tốn credit. Work IQ chỉ biết khi chạy.
- Ctrl+C trong terminal để tắt. Nút **Dừng** dừng lượt chạy; yêu cầu duyệt đang chờ bị từ chối.
- Không chụp màn hình dashboard vào repo (có dữ liệu thật). Chỉ ghi cấu trúc vào work-feedback.

## 6. Gửi phản hồi về Home

Ghi mọi khác biệt so với mock vào `docs/work-feedback.md` (dạng cấu trúc), cập nhật
`docs/step0-results.md`, `docs/mcp-tools.md`, rồi commit + push. Ở Home, Claude Code đọc các file
này để sửa mock MCP, fixture và code cho khớp thật.

Không commit: `.env`, `logs/`, `reports/` (đã có trong `.gitignore`).

Ghi chú công cụ:
- PowerShell: `pnpm brief *> file` giải mã output theo code page của console, tiếng Việt bị lỗi. Chạy
  `[Console]::OutputEncoding = [Text.Encoding]::UTF8` trước.
- `pnpm list-tools` bật **mọi** MCP server và **ghi đè** `docs/mcp-tools.md`. Chỉ cần xem tool một agent thấy:
  `pnpm smoke <agent> --tools` (không gửi prompt, không tốn credit; exit 1 nếu có tool ngoài allowlist).
`pnpm test` ghi audit vào thư mục tạm (`AGENTHUB_LOG_DIR`), nên `logs/` chỉ có bản ghi của lần chạy thật.
