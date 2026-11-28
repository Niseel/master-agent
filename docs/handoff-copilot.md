# Bàn giao Home → Work (2026-11-28, cho lần chạy Work 12: dữ kiện cho Milestone 1)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [milestone-1.md](milestone-1.md) (scope mới),
> [WORK.md](WORK.md) (§4, §5c).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, `docs/mcp-tools.md`, dòng `[Work]` trong `PLAN.md`.
- Mọi bước đi qua UI như người dùng hoặc qua lệnh `corepack pnpm` ghi dưới đây.

## 1. Thay đổi hướng

Sau audit ngày 2026-11-28, Thành chốt lại scope ([milestone-1.md](milestone-1.md)):

- **Đã xoá** agent ghi (Giao việc, tab Duyệt), tab Nghiệm thu (agent `qa`), `pnpm playwright-smoke`. Gate chỉ đọc:
  mọi tool ghi bị chặn. ac-reader thành wit-reader (`pnpm wit <số>`), đọc đủ trường work item.
- M1 = quản lý cổng MCP / agent trên UI, đăng nhập trên UI, check việc ra danh sách việc cần làm, eval bằng deepeval.

Lần 12 chỉ thu dữ kiện mà Home không tự lấy được.

## 2. Việc ở Work (theo thứ tự)

1. **Cài đặt:** `git pull`, `corepack pnpm install` (có gói mới `driver.js`), `corepack pnpm typecheck`,
   `corepack pnpm test` (45 test). Nếu registry chặn `driver.js` thì ghi mã lỗi và dừng. Test đỏ thì dừng.
2. **Danh sách tool ADO (0 credit):** `$env:AGENTHUB_RUNTIME = "copilot"; corepack pnpm list-tools` ghi ra
   `docs/mcp-tools.md`. Ghi lại các tên tool của cổng ADO cho Repos / Pull Request / Pipeline (chỉ tên tool, không ghi dữ liệu).
3. **Check việc làm mốc** (khoảng 30 AI Credits): `corepack pnpm dashboard`, bấm **Chạy**. Ghi lại:
   - tổng thời gian và tổng credit;
   - **credit và thời gian từng agent** (bấm từng node, xem Chi tiết);
   - số mục;
   - "N mới so với <ngày>" (chỉ ghi số).
4. **Gọi thẳng tool có chạy không** (dữ kiện quan trọng nhất cho cách giảm credit ở milestone-1 §6):
   `corepack pnpm wit <số>`, với số work item do người dùng chọn. Lệnh chỉ in ra terminal; không chép kết quả vào repo.
   Ghi lại:
   - dòng đầu là "Đọc thẳng work item…" hay "Không đọc thẳng được work item: để model đọc". Nếu là "để model đọc":
     chép dòng `✗` (lỗi của lời gọi `wit_work_item`), đã xoá dữ liệu thật;
   - dòng `AI Credits: …`;
   - **tên** các trường in ra có giá trị và các trường ra `–` (chỉ ghi tên trường, không ghi giá trị);
   - acceptanceCriteria có khớp nguyên văn với trường trên ADO không (chỉ ghi khớp hay không khớp).
5. **Model có trong Copilot công ty:** mở bộ chọn model của Copilot Chat trong VS Code. Ghi tên các model và hệ số giá
   (ví dụ `1x`, `0.33x`) nếu bộ chọn có hiện. Ghi thêm: có chế độ Auto không, có chọn effort không.
6. **Ghi và đẩy về:**
   - `docs/work-feedback.md`, mục "lần 12 (dữ kiện M1)": kết quả bước 1–5;
   - `docs/mcp-tools.md`;
   - `docs/handoff-claude.md` §1.

   `git status` chỉ có file trong `docs/` và `PLAN.md`. Commit, push.

## 3. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace, email; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật. **Không chụp màn hình dashboard hay báo cáo vào repo.** Áp dụng cả cho commit message.
- Không sửa code. Không dùng `approveAll`, không đổi `readTools`, `security.ts`, quyền, danh tính.
- Không commit `.env`, `logs/`, `reports/` (cả `brief-*.json`), `apps/web/dist/`, token.
