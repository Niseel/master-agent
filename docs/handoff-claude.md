# Bàn giao Work → Home (2026-11-26, lần 7)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục "2026-11-26 (lần 7)"),
> [step0-results.md](step0-results.md) (dòng 9).
> Bàn giao trước: 2026-11-26 lần 6 (Home xong mục 1–3, 5, 6; base `d33a9a0`).

## 1. Trạng thái

> **Home 2026-11-26:** xong §3 mục 1–4 (commit `7da37bb`, `e93dce3`). Việc Work tiếp theo:
> [handoff-copilot.md](handoff-copilot.md).

- Base `d33a9a0` (= `origin/main`). Work đã pull, `pnpm install` exit 0, `pnpm typecheck` sạch, `pnpm test` 33/33.
- Mock (`brief-auth`, `brief-ok`, `brief-failures`): khớp số liệu Home ghi trong handoff-copilot.md §1.
  `brief-auth`: cloud-reader 401 ở "Không lấy được" kèm gợi ý mới.
- User đã `az logout` + `az login`, kiểm bằng `az account get-access-token` trước khi chạy.
- `pnpm brief` runtime `copilot` lần 7: exit 0, 75.7s (tổng lệnh 77.3s), 34.59/120 AI Credits, 8 mục (3 cần xử lý),
  0 lỗi, 2 cảnh báo. Audit 29 bản ghi, 27 `allow`, 2 `deny`, không tool ghi nào được `allow`.
- **B (401) đã hết:** cloud-reader 12 lần gọi, không lỗi tool (`monitor_*` ×9: workspace_list ×1, table_list ×2,
  workspace_log_query ×3, activitylog_list ×3), đọc cả 2 workspace. 50.5s (lần 5: 48.0s).
- **C (báo cáo giấu lỗi) đã sửa:** kiểm bằng mock `brief-auth` (lần 7 thật không có lỗi chặn để kiểm).
- **A (đoán tên tool) chưa hết:** code-reader không còn `github-list_workflow_runs`, nhưng đoán 2 tên khác:
  `github-list_workflow_runs_placeholder` (args `{}`) và `github-list` (args của `actions_list`). Cả 2 bị `deny`;
  model tự sửa sang `github-actions_list` ×2. code-reader 20.6s (lần 6: 20.4s).
- **E (mới): `deny` bị đếm thêm ở "Cảnh báo".** Runtime thật sinh `tool.completed` có
  `error: "Denied by preToolUse hook: <reason>"`. Lỗi này không khớp `HINTS`, nên nhánh mới của `summarize()` đưa vào
  "Cảnh báo". 2 cảnh báo của lần 7 chính là 2 dòng "Bị chặn". Mock không tái hiện được: `mock.ts` sinh
  `tool.completed ok:false` không có `error`.

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. Vẫn đoán tên tool (2 `deny`), tự sửa |
| ADO Remote MCP (`board-reader`) | ok |
| Work IQ (`comms-reader`) | ok |
| Azure MCP (`cloud-reader`) | ok lần 7 (hết 401 sau khi đăng nhập lại) |
| Playwright MCP | ok ở Work |
| `pnpm brief` runtime `copilot` | Lần 7: 75.7s, 34.59/120. Lần 6: 76.3s, 26.88. Lần 5: 49.5s, 40.06. Lần 4: 46.5s, 39.29. Lần 3: 77.4s, 39.25. Lần 2: 60.5s, 44.29 |

## 2. Thay đổi trong commit này (Work)

Chỉ đổi tài liệu. Không đổi code, quyền hay danh tính.

| File | Nội dung |
|---|---|
| `docs/step0-results.md` | Dòng 9: lần 7 |
| `docs/work-feedback.md` | Các mục "2026-11-26 (lần 7)": test + mock, brief lần 7, code-reader đoán tên, `deny` trong "Cảnh báo", gợi ý 403 |
| `PLAN.md` | Tick `[Work]` chạy lại brief sau `az login` |
| `docs/handoff-claude.md` | File này |

## 3. Việc cho Home (theo thứ tự)

Theo CLAUDE.md: sửa mock trước, rồi mới sửa code. Mỗi mục một commit. Chi tiết:
[work-feedback.md](work-feedback.md), các mục "2026-11-26 (lần 7)". Mọi mục phải chạy được end-to-end với `mock` ở Home.

1. **`deny` không tính là cảnh báo.** (Mục E.)
   - Mock trước: `packages/core/src/runtime/mock.ts` (nhánh `deny`, dòng ~53) sinh
     `tool.completed { ok: false, error: "Denied by preToolUse hook: " + reason }`, khớp runtime thật.
   - Làm: `summarize()` trong `report.ts` bỏ lỗi bắt đầu bằng `Denied by preToolUse hook` khỏi `warnings`/`unknown`
     (đã có ở `blocked` qua `message` "Bị chặn: …").
   - Test: `brief-auth` → 0 cảnh báo, "Bị chặn" có `github-list_workflow_runs`.
   - Tuỳ chọn: `apps/cli/src/brief.ts` dòng 38 không in `✗` cho lỗi này (dòng `⛔` đã đủ).
2. **code-reader vẫn đoán tên tool.** (Mục A.) Đề xuất đổi **nội dung reason** của `deny` (không đổi quyết định,
   không đổi `readTools`): với tool không có trong allowlist, reason nêu tool đúng gần nhất hoặc danh sách tool cùng
   server, ví dụ `Workflow run: dùng github-actions_list với method "list_workflow_runs"`. Hook trả reason này cho
   model. Nơi sửa: `decide()` (`security.ts`) hoặc gate trong `runtime/sdk.ts`. Nếu Home thấy không đáng: chấp nhận,
   chi phí ~1 lượt model, gate chặn đúng.
   - Mock: thêm tên đoán sai thứ hai vào `brief-auth` (ví dụ `github-list`) nếu đổi reason.
3. **Tuỳ chọn: console mock.** `brief.ts` dòng 41 in `✓ <agent>` cả khi agent có lỗi `blocking` (thấy ở mock
   `brief-auth`: `✗ cloud-reader: …401` rồi `✓ cloud-reader`). In dấu khác khi `isBlocking()`.
4. **Tuỳ chọn: gợi ý 403.** HINT `InsufficientAccessError|Could not find workspace` còn ghi `az account show`; đổi
   thành `az account get-access-token` cho khớp HINT 401 và `docs/WORK.md`.
5. Sau mỗi bước: `pnpm typecheck` + `pnpm test` xanh với `AGENTHUB_RUNTIME=mock`; `pnpm brief` (mock) mở được báo
   cáo. Thêm dòng `[Home]` lần 7 trong `PLAN.md`. Viết `docs/handoff-copilot.md` mới với đúng việc Work cần kiểm (§4).

## 4. Việc còn lại ở Work

- Sau khi Home xong §3: pull, `pnpm install`, `pnpm typecheck` + `pnpm test`, chạy lại `pnpm brief` runtime `copilot`
  (~27–40 AI Credits): "Cảnh báo" không còn dòng `Denied by preToolUse hook`; đếm số `deny` của code-reader.
- User đối chiếu AI Credits (lần 2: 44.29, lần 3: 39.25, lần 4: 39.29, lần 5: 40.06, lần 6: 26.88, lần 7: 34.59)
  với trang billing công ty.
- Tuỳ chọn: góp ý thiết kế dashboard ([design/dashboard.excalidraw](design/dashboard.excalidraw)).

## 5. Ràng buộc

- Không có dữ liệu công ty trong repo (tên org/project/tenant/tài khoản, nội dung mail/work item). Fixture
  là dữ liệu tự tạo.
- Không dùng `approveAll`; mọi quyết định tool đi qua `decide()` trong `packages/core/src/security.ts`.
- Không thêm tool ghi vào agent `kind: "reader"`. Thay đổi quyền phải ghi rõ trong commit message.
- Giữ `readTools` tường minh, không quay lại `"*"` (heuristic `looksLikeWrite` đoán sai, xem
  `docs/work-feedback.md`).
- Azure MCP phải giữ `--read-only`: gate chỉ thấy tên `azure-monitor`, không thấy lệnh con trong `args.command`.
- Azure MCP giữ `AZURE_TOKEN_CREDENTIALS=AzureCliCredential`: bỏ đi thì credential mặc định có thể đổi danh tính.
- `mcpAuth` chỉ cấp token cho origin trong `ENTRA_MCP`. Thêm server mới thì thêm đúng origin + scope, không
  dùng scope rộng.
- Không commit `.env`, `logs/`, `reports/`, token.
