# Bàn giao Work → Home (2026-11-26, lần 9)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục "2026-11-26 (lần 9)"),
> [step0-results.md](step0-results.md) (dòng 7 và 9), [mcp-tools-writers.md](mcp-tools-writers.md) (mới).
> Bàn giao trước: 2026-11-26 lần 8 (base `f100b61`).

## 1. Trạng thái

> **Home 2026-11-26:** xong §3 mục 1–6 và phần tuỳ chọn `HEAD /qa/*`, tool built-in bị từ chối (test). Nhãn "Loại (đoán)"
> chưa sửa (chỉ hiển thị). `docs/mcp-tools-writers.md` gửi về là bản chép nhầm của file này, không commit: Work sinh lại.
> Việc Work tiếp theo: [handoff-copilot.md](handoff-copilot.md) (lần 10).

- Base `0f4b421` (= `origin/main`). `pnpm install` exit 0, `pnpm typecheck` exit 0, `pnpm test` 51/51.
- `corepack pnpm dashboard` lỗi ở Work (script gọi `pnpm` trần). Chạy được bằng build web + `tsx apps/server/src/main.ts`.
- Dashboard: auth github/ado/azure `ok`, workiq `unknown`; sơ đồ 14 node / 16 cạnh; console 0 lỗi; 600/800px không tràn.
- **Check việc** (runtime `copilot`): 52.8s, 31.39/120, 6 mục, 0 lỗi, 0 cảnh báo, 4 agent song song. Audit 27 dòng,
  1 `deny` (đoán tên, tự sửa). **Lỗi mới:** 1 mục Outlook rỗng (title/summary rỗng).
- **Giao việc (Phase 3) bị chặn:** board-writer 0 lời gọi tool vì tên trong `BOARD_WRITE` không có trên server ADO
  thật. Duyệt/Từ chối chưa kiểm được. Không có mục GitHub để thử code-writer.
- **QA:** 3/3 Đạt, 6.49 credit, 14 lời gọi `allow`, nhưng có cảnh báo: gọi song song làm 1 chapter lỗi và lớp phủ dính
  vào ảnh; tab `_blank` sinh `qa-1.webm`, báo cáo nhúng nhầm video đó; thanh credit không cộng QA.

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. 1 `deny` do đoán tên, tự sửa ngay |
| ADO Remote MCP (`board-reader`) | ok |
| Work IQ (`comms-reader`) | ok, nhưng trả 1 mục rỗng |
| Azure MCP (`cloud-reader`) | ok |
| Playwright MCP (smoke + QA) | ok; QA có cảnh báo (xem trên) |
| Agent ghi (Phase 3) | **Chặn**: tên tool ghi ADO sai, 0 lời gọi |
| Check việc runtime `copilot` | Lần 9: 52.8s, 31.39/120 (tổng lần 9 ≈ 39.39 gồm giao việc + QA). Lần 8: 55.0s, 33.11. Lần 7: 75.7s, 34.59. Lần 6: 76.3s, 26.88. Lần 5: 49.5s, 40.06. Lần 4: 46.5s, 39.29. Lần 3: 77.4s, 39.25. Lần 2: 60.5s, 44.29 |

## 2. Thay đổi trong commit này (Work)

Chỉ đổi tài liệu. Không đổi code, quyền hay danh tính.

| File | Nội dung |
|---|---|
| `docs/step0-results.md` | Dòng 7 (smoke) và 9 (dashboard, giao việc, QA): lần 9 |
| `docs/work-feedback.md` | Các mục "2026-11-26 (lần 9)" |
| `docs/mcp-tools-writers.md` | Mới, sinh bởi `pnpm list-tools --writers` |
| `PLAN.md` | Cập nhật các dòng `[Work]` Phase 2–4 |
| `docs/handoff-claude.md` | File này |

## 3. Việc cho Home (theo thứ tự)

Chi tiết: [work-feedback.md](work-feedback.md), các mục "2026-11-26 (lần 9)". Mọi mục phải chạy được end-to-end với
`mock` ở Home.

1. **Tên tool ghi ADO** (`agents.ts` dòng 242): `wit_add_work_item_comment`, `wit_update_work_item` không tồn tại. Tên
   thật `wit_work_item_comment_write`, `wit_work_item_write` (gộp nhiều hành động theo `action`). Thêm `readTools`
   `wit_work_item` cho board-writer (dòng 280). Tuỳ chọn: gate giới hạn `action`. Cập nhật `mock-mcp` (dòng ~159) và
   `fixtures/scenarios/act-board-writer.jsonl`. Ghi thay đổi quyền trong commit message.
2. **Task QA** (`qa.ts` dòng ~80–83): gọi tuần tự; chụp ảnh trước chapter kế tiếp; dừng video/trace/đóng sau tiêu chí
   cuối; không click link `target=_blank`.
3. **Video QA** (`qa.ts` dòng 136): ưu tiên `qa.webm` (hoặc liệt kê mọi video).
4. **Credit QA** (`apps/web/src/state.ts` dòng 209): cộng `sum("tester")`.
5. **Mục rỗng:** task reader nói "không có gì thì `items: []`", orchestrator bỏ mục title + summary rỗng. Thêm vào mock.
6. **Script `dashboard`** (`package.json` dòng 17): không gọi `pnpm` trần (Work dùng `corepack pnpm`).
7. Tuỳ chọn: sửa nhãn "Loại (đoán)" trong `list-tools --writers`; `HEAD` cho `/qa/*`; xác nhận tool built-in
   (git, gh, curl, shell) không có trong session writer.

Sau đó viết `docs/handoff-copilot.md` (lần 10) với: chạy lại giao việc board-writer, Từ chối, kiểm audit `ask`/`deny`;
chạy lại QA và kiểm ảnh, video, credit.

## 4. Việc còn lại ở Work

- Lần 10: kiểm lại giao việc (cần mục ADO hoặc GitHub) và QA sau khi Home sửa.
- User đối chiếu AI Credits (lần 2: 44.29, lần 3: 39.25, lần 4: 39.29, lần 5: 40.06, lần 6: 26.88, lần 7: 34.59,
  lần 8: 33.11, lần 9: 31.39 brief / ≈39.39 tổng) với trang billing công ty.
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
