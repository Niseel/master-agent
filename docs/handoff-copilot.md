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

## 1. Home đã làm gì (mock, 64 test xanh)

M1 ở Home xong theo [milestone-1.md](milestone-1.md) §8:
- **Card việc cần làm** (khung dưới sơ đồ): gộp trùng giữa nguồn, xếp ô Eisenhower, todo list sửa được, Đã xong / Ẩn,
  "Cập nhật mới", Xuất Markdown.
- Agent thứ 5 **ADO Repos + Pipelines** dùng chung cổng ADO.
- **Chọn khoảng thời gian, agent và trần credit** trên thanh trên. Trần mặc định là 150 (5 agent × 30); đây là trần, không phải số tiêu.
- **Cổng và agent trên UI**: nút "＋ Thêm cổng / agent", tab **Cấu hình**, nối dây, "Lấy danh sách tool", tick tool.
- **Đăng nhập trên UI**: tab **Đăng nhập** có nút cho từng cổng; mã thiết bị và link hiện trên UI.
- **Eval**: `pnpm eval`.
- **SDK v2**: `@github/copilot-sdk` 1.0.34 (deprecated) đổi sang `@microsoft/copilot-sdk` 2.0.4. Hành vi giữ nguyên
  (gate 2 lớp, chỉ tool trong allowlist, trần credit từng agent, gọi thẳng tool cho wit-reader). Ở Home chỉ kiểm được
  mock và runtime khởi động / tắt; lời gọi Copilot thật kiểm ở §2a.

Chưa kiểm với dịch vụ thật: mọi thứ ở §2 dưới đây.

## 2. Việc ở Work (theo thứ tự)

1. **Cài đặt:** `git pull`, `corepack pnpm install`, `corepack pnpm typecheck`, `corepack pnpm test` (64 test).
   Có gói mới: `driver.js`, `deepeval`, `@napi-rs/keyring` (thư viện native, bản dựng sẵn cho Windows), `zod`,
   `@microsoft/copilot-sdk` (+ `@microsoft/copilot-sdk-win32-x64`, `koffi`). Nếu registry công ty chặn gói nào thì ghi
   tên gói + mã lỗi và dừng. Test đỏ thì dừng. Xong bước này thì làm **§2a** trước bước 2.
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

## 2a. SDK v2 (`@microsoft/copilot-sdk` 2.0.4): làm ngay sau bước 1

Mọi lệnh dưới đây chạy với `$env:AGENTHUB_RUNTIME = "copilot"`. Lỗi kiểu "protocol", "negotiation" hoặc "spawn" ở bất kỳ
bước nào: chép nguyên dòng lỗi (đã xoá dữ liệu thật), ghi vào work-feedback và dừng §2a.

1. **Cài** (đã chạy ở bước 1). Ghi:
   - còn cảnh báo `deprecated` nào không (chỉ tên gói);
   - pnpm báo "Ignored build scripts: … koffi …" là bình thường: koffi chỉ dùng khi chạy runtime trong process, Agent Hub
     chạy runtime ở process riêng.
2. **Model chỉ thấy tool trong allowlist** (0 credit, không gửi prompt):
   `corepack pnpm smoke comms-reader --tools`, rồi lần lượt `board-reader`, `adorepo-reader`, `code-reader`, `cloud-reader`.
   Ghi cho từng agent:
   - dòng `auth:`: `isAuthenticated` và `authType`. **Không chép `login`, `host`**;
   - số tool "model thấy" và dòng cuối: "Tất cả trong allowlist." hay "NGOÀI allowlist: …" (chép tên tool);
   - mã thoát (`$LASTEXITCODE`, 0 hoặc 1);
   - board-reader / adorepo-reader: cổng ADO có kết nối không, có mở trình duyệt không (đăng nhập Entra phải đi qua `az`, không hỏi).
3. **Một session thật** (trần 30 AI Credits): `corepack pnpm smoke` (comms-reader). Ghi:
   - các dòng `[gate] <tool> → allow|deny`: tên tool có dạng `<server>-<tool>` không (ví dụ `workiq-…`), có `deny` không;
   - có cặp `[tool.execution_start]` / `[tool.execution_complete]` không, `success` là true hay false;
   - có `[session.usage_checkpoint]` không; chép `totalNanoAiu` của dòng cuối cùng;
   - có `[session_limits_exhausted.requested]` không;
   - `=== reply ===` có nội dung không (chỉ ghi có / không, không chép nội dung).
4. **Credit:** làm cùng bước 5 của §2 (check việc). Ghi thêm:
   - có agent nào lỗi về `maxAiCredits` không (trần mỗi agent phải ≥ 30);
   - nếu người dùng xem được mức dùng Copilot trên GitHub (Settings → Copilot / Billing): số trước và sau lượt chạy, để so
     với tổng credit trên dashboard. Dashboard đang quy đổi 1 AI Credit = 1e9 nano-AIU, chưa kiểm ở Work.
5. **Gọi thẳng tool:** làm cùng bước 7 của §2 (`corepack pnpm wit <số>`). Dòng đầu phải là "Đọc thẳng work item…".
6. **Ghi:** `docs/work-feedback.md`, mục "lần 13 §2a (SDK v2)"; dòng `[Work] Lần 13 §2a` trong `PLAN.md`.

## 3. Ràng buộc

- Không có dữ liệu công ty trong repo: không tên org, project, tenant, tài khoản, workspace, email; không nội dung mail,
  chat, work item, log, câu KQL/WIQL thật. **Không chụp màn hình dashboard hay báo cáo vào repo.** Áp dụng cả cho commit message.
- Không sửa code. Không dùng `approveAll`, không đổi `security.ts`, quyền, danh tính.
- Không commit `.env`, `logs/`, `reports/` (cả `brief-*.json`, `cards-state.json`), `agenthub.local.json`, `apps/web/dist/`, token.
