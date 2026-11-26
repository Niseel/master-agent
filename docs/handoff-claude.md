# Bàn giao Work → Home (2026-11-26, lần 8)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục "2026-11-26 (lần 8)"),
> [step0-results.md](step0-results.md) (dòng 9).
> Bàn giao trước: 2026-11-26 lần 7 (Home xong mục 1–4; base `d33a9a0`).

## 1. Trạng thái

> **Home 2026-11-26:** xong §3 mục 1 (mock), mục 2 chấp nhận, mục 3 (đánh số handoff theo lần chạy Work). Thêm: Phase 2
> dashboard (`pnpm dashboard`). Việc Work tiếp theo: [handoff-copilot.md](handoff-copilot.md) (lần 9).

- Base `f100b61` (= `origin/main`). Work đã pull, `pnpm install` exit 0, `pnpm typecheck` sạch, `pnpm test` 34/34.
- Mock (`brief-auth`, `brief-ok`, `brief-failures`): khớp số liệu Home ghi trong handoff-copilot.md §1.
  `brief-auth`: 0 cảnh báo, 4 dòng "Đã chặn", console `⚠` cho 3 agent lỗi chặn.
- `pnpm brief` runtime `copilot` lần 8: exit 0, 55.0s (tổng lệnh 56.7s), 33.11/120 AI Credits, 9 mục (2 cần xử lý),
  0 lỗi, **0 cảnh báo**. Audit 26 bản ghi, 25 `allow`, 1 `deny`, không tool ghi nào được `allow`.
- **E (`deny` trong "Cảnh báo") đã hết:** không còn chuỗi `Denied by preToolUse hook` trong báo cáo và console.
- **Console đã sửa:** 4 agent `✓`, không dòng `✗`, chỉ 1 dòng `⛔`.
- **`denyHint` không rò:** audit, báo cáo, console vẫn ghi reason ngắn.
- **A (đoán tên tool) giảm:** code-reader 1 `deny` (lần 7: 2, lần 6: 1), tên `github-list_list_workflow_runs_placeholder`
  (args `{}`), lượt kế tiếp gọi đúng `github-actions_list`. code-reader 15.5s (lần 7: 20.6s). Work đề xuất chấp nhận.
- cloud-reader: 11 lần gọi, không lỗi tool (`monitor_*` ×8), đọc cả 2 workspace. 41.6s.

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. 1 `deny` do đoán tên, tự sửa ngay |
| ADO Remote MCP (`board-reader`) | ok |
| Work IQ (`comms-reader`) | ok |
| Azure MCP (`cloud-reader`) | ok |
| Playwright MCP | ok ở Work |
| `pnpm brief` runtime `copilot` | Lần 8: 55.0s, 33.11/120. Lần 7: 75.7s, 34.59. Lần 6: 76.3s, 26.88. Lần 5: 49.5s, 40.06. Lần 4: 46.5s, 39.29. Lần 3: 77.4s, 39.25. Lần 2: 60.5s, 44.29 |

## 2. Thay đổi trong commit này (Work)

Chỉ đổi tài liệu. Không đổi code, quyền hay danh tính.

| File | Nội dung |
|---|---|
| `docs/step0-results.md` | Dòng 9: lần 8 |
| `docs/work-feedback.md` | Các mục "2026-11-26 (lần 8)": test + mock, brief lần 8, kết quả A và E, tài liệu |
| `PLAN.md` | Tick `[Work]` chạy lại brief sau khi Home sửa lần 7 |
| `docs/handoff-claude.md` | File này |

## 3. Việc cho Home (theo thứ tự, đều nhỏ hoặc tuỳ chọn)

Chi tiết: [work-feedback.md](work-feedback.md), các mục "2026-11-26 (lần 8)". Mọi mục phải chạy được end-to-end với
`mock` ở Home.

1. **Tuỳ chọn: mock phát 2 trạng thái cho agent sai schema.** `brief-failures`: console in
   `✗ cloud-reader: Kết quả sai schema…` rồi `⚠ cloud-reader (0.5s): …`. `mock.ts` (dòng ~77) đổi `agent.result` sai
   schema thành `agent.failed` nhưng vẫn phát `agent.completed` của kịch bản; `sdk.ts` chỉ phát một trong hai. Sửa
   mock cho khớp `sdk.ts`. Runtime thật không bị.
2. **Mục A: đề xuất chấp nhận.** 1 `deny` mỗi lần chạy, gate chặn đúng, model tự sửa ngay. Tuỳ chọn: thêm tên
   `github-list_list_workflow_runs_placeholder` (args `{}`) vào mock `brief-auth`.
3. **Tài liệu:** tiêu đề `handoff-copilot.md` đang ghi "lần 6" nhưng là bàn giao lần 8. Khi viết handoff mới, đánh số
   theo lần chạy Work kế tiếp.
4. Nếu Home đổi code: `pnpm typecheck` + `pnpm test` xanh với `AGENTHUB_RUNTIME=mock`, thêm dòng `[Home]` trong
   `PLAN.md`, viết `docs/handoff-copilot.md` mới với đúng việc Work cần kiểm. Nếu không đổi code: không cần chạy lại
   brief thật.

## 4. Việc còn lại ở Work

- User đối chiếu AI Credits (lần 2: 44.29, lần 3: 39.25, lần 4: 39.29, lần 5: 40.06, lần 6: 26.88, lần 7: 34.59,
  lần 8: 33.11) với trang billing công ty.
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
