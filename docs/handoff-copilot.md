# Bàn giao Home → Work (2026-11-28, cho lần chạy Work 12)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [WORK.md](WORK.md) (§5c, §5d, §5e).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md) (§3a: Home đã làm gì cho lần 11).

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, dòng `[Work]` trong `PLAN.md`.
- Mọi bước đi qua UI như người dùng (không gọi thẳng API).
- Gặp lỗi cần sửa code: ghi đề xuất vào `docs/work-feedback.md` (lệnh, file nghi ngờ, mã lỗi đã xoá dữ liệu thật).

## 1. Trạng thái

- Lần 11: check việc, Từ chối (thay bằng comms-writer), nghiệm thu lại, lấy tiêu chí đều chạy được. Còn: board-writer
  chưa kiểm (brief không có mục ADO), comms-writer thử gửi lại sau Từ chối, ảnh QA trùng nhau, tiêu chí bị diễn đạt lại.
- Home đã làm hết §3 mục 1–5 của handoff-claude lần 11 (chi tiết: handoff-claude §3a). Kiểm ở Home: `pnpm typecheck`
  xanh, `pnpm test` 62/62; dashboard mock: giao theo số work item → Từ chối → kết quả trên form; comms-writer Từ chối
  → lần gửi lại bị gate chặn, chỉ 1 yêu cầu duyệt; lấy tiêu chí ra nguyên văn trường ADO.

## 2. Home đã đổi gì

| Phần | Thay đổi | Kiểm ở Work |
|---|---|---|
| Tab Việc cần làm | Khối **Giao theo số work item (Cập nhật ADO)** ở cuối tab (có cả khi chưa check việc): nhập số + lời giao → **Soạn**. Kết quả hiện ngay dưới form. | bước 3 |
| Gate agent ghi | **Đổi quyền (chặt hơn):** sau một lần Từ chối, mọi tool ghi khác của agent đó trong cùng lượt bị `deny` (lý do "Người dùng đã từ chối một yêu cầu ghi trong lượt này…"), không tới hàng duyệt. | bước 3, 4 |
| comms-writer | Prompt nêu đúng tên tool. Người nhận lấy từ lời giao (ô lời giao có gợi ý "Ghi rõ người nhận (email)…"). Thiếu người nhận thì không soạn, nói rõ. | bước 4 |
| Mục "không gửi gì" | Thêm câu giải thích của agent ("Agent: …") và "Gate chặn N lần gọi". | bước 3, 4 |
| Giao diện | "Thông báo" không còn JSON thô. Chip `workiq` xanh sau khi có lời gọi thành công. Khung báo cáo không tải lại sau lượt giao việc/nghiệm thu (ERR_ABORTED). | bước 2–6 |
| Lấy tiêu chí | Runtime gọi thẳng `wit_work_item` (không qua model) rồi tách trường bằng code: **nguyên văn**, thường 0 credit. Chi tiết node ghi "Đọc thẳng trường Acceptance Criteria…". Gọi thẳng lỗi thì ghi "Không đọc thẳng được work item: để model đọc" và model đọc như cũ. | bước 5 |
| Nghiệm thu | Chụp ảnh theo phần tử của từng tiêu chí (`target` + `element`, hoặc `fullPage`). Thuộc tính HTML (`target=_blank`) kiểm bằng CSS selector trong `target` của `browser_snapshot`. | bước 6 |

## 3. Việc ở Work (theo thứ tự)

1. **Cài đặt:** `git pull`, `corepack pnpm install`, `corepack pnpm typecheck`, `corepack pnpm test` (62 test). Đỏ thì
   dừng. Rồi `$env:AGENTHUB_RUNTIME = "copilot"; corepack pnpm dashboard`.
2. **Check việc** (khoảng 27 AI Credits): ghi thời gian, credit, số mục, audit `allow`/`deny`, board-reader bao nhiêu mục.
   **"Có gì mới"**: báo cáo có dòng "N mới so với <ngày>" không, mục nào có chip "Mới" (chỉ ghi số). Cần
   `reports/brief-<ngày trước>.json` (lần 11 đã tạo): nếu không có thì ghi "chưa có file cũ".
   Ghi thêm: phần "Thông báo" của các node còn JSON thô không; chip `workiq` có xanh sau khi chạy không; console còn
   `ERR_ABORTED` không.
3. **board-writer theo số work item, chỉ Từ chối** (trần 30 AI Credits): tab **Việc cần làm** → mở **Giao theo số
   work item** → nhập số work item (người dùng chọn) và lời giao (người dùng viết, ví dụ thêm một comment) → **Soạn**.
   Ở tab **Duyệt**: kiểm đủ tham số, gõ lý do, **Từ chối**. **Không bấm Duyệt.** Ghi lại:
   - tên tool + **tên tham số và giá trị `action`** (không chép nội dung comment, id thật);
   - có đúng 1 yêu cầu duyệt không (lần gửi lại phải bị gate chặn, không hiện ở tab Duyệt);
   - kết quả dưới form: "Không có gì được gửi (bạn đã từ chối 1 yêu cầu: <lý do>)", có dòng "Agent: …" không, có
     "Gate chặn N lần gọi" không; còn sau khi tải lại trang không; node board-writer ghi gì;
   - audit: `ask` → `reject` (`reason` = lý do); nếu agent thử lại: `deny` với lý do "Người dùng đã từ chối…";
   - nếu agent gọi action bị chặn (vd. `create`): dòng `deny` + lý do.
4. **comms-writer dừng sau Từ chối** (trần 30 AI Credits, tuỳ chọn nếu bước 3 đã thấy gate chặn lần gửi lại):
   giao 1 mục Teams/Outlook, lời giao có email người nhận (dùng email của chính người dùng; không ghi email vào repo)
   → Soạn → Từ chối. Ghi lại: còn tên đoán `call_function_placeholder` không, số yêu cầu duyệt (mong đợi 1), audit.
   Nếu thời gian cho phép: giao lại **không** ghi người nhận → mục có ghi "Agent: Thiếu người nhận…" không.
5. **Lấy tiêu chí lại** (cùng work item lần 11, người dùng chọn): ghi số tiêu chí, **khớp nguyên văn** với trường trên
   ADO không (chỉ ghi khớp / không khớp, không chép nội dung), Chi tiết node ac-reader ghi "Đọc thẳng…" hay "để model
   đọc" (nếu "để model đọc": chép lỗi của lời gọi `wit_work_item` trong Chi tiết, đã xoá dữ liệu thật), credit (mong đợi
   ~0 nếu đọc thẳng), audit.
6. **Nghiệm thu với tiêu chí ADO** (trần 30 AI Credits): bấm **Dùng các tiêu chí này**, URL là trang staging/local của
   story đó nếu có (người dùng chọn); không có thì dùng URL mặc định + 3 tiêu chí mẫu. Ghi lại: các `ac-*.png` có khác
   nhau không (hash), tham số `browser_take_screenshot` (`target`/`element`/`fullPage`), tiêu chí "link mở tab mới" (nếu
   dùng tiêu chí mẫu) ra Đạt/Không đạt hay vẫn "Không kiểm được", tham số `browser_snapshot` có `target` là CSS selector
   không và có lỗi không, thời gian, credit, kết quả từng tiêu chí.
7. **Tổng credit lần 12.**
8. **Ghi và đẩy về:** `docs/step0-results.md`, `docs/work-feedback.md` (mục "lần 12"), dòng `[Work]` Phase 3, 4, 5 trong
   `PLAN.md`, `docs/handoff-claude.md` (§1 trạng thái, §3 đề xuất). `git status` chỉ có file trong `docs/` và `PLAN.md`.
   Commit, push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace, email; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật; **không chụp màn hình dashboard hay báo cáo vào repo**. Áp dụng cả cho commit message.
- Không sửa code (§0). Không dùng `approveAll`, không đổi `readTools`, `writeTools`, `allowedActions`, `security.ts`, quyền, danh tính.
- Không bấm Duyệt cho agent ghi (bước 3, 4). Duyệt = gửi thật tới người khác.
- Không commit `.env`, `logs/`, `reports/` (cả `brief-*.json`), `apps/web/dist/`, token.
