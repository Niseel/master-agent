# Bàn giao Home → Work (2026-11-28, cho lần chạy Work 12: audit MVP)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [demo-mvp.md](demo-mvp.md) (kịch bản + bảng audit),
> [WORK.md](WORK.md) (§5c, §5d, §5e).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md) (§3a: Home đã làm gì cho lần 11).

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, dòng `[Work]` trong `PLAN.md`.
- Mọi bước đi qua UI như người dùng (không gọi thẳng API).
- Gặp lỗi cần sửa code: ghi đề xuất vào `docs/work-feedback.md` (lệnh, file nghi ngờ, mã lỗi đã xoá dữ liệu thật).

## 1. Mục tiêu lần 12

Audit tình trạng hiện tại của MVP: đi hết kịch bản [demo-mvp.md](demo-mvp.md) hai lần, một lần mock (0 credit) và
một lần thật (`copilot`), rồi điền bảng audit. Các điểm còn mở của lần 11 nằm trong lần chạy thật (§3 bước 4–8).

Home đã kiểm: `pnpm typecheck` xanh, `pnpm test` 63/63. Kịch bản mock chạy đủ các bước 0–9 trên dashboard.

## 2. Home đã đổi gì

| Phần | Thay đổi | Kiểm ở Work |
|---|---|---|
| Hướng dẫn (mới) | Nút **Hướng dẫn** trên thanh trên mở tour 11 bước (thư viện `driver.js` 1.14.0, MIT, không phụ thuộc thư viện khác). Tab bên phải tự đổi theo bước. Esc đóng tour. | bước 2, 3 |
| Dừng | Lượt bị **Dừng** không ghi đè `reports/brief-<ngày>.json` (bộ nhớ "Có gì mới"). Báo cáo HTML của ngày vẫn bị ghi đè. | bước 3 |
| Tab Việc cần làm | Khối **Giao theo số work item (Cập nhật ADO)** ở cuối tab (có cả khi chưa check việc). | bước 5 |
| Gate agent ghi | **Đổi quyền (chặt hơn):** sau một lần Từ chối, mọi tool ghi khác của agent đó trong cùng lượt bị `deny` (lý do "Người dùng đã từ chối một yêu cầu ghi trong lượt này…"), không tới hàng duyệt. | bước 5, 6 |
| comms-writer | Prompt nêu đúng tên tool. Người nhận lấy từ lời giao (email). Thiếu người nhận thì không soạn, nói rõ. | bước 6 |
| Mục "không gửi gì" | Thêm câu giải thích của agent ("Agent: …") và "Gate chặn N lần gọi". | bước 5, 6 |
| Giao diện | "Thông báo" không còn JSON thô. Chip `workiq` xanh sau lời gọi thành công. Khung báo cáo không tải lại sau lượt giao việc/nghiệm thu (ERR_ABORTED). | bước 4–8 |
| Lấy tiêu chí | Runtime gọi thẳng `wit_work_item` (không qua model), tách trường bằng code: **nguyên văn**, thường 0 credit. Chi tiết node ghi "Đọc thẳng trường Acceptance Criteria…". Gọi thẳng lỗi thì ghi "Không đọc thẳng được work item: để model đọc". | bước 7 |
| Nghiệm thu | Chụp ảnh theo phần tử (`target` + `element`, hoặc `fullPage`). Thuộc tính HTML (`target=_blank`) kiểm bằng CSS selector trong `target` của `browser_snapshot`. | bước 8 |

## 3. Việc ở Work (theo thứ tự)

1. **Cài đặt:** `git pull`, `corepack pnpm install`, `corepack pnpm typecheck`, `corepack pnpm test` (63 test).
   Có dependency mới `driver.js`. Nếu registry công ty chặn gói này thì ghi mã lỗi (đã xoá dữ liệu thật) và dừng. Đỏ thì dừng.
2. **Demo mock (0 credit):** `$env:AGENTHUB_RUNTIME = "mock"; corepack pnpm dashboard`. Đi các bước 0–9 của
   [demo-mvp.md](demo-mvp.md). So từng bước với cột "Mock: mong đợi", rồi điền cột **Mock** của bảng audit. Ghi lỗi
   console nếu có. Ctrl+C để tắt.
3. **Chạy thật:** `$env:AGENTHUB_RUNTIME = "copilot"; corepack pnpm dashboard`. Đi lại các bước của demo-mvp.md theo
   thứ tự bước 4–8 dưới đây. Mở **Hướng dẫn** một lần khi đã có báo cáo thật: popover có che nội dung quan trọng không.
   Bước **Dừng** (demo bước 9) làm cuối cùng; nó ghi đè báo cáo HTML của ngày. Sau Dừng,
   `reports/brief-<hôm nay>.json` phải còn số mục của lượt check việc đủ (chỉ ghi số).
4. **Check việc** (khoảng 27 AI Credits): ghi thời gian, credit, số mục, audit `allow`/`deny`, board-reader bao nhiêu mục.
   **"Có gì mới"**: báo cáo có dòng "N mới so với <ngày>" không, mục nào có chip "Mới" (chỉ ghi số). Cần
   `reports/brief-<ngày trước>.json` (lần 11 đã tạo). Nếu không có file đó thì ghi "chưa có file cũ".
   Ghi thêm: phần "Thông báo" của các node còn JSON thô không; chip `workiq` có xanh sau khi chạy không; console còn
   `ERR_ABORTED` không.
5. **board-writer theo số work item, chỉ Từ chối** (trần 30 AI Credits): tab **Việc cần làm** → mở **Giao theo số
   work item** → nhập số work item (người dùng chọn) và lời giao (người dùng viết, ví dụ thêm một comment) → **Soạn**.
   Ở tab **Duyệt**: kiểm đủ tham số, gõ lý do, **Từ chối**. **Không bấm Duyệt.** Ghi lại:
   - tên tool, **tên tham số và giá trị `action`** (không chép nội dung comment, không chép id thật);
   - có đúng 1 yêu cầu duyệt không (lần gửi lại phải bị gate chặn, không hiện ở tab Duyệt);
   - kết quả dưới form:
     - có "Không có gì được gửi (bạn đã từ chối 1 yêu cầu: <lý do>)" không;
     - có dòng "Agent: …" không;
     - có "Gate chặn N lần gọi" không;
     - kết quả còn sau khi tải lại trang không;
     - node board-writer ghi gì;
   - audit: `ask` → `reject` (`reason` = lý do); nếu agent thử lại: `deny` với lý do "Người dùng đã từ chối…";
   - nếu agent gọi action bị chặn (ví dụ `create`): dòng `deny` + lý do.
6. **comms-writer dừng sau Từ chối** (trần 30 AI Credits; tuỳ chọn nếu bước 5 đã thấy gate chặn lần gửi lại):
   giao 1 mục Teams/Outlook, lời giao có email người nhận (email của chính người dùng; không ghi email vào repo)
   → Soạn → Từ chối. Ghi lại: còn tên đoán `call_function_placeholder` không, số yêu cầu duyệt (mong đợi 1), audit.
   Nếu thời gian cho phép: giao lại **không** ghi người nhận, rồi xem mục có dòng "Agent: Thiếu người nhận…" không.
7. **Lấy tiêu chí lại** (cùng work item lần 11, người dùng chọn). Ghi lại:
   - số tiêu chí;
   - **khớp nguyên văn** với trường trên ADO không (chỉ ghi khớp hay không khớp, không chép nội dung);
   - Chi tiết node ac-reader ghi "Đọc thẳng…" hay "để model đọc". Nếu "để model đọc": chép lỗi của lời gọi
     `wit_work_item` trong Chi tiết, đã xoá dữ liệu thật;
   - credit (mong đợi khoảng 0 nếu đọc thẳng);
   - audit.
8. **Nghiệm thu với tiêu chí ADO** (trần 30 AI Credits): bấm **Dùng các tiêu chí này**. URL là trang staging/local của
   story đó nếu có (người dùng chọn); không có thì dùng URL mặc định + 3 tiêu chí mẫu. Ghi lại:
   - các `ac-*.png` có khác nhau không (so hash);
   - tham số `browser_take_screenshot` (`target`/`element`/`fullPage`);
   - tiêu chí "link mở tab mới" (nếu dùng tiêu chí mẫu) ra Đạt/Không đạt hay vẫn "Không kiểm được";
   - tham số `browser_snapshot` có `target` là CSS selector không, có lỗi không;
   - thời gian, credit, kết quả từng tiêu chí.
9. **Tổng credit lần 12.**
10. **Ghi và đẩy về:**
    - `docs/work-feedback.md`, mục "lần 12 (audit MVP)": bảng audit của demo-mvp.md (cột Mock, cột Thật), đánh giá
      chung, top 3 vấn đề, rồi chi tiết bước 4–8;
    - `docs/step0-results.md`;
    - dòng `[Work]` Phase 3, 4, 5 trong `PLAN.md`;
    - `docs/handoff-claude.md` (§1 trạng thái, §3 đề xuất).

    `git status` chỉ có file trong `docs/` và `PLAN.md`. Commit, push.

## 4. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace, email; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật; **không chụp màn hình dashboard hay báo cáo vào repo**. Áp dụng cả cho commit message.
- Không sửa code (§0). Không dùng `approveAll`, không đổi `readTools`, `writeTools`, `allowedActions`, `security.ts`, quyền, danh tính.
- Không bấm Duyệt cho agent ghi (bước 5, 6). Duyệt = gửi thật tới người khác.
- Không commit `.env`, `logs/`, `reports/` (cả `brief-*.json`), `apps/web/dist/`, token.
