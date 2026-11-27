# Bàn giao Home → Work (2026-11-27, cho lần chạy Work 11)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [WORK.md](WORK.md) (§5c, §5d, §5e).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, dòng `[Work]` trong `PLAN.md`.
- Mọi bước đi qua UI như người dùng (không gọi thẳng API).
- Gặp lỗi cần sửa code: ghi đề xuất vào `docs/work-feedback.md` (lệnh, file nghi ngờ, mã lỗi đã xoá dữ liệu thật).

## 1. Trạng thái

- Lần 10: dashboard, `list-tools --writers`, mục rỗng đạt. Giao việc bị chặn (không có mục ADO/GitHub `actionRequired`).
  QA chưa chạy lại. Home đã làm hết §3 của handoff-claude lần 10, và thêm 3 việc không cần Work (§2).
- Kiểm ở Home: `pnpm typecheck` xanh, `pnpm test` 57/57; dashboard mock trên trình duyệt: giao việc mục ADO ở nhóm
  "Mục khác", Từ chối kèm lý do (hiện ở tab Duyệt, ở mục, trên node, cả sau khi tải lại trang), "Mới" so với ngày trước,
  lấy tiêu chí từ work item.

## 2. Home đã đổi gì

| Phần | Thay đổi | Kiểm ở Work |
|---|---|---|
| Tab Việc cần làm | Nhóm "Mục khác có agent ghi" (đóng sẵn, có số mục): mục ADO/GitHub/Teams/Outlook không "cần xử lý". Khối kết quả trên mục đã giao: đang soạn / chờ duyệt / lỗi / "Không có gì được gửi (bạn đã từ chối N yêu cầu: <lý do>)" / "Đã gửi". | bước 3 |
| Tab Duyệt | "Đã xử lý": quyết định, giờ, agent → tool, lý do, tham số (mở `Tham số`). | bước 3 |
| board-writer | **Đổi quyền (chặt hơn):** chỉ `wit_work_item_comment_write` action `add`/`update`, `wit_work_item_write` action `update`. Action khác (vd. `create`) bị gate từ chối, không tới hàng duyệt. | bước 3 |
| code-reader | Luật tên tool đặt trong system prompt (lần 8–10 đều có 1 `deny` đoán tên). | bước 2 |
| "Có gì mới" (mới) | Mỗi lần check việc ghi thêm `reports/brief-<ngày>.json` (chỉ items, không commit). Mục không có trong brief ngày gần nhất trước đó được gắn "Mới". Lần đầu chưa có file cũ: không gắn gì. | bước 2 |
| Lấy tiêu chí từ ADO (mới) | Tab Nghiệm thu: nhập số work item → **Lấy tiêu chí**. Agent `ac-reader` (đọc, header `X-MCP-Readonly`, chỉ `ado-wit_work_item`) đọc trường Acceptance Criteria. | bước 5 |

## 3. Việc ở Work (theo thứ tự)

1. **Cài đặt:** `git pull`, `corepack pnpm install`, `corepack pnpm typecheck`, `corepack pnpm test` (57 test). Đỏ thì
   dừng. Rồi `$env:AGENTHUB_RUNTIME = "copilot"; corepack pnpm dashboard`.
2. **Check việc** (khoảng 31 AI Credits): ghi thời gian, credit, số mục, audit `allow`/`deny`. Ghi riêng: code-reader còn
   `deny` đoán tên không (lần 8–10: 1 lần). Báo cáo có dòng "N mới so với <ngày>" không (cần file `brief-<ngày trước>.json`:
   nếu hôm trước chưa có thì ghi "chưa có file cũ", kiểm lại lần sau).
3. **Giao việc board-writer, chỉ Từ chối** (trần 30 AI Credits): tab **Việc cần làm** → mở **Mục khác có agent ghi** →
   chọn 1 mục Azure DevOps (người dùng chọn mục và lời giao) → **Giao việc** → **Soạn**. Ở tab **Duyệt**: kiểm đủ tham số,
   gõ lý do, **Từ chối**. **Không bấm Duyệt.** Ghi lại:
   - tên tool + **tên tham số và giá trị `action`** (không chép nội dung comment, id thật);
   - "Đã xử lý" ở tab Duyệt có quyết định, giờ, lý do, tham số;
   - mục đã giao ở Việc cần làm hiện "Không có gì được gửi (bạn đã từ chối 1 yêu cầu: <lý do>)", kể cả sau khi bấm
     **Đóng** form và sau khi tải lại trang; node board-writer ghi "Bị từ chối 1 yêu cầu, không gửi gì";
   - audit: dòng `ask` rồi `reject` với `reason` = lý do; không có `allow` cho tool ghi;
   - nếu agent gọi action bị chặn (vd. `create`): dòng `deny` + lý do, có hiện trong Chi tiết của node không.
4. **Nghiệm thu lại** (trần 30 AI Credits): tab **Nghiệm thu**, URL mặc định + 3 tiêu chí mẫu. Ghi lại: tool gọi tuần tự
   không, `browser_video_chapter` có lỗi không, `ac-*.png` có dính lớp phủ không, chỉ `qa.webm` hay còn `qa-*.webm`, báo
   cáo nhúng video nào, thanh credit có cộng phần QA không, thời gian, credit, kết quả từng tiêu chí.
5. **Lấy tiêu chí từ work item** (trần 30 AI Credits, tuỳ chọn nếu có work item có Acceptance Criteria): nhập số work item
   (người dùng chọn) → **Lấy tiêu chí**. Ghi lại: số tiêu chí lấy được, có khớp trường trên ADO không (chỉ ghi khớp /
   không khớp, không chép nội dung), lỗi nếu có, credit. Bấm **Dùng các tiêu chí này**: form có điền đúng không.
   Không cần chạy nghiệm thu với các tiêu chí này.
6. **Tổng credit lần 11.**
7. **Ghi và đẩy về:** `docs/step0-results.md`, `docs/work-feedback.md` (mục "lần 11"), dòng `[Work]` Phase 3, 4, 5 trong
   `PLAN.md`, `docs/handoff-claude.md` (§1 trạng thái, §3 đề xuất). `git status` chỉ có file trong `docs/` và `PLAN.md`.
   Commit, push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật; **không chụp màn hình dashboard hay báo cáo vào repo**. Áp dụng cả cho commit message.
- Không sửa code (§0). Không dùng `approveAll`, không đổi `readTools`, `writeTools`, `allowedActions`, `security.ts`, quyền, danh tính.
- Không bấm Duyệt cho agent ghi (bước 3). Duyệt = gửi thật tới người khác.
- Không commit `.env`, `logs/`, `reports/` (cả `brief-*.json`), `apps/web/dist/`, token.
