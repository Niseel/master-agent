# Bàn giao Home → Work (2026-11-28, cho lần chạy Work 13: kiểm Milestone 1)

> Cho Copilot agent mode ở Work. Đọc kèm: [AGENTS.md](../AGENTS.md), [milestone-1.md](milestone-1.md) (scope + tiến độ),
> [WORK.md](WORK.md) (§5c, §5d, §5e, §5f).
> Bàn giao chiều ngược lại (Work → Home): [handoff-claude.md](handoff-claude.md).
> Lần 12 chưa chạy: các bước của nó đã gộp vào đây.

## 0. Vai trò

**Work chỉ chạy app và kiểm chứng. Không sửa code.** Claude Code ở Home viết toàn bộ code (AGENTS.md).

- Không sửa: `apps/`, `packages/`, `scripts/`, `fixtures/`, `evals/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, `docs/mcp-tools.md`, dòng `[Work]` trong `PLAN.md`.
- Mọi bước đi qua UI như người dùng, hoặc qua lệnh `corepack pnpm` ghi dưới đây.
- **Không commit `agenthub.local.json`** (có tên org, project, workspace). Đã có trong `.gitignore`.

## 1. Home đã làm gì (mock, 63 test xanh)

M1 ở Home xong theo [milestone-1.md](milestone-1.md) §8:
- **Card việc cần làm** (khung dưới sơ đồ): gộp trùng giữa nguồn, xếp ô Eisenhower, todo list sửa được, Đã xong / Ẩn,
  "Cập nhật mới", Xuất Markdown.
- Agent thứ 5 **ADO Repos + Pipelines** dùng chung cổng ADO.
- **Chọn khoảng thời gian, agent và trần credit** trên thanh trên. Trần mặc định là 150 (5 agent × 30); đây là trần, không phải số tiêu.
- **Cổng và agent trên UI**: nút "＋ Thêm cổng / agent", tab **Cấu hình**, nối dây, "Lấy danh sách tool", tick tool.
- **Đăng nhập trên UI**: tab **Đăng nhập** có nút cho từng cổng; mã thiết bị và link hiện trên UI.
- **Eval**: `pnpm eval`.

Chưa kiểm với dịch vụ thật: mọi thứ ở §2 dưới đây.

## 2. Việc ở Work (theo thứ tự)

1. **Cài đặt:** `git pull`, `corepack pnpm install`, `corepack pnpm typecheck`, `corepack pnpm test` (63 test).
   Có gói mới: `driver.js`, `deepeval`, `@napi-rs/keyring` (thư viện native, bản dựng sẵn cho Windows), `zod`. Nếu registry
   công ty chặn gói nào thì ghi tên gói + mã lỗi và dừng. Test đỏ thì dừng.
   Ghi thêm: lúc cài có cảnh báo "deprecated @github/copilot-sdk … migrate to @microsoft/copilot-sdk" không.
2. **Mở dashboard thật:** `$env:AGENTHUB_RUNTIME = "copilot"; corepack pnpm dashboard`. Chưa có `agenthub.local.json` thì
   sơ đồ phải giống trước: 4 cổng, 5 agent, giá trị lấy từ `.env`. Ghi: sơ đồ có đúng 4 cổng (nhãn MCP) và 5 agent (nhãn Agent) không.
3. **Tab Đăng nhập** (0 credit). Ghi trạng thái từng cổng (Đã đăng nhập / Lỗi / Chưa rõ), chỉ tên trạng thái, không chép
   tên tài khoản. Nếu một cổng Microsoft hoặc GitHub đang Lỗi: **người dùng** bấm nút đăng nhập. Ghi lại:
   - trình duyệt có tự mở không; nếu dùng "Dùng mã thiết bị": mã và link có hiện trên UI không;
   - sau khi xong, chip có tự chuyển xanh không;
   - lỗi nếu có (dòng trong khung xám dưới cổng, đã xoá dữ liệu thật).

   **Không bấm Đăng xuất**, trừ khi người dùng muốn thử (nó đăng xuất `az` / `gh` của cả máy).
   Nút "Chấp nhận điều khoản Work IQ" chỉ bấm khi người dùng đồng ý.
4. **Tab Cấu hình → cổng Azure DevOps → "Lấy danh sách tool"** (0 credit). Ghi:
   - số tool, số tool bị khoá (nhãn "ghi · khoá");
   - tên các tool khoá;
   - có `repo_pull_request`, `pipelines_build` không;
   - thời gian chờ.

   Làm tương tự với GitHub và Azure Monitor. **Không bỏ tick tool nào** (giữ mặc định), trừ khi người dùng muốn.
5. **Check việc** (trần 150 AI Credits, thực tế khoảng 35–45): khoảng thời gian "24 giờ qua", đủ 5 agent, bấm **Chạy**. Ghi:
   - tổng thời gian, tổng credit, **credit và thời gian từng agent** (bấm từng node, tab Chi tiết);
   - ADO Repos + Pipelines: có lời gọi `repo_pull_request` / `pipelines_build` không, có `deny` không;
   - số card ở Cần làm / Mục khác, có dải "Nghi lừa đảo" không;
   - số card có hơn 1 nguồn (gộp trùng). Đếm theo nhãn nguồn trên card; chỉ ghi số;
   - người dùng đánh giá nhanh: card nào sai ô Eisenhower hoặc không phải việc cần làm. Chỉ ghi số lượng và kiểu sai,
     không chép nội dung;
   - "N mới so với <ngày>" (lần đầu sau đổi schema sẽ coi mọi card là mới: bình thường).
6. **Thao tác card:** mở 1 card, sửa 1 bước todo, gạch 1 bước, thêm 1 bước, bấm **Đã xong**, tải lại trang. Card còn ở
   Đã xong và todo giữ nguyên không. Bấm **Xuất Markdown**: có sao chép được không. Không dán nội dung vào repo.
7. **Gọi thẳng tool:** `corepack pnpm wit <số>` (người dùng chọn work item). Ghi:
   - dòng đầu là "Đọc thẳng…" hay "để model đọc" (nếu là "để model đọc": chép dòng `✗`, đã xoá dữ liệu thật);
   - `AI Credits: …`;
   - tên các trường có giá trị và các trường ra `–`.
8. **Model có trong Copilot công ty:** bộ chọn model của Copilot Chat trong VS Code. Ghi tên các model và hệ số giá
   (`1x`, `0.33x`…), có Auto không, có chọn effort không.
9. **Eval nháp (tuỳ chọn, trần khoảng 120 AI Credits):** `corepack pnpm eval --drafts`. Chạy 1 Task mẫu, dữ liệu tự tạo, 3 agent + judge.
   Ghi:
   - điểm 4 metric;
   - credit;
   - lỗi nếu có;
   - file `evals/results/*.json`: chỉ có điểm, không có dữ liệu công ty, được commit.
10. **Ghi và đẩy về:**
    - `docs/work-feedback.md`, mục "lần 13 (kiểm M1)": kết quả bước 1–9;
    - `docs/mcp-tools.md` nếu chạy `pnpm list-tools`;
    - dòng `[Work]` trong `PLAN.md`;
    - `docs/handoff-claude.md` §1.

    `git status` chỉ có file trong `docs/`, `PLAN.md`, `evals/results/`. Commit, push.

## 3. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace, email; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật. **Không chụp màn hình dashboard hay báo cáo vào repo.** Áp dụng cả cho commit message.
- Không sửa code. Không dùng `approveAll`, không đổi `security.ts`, quyền, danh tính.
- Không commit `.env`, `logs/`, `reports/` (cả `brief-*.json`, `cards-state.json`), `agenthub.local.json`, `apps/web/dist/`, token.
