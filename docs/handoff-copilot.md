# Bàn giao Home → Work (2026-11-26, cho lần chạy Work 10)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [WORK.md](WORK.md) (§5c, §5d, §5e).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, `docs/mcp-tools-writers.md`
  (sinh bằng lệnh), dòng `[Work]` trong `PLAN.md`.
- Gặp lỗi cần sửa code: ghi đề xuất vào `docs/work-feedback.md` (lệnh, file nghi ngờ, mã lỗi đã xoá dữ liệu thật).

## 1. Trạng thái

- Lần 9: Phase 2 đạt; QA 3/3 nhưng có 3 lỗi; giao việc bị chặn vì tên tool ghi ADO sai. Home đã sửa hết (§2).
- **`docs/mcp-tools-writers.md` lần 9 gửi về là bản chép nhầm của `handoff-claude.md`** (hai file giống hệt). Home không
  commit file đó. Cần sinh lại (§3 bước 2).
- Kiểm ở Home: `pnpm typecheck` xanh, `pnpm test` 52/52, mock 3 kịch bản brief + 3 giao việc + 1 nghiệm thu,
  `pnpm dashboard` (script mới) build + chạy với `mock`.

## 2. Home đã đổi gì

| Phần | Thay đổi | Kiểm ở Work |
|---|---|---|
| `package.json` `dashboard` | `tsx scripts/dashboard.ts`: build `apps/web` bằng Vite API rồi mở server. Không gọi `pnpm` lồng, nên `corepack pnpm dashboard` chạy được. | §3 bước 1 |
| board-writer (`agents.ts`) | **Đổi quyền:** `writeTools` = `ado-wit_work_item_comment_write`, `ado-wit_work_item_write` (tên thật lần 9); `readTools` = `ado-wit_work_item` (đọc work item đang sửa). Mỗi lời gọi ghi vẫn chờ duyệt, kèm đủ tham số (`action` hiện ở đó). | §3 bước 3 |
| Agent `qa` (`qa.ts`) | Task: gọi từng tool một; chapter `duration` 1000 + `browser_wait_for` 1.5s trước khi chụp; dừng video/trace/đóng sau tiêu chí cuối; không bấm link `target=_blank`. Báo cáo ưu tiên `qa.webm`, video khác liệt kê riêng. | §3 bước 4 |
| Dashboard | Thanh credit cộng phần của `qa`. `HEAD /qa/*` trả 200/404 như `GET`. | §3 bước 4 |
| Reader | Prompt: "không có gì thì `items: []`". Mục có `title` và `summary` đều rỗng bị bỏ, agent ghi thông báo "Bỏ N mục rỗng". | §3 bước 5 |

## 3. Việc ở Work (theo thứ tự)

1. **Cài đặt:** `git pull`, `corepack pnpm install`, `corepack pnpm typecheck`, `corepack pnpm test` (52 test). Đỏ thì
   dừng, ghi lỗi vào work-feedback. Rồi:
   ```powershell
   $env:AGENTHUB_RUNTIME = "copilot"
   corepack pnpm dashboard
   ```
   Ghi lại: lệnh có chạy thẳng được không (dòng `Đã build apps/web` rồi `Agent Hub API: ...`).
2. **Sinh lại danh sách tool ghi (không tốn credit):** `corepack pnpm list-tools --writers` (runtime `copilot`). Mở
   `docs/mcp-tools-writers.md`: dòng đầu phải là `# MCP tools`, có 3 mục `workiq`, `ado`, `github`. Kiểm có
   `ado-wit_work_item_comment_write`, `ado-wit_work_item_write`, `ado-wit_work_item`. Commit file này (chỉ tên + mô tả).
3. **Giao việc board-writer, chỉ Từ chối (khoảng 30 AI Credits trần, thường ít hơn):** chạy check việc → tab **Việc cần
   làm** → mục Azure DevOps → **Giao việc** (ví dụ "Thêm comment: đã xem, sẽ cập nhật sau") → **Soạn**. Khi tab
   **Duyệt** hiện yêu cầu: **bấm Từ chối**, không bấm Duyệt. Ghi lại:
   - tên tool trong yêu cầu duyệt; **tên tham số và giá trị `action`** (vd. `action: "add"`), không chép nội dung comment
     hay id thật;
   - board-writer có gọi `ado-wit_work_item` trước không (allow, không cần duyệt);
   - sau Từ chối: agent dừng, kết quả trong Chi tiết; audit có dòng `ask` rồi `reject`, không có `allow` cho tool ghi.
4. **Nghiệm thu lại (khoảng 30 AI Credits trần):** tab **Nghiệm thu**, URL mặc định + 3 tiêu chí mẫu. Ghi lại:
   - model có gọi tool tuần tự không (mỗi lượt 1 tool), có tool lỗi không (`browser_video_chapter` lần 9 lỗi);
   - ảnh `ac-*.png` có dính lớp phủ chapter không;
   - chỉ có `qa.webm` hay còn `qa-*.webm`; báo cáo nhúng video nào;
   - thanh credit sau lượt QA có cộng phần QA không (so với số credit QA trong Chi tiết của node qa);
   - thời gian, AI Credits, kết quả từng tiêu chí.
5. **Mục rỗng:** sau check việc ở bước 3, báo cáo còn thẻ rỗng không; Chi tiết của comms-reader có thông báo
   "Bỏ N mục rỗng" không.
6. **Ghi và đẩy về:**
   - `docs/step0-results.md`, `docs/work-feedback.md` (mục "lần 10"), dòng `[Work]` Phase 3 + Phase 4 trong `PLAN.md`.
   - `docs/handoff-claude.md`: §1 trạng thái mới, §3 đề xuất cho Home.
   - `docs/mcp-tools-writers.md` (bước 2).
   - `git status` chỉ có file trong `docs/` và `PLAN.md`. **Kiểm `docs/mcp-tools-writers.md` khác `docs/handoff-claude.md`**
     trước khi commit. Commit, push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật; **không chụp màn hình dashboard hay báo cáo vào repo**. Áp dụng cả cho commit message.
- Không sửa code (§0). Không dùng `approveAll`, không đổi `readTools`, `writeTools`, `security.ts`, quyền, danh tính.
- Không bấm Duyệt cho agent ghi trong lúc kiểm thử (bước 3). Duyệt = gửi thật tới người khác.
- Không commit `.env`, `logs/`, `reports/`, `apps/web/dist/`, token.
