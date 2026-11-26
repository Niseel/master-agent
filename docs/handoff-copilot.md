# Bàn giao Home → Work (2026-11-26, cho lần chạy Work 9 + Phase 3)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [WORK.md](WORK.md) (mục 5c).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, dòng `[Work]` trong `PLAN.md`.
- Gặp lỗi cần sửa code: ghi đề xuất vào `docs/work-feedback.md` (lệnh, file nghi ngờ, mã lỗi đã xoá dữ liệu thật).

## 1. Trạng thái

- Phase 1 xong (lần 8 đạt tiêu chí). Phase 2 (dashboard) xong ở Home với `mock`, chờ Work kiểm với `copilot`.
- Phase 3 (agent ghi có duyệt) xong ở Home với `mock`, chờ Work lấy tên tool ghi thật (§3 bước 5–6).
  **Nếu đã chạy xong bước 1–4 của lần 9:** `git pull`, `pnpm install`, `pnpm test`, rồi chỉ làm bước 5–6.
- Kiểm ở Home: `pnpm typecheck` xanh, `pnpm test` 39/39, `pnpm brief` (mock) 3 kịch bản, dashboard trên trình duyệt
  với `brief-ok` (duyệt / từ chối, báo cáo) và `brief-auth` (3 nguồn "Cần bạn xử lý", tab Đăng nhập).

## 2. Home đã đổi gì

| Phần | Thay đổi | Kiểm ở Work |
|---|---|---|
| `apps/web` (mới) | Dashboard React + `@xyflow/react`: sơ đồ orchestrator → agent → MCP server, panel Chi tiết / Duyệt / Đăng nhập, thanh credit, báo cáo. **Dependency mới:** react 19.3.1, react-dom 19.3.1, @xyflow/react 12.12.1, vite 8.3.8 (chỉ build, chạy local). | §3 bước 2–3 |
| `apps/server` | Phục vụ giao diện, `GET /api/auth`, `GET /report`, CSP. Chỉ `127.0.0.1`. | §3 bước 2–3 |
| `packages/core/src/auth.ts` (mới) | Kiểm `gh auth status`, `az account get-access-token --query expiresOn` (ADO với `ADO_AZURE_CONFIG_DIR`). Không trả token. | §3 bước 2 |
| `report.ts` | Báo cáo mock/byok ghi `brief-<ngày>-mock.html` / `-byok.html`: thử mock ở Work không còn ghi đè báo cáo thật. | §3 bước 1 |
| mock | Agent lỗi không phát thêm `agent.completed` (khớp `sdk.ts`). | Không cần |
| Phase 3: `agents.ts` `writerAgents()` | 3 agent ghi: `comms-writer` (Work IQ `create_entity`), `board-writer` (ADO, **không** header chỉ-đọc), `code-writer` (GitHub `create_branch` / `create_pull_request` / `add_issue_comment`). Tên tool ghi **chưa kiểm**. | §3 bước 5 |
| Phase 3: `security.ts` | Writer: tool trong `writeTools` → hỏi người dùng; trong `readTools` → cho; còn lại → từ chối. Agent đọc không đổi. | §3 bước 6 |
| Phase 3: dashboard | Tab **Việc cần làm**: chọn mục báo cáo → giao cho agent ghi → tab Duyệt. `POST /api/act`. | §3 bước 6 |
| `scripts/list-tools.ts` | Cờ `--writers` ghi `docs/mcp-tools-writers.md`. | §3 bước 5 |

Quyền của agent đọc không đổi: `readTools`, danh tính Azure, cờ `--read-only` giữ nguyên. Quyền mới: 3 agent ghi,
mọi lần ghi đều chờ người dùng duyệt.

## 3. Việc ở Work (theo thứ tự)

1. **Cài đặt:** `git pull`, `pnpm install` (có package mới: react, vite, @xyflow/react; ghi lại nếu proxy chặn),
   `pnpm typecheck`, `pnpm test` (45 test). Đỏ thì dừng, ghi lỗi vào work-feedback.
   Tuỳ chọn: `pnpm brief` với `AGENTHUB_RUNTIME=mock` ghi `reports/brief-<ngày>-mock.html`, không đụng báo cáo thật.
2. **Dashboard, chưa chạy (không tốn credit):**
   ```powershell
   $env:AGENTHUB_RUNTIME = "copilot"
   pnpm dashboard
   ```
   Mở `http://127.0.0.1:4317`. Ghi lại:
   - build có lỗi không; trang có hiện sơ đồ 4 agent + 4 MCP server không;
   - tab **Đăng nhập**: trạng thái từng nguồn (github, ado, azure: "Đã đăng nhập" hay lỗi gì, chỉ ghi mã lỗi;
     workiq: "Chưa rõ"). Không chép thời hạn token hay tên tài khoản.
3. **Dashboard, chạy thật (lần 9, khoảng 27–40 AI Credits):** gõ "check việc", bấm **Chạy**. Ghi lại:
   - 4 agent có chuyển "Đang chạy" cùng lúc không; edge có nhấp nháy khi gọi tool không; node nào kết thúc ở trạng
     thái gì (Xong / Có cảnh báo / Cần bạn xử lý / Lỗi);
   - bấm vào từng agent: danh sách tool đã gọi có khớp audit không (chỉ đếm, không chép tham số);
   - khung **Báo cáo** có hiện sau khi xong không; số mục / lỗi / cảnh báo / credits / thời gian;
   - thời gian, AI Credits so với `pnpm brief` lần 8 (55.0s, 33.11);
   - audit `logs/audit-<ngày>.jsonl`: không tool ghi nào `allow`;
   - console trình duyệt (F12) có lỗi đỏ không (chỉ ghi thông báo lỗi, đã xoá dữ liệu thật);
   - tuỳ chọn: thu hẹp cửa sổ < 860px, giao diện có dùng được không.
5. **Tên tool ghi thật (không tốn credit, không gọi tool):** `pnpm list-tools --writers` (runtime `copilot`) →
   `docs/mcp-tools-writers.md`. Ghi vào work-feedback: tên nào trong `writeTools` / `readTools` của writer (agents.ts)
   **không có** trong danh sách, và tên thật tương ứng (gửi tin Teams qua Work IQ, comment / đổi trạng thái work item
   ADO, branch / PR / comment GitHub). Server nào không kết nối được: ghi status + mã lỗi.
6. **Giao việc trên dashboard, chỉ từ chối (khoảng 30 AI Credits trần, thường ít hơn):** sau một lượt check việc, tab
   **Việc cần làm** → chọn một mục GitHub hoặc ADO → **Giao việc** → **Soạn**. Khi tab Duyệt hiện yêu cầu: **bấm Từ chối**
   (không Duyệt; gửi thật chỉ khi người dùng tự quyết). Ghi lại:
   - agent có gọi đúng tool ghi không (tên tool, chỉ tên tham số, không chép nội dung);
   - sau Từ chối, agent có dừng không, kết quả trong Chi tiết; audit có `ask` rồi `reject`;
   - nếu agent không thấy tool nào (tên sai): thông báo lỗi.
7. **Ghi và đẩy về:**
   - `docs/step0-results.md` (thêm dòng "Dashboard runtime copilot"), `docs/work-feedback.md` (mục "lần 9"), dòng `[Work]`
     Phase 2 trong `PLAN.md`.
   - `docs/handoff-claude.md`: §1 trạng thái mới, §3 đề xuất cho Home (góp ý giao diện ghi dạng cấu trúc).
   - `docs/mcp-tools-writers.md` (chỉ tên tool + mô tả, như mcp-tools.md).
   - `git status` chỉ có file trong `docs/` và `PLAN.md`. Commit, push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật; **không chụp màn hình dashboard vào repo**. Áp dụng cả cho commit message.
- Không sửa code (§0). Không dùng `approveAll`, không đổi `readTools`, `writeTools`, `security.ts`, quyền, danh tính.
- Không bấm Duyệt cho agent ghi trong lúc kiểm thử (bước 6). Duyệt = gửi thật tới người khác.
- Không commit `.env`, `logs/`, `reports/`, `apps/web/dist/`, token.
