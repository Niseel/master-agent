# Bàn giao Work → Home (2026-11-26, lần 6)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục "2026-11-26"),
> [step0-results.md](step0-results.md) (dòng 5, 7, 9).
> Bàn giao trước: 2026-11-25 lần 5 (Home xong mục 1–5 và 7, commit `f37ebf7`).

## 1. Trạng thái

> **Home 2026-11-26:** xong §3 mục 1–3, 5, 6 (mục 4 không cần sửa). Việc Work tiếp theo:
> [handoff-copilot.md](handoff-copilot.md).

- Base `f37ebf7` (= `origin/main`). Work đã pull, `pnpm install`. `pnpm typecheck` sạch, `pnpm test` 31/31 xanh.
- `pnpm smoke <agent> --tools`: model thấy 5/15/4/7 tool (comms/code/cloud/board), tất cả trong allowlist, không
  còn `github-mcp-server-*`. Mục 1 lần 5 (`availableTools`) có tác dụng.
- `pnpm brief` runtime `copilot` lần 6: exit 0, 76.3s (tổng lệnh 78.2s), 26.88/120 AI Credits, 7 mục (1 cần xử lý).
  Audit 19 bản ghi, 18 `allow`, 1 `deny`, không tool ghi nào được `allow`. `@azure/mcp@4.0.0-beta.10` không lỗi cờ.
- **A. `deny`:** code-reader gọi `github-list_workflow_runs` (tool không tồn tại, model đoán tên), rồi tự dùng
  `github-actions_list` ×2. Gate chặn đúng, tốn một lượt model.
- **B. cloud-reader 401:** chỉ gọi `monitor_workspace_list`, trả 401 "Azure credentials not found…". Nguyên nhân môi
  trường: token `az` bị thu hồi (`AADSTS50173`, `invalid_grant`); `az account show` vẫn ok vì đọc cache. User cần
  `az logout` + `az login`. board-reader (profile ADO riêng) vẫn ok.
- **C. Báo cáo không báo lỗi:** 401 không khớp `HINTS` trong `report.ts`, nên báo cáo "0 lỗi, 0 cảnh báo", cloud-reader ✓.
- **D. `GITHUB_MCP_TOKEN` rỗng:** server connected, 32 tool, model thấy 15, `authType:"gh-cli"`, không lỗi.

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. Có token hoặc token rỗng (gh-cli) đều 32 tool |
| ADO Remote MCP (`board-reader`) | ok |
| Work IQ (`comms-reader`) | ok |
| Azure MCP (`cloud-reader`) | Lần 6: 401 do token `az` bị thu hồi (môi trường). Lần 5: ok |
| Playwright MCP | ok ở Work: FFmpeg tải qua proxy ok, `pnpm playwright-smoke` exit 0, 13.5s, có video + ảnh + trace |
| `pnpm brief` runtime `copilot` | Lần 6: 76.3s, 26.88/120. Lần 5: 49.5s, 40.06. Lần 4: 46.5s, 39.29. Lần 3: 77.4s, 39.25. Lần 2: 60.5s, 44.29 |

## 2. Thay đổi trong commit này (Work)

Chỉ đổi tài liệu. Không đổi code, quyền hay danh tính.

| File | Nội dung |
|---|---|
| `docs/step0-results.md` | Dòng 9: lần 6. Dòng 7: Playwright ở Work. Dòng 5: token rỗng |
| `docs/work-feedback.md` | Các mục "2026-11-26": smoke `--tools`, brief lần 6, code-reader `deny`, azure 401, `report.ts` HINT, Playwright, token rỗng |
| `PLAN.md` | Tick Playwright + 2 mục `[Work]` lần 5; thêm `[Home]` lần 6 và `[Work]` kiểm lại cloud-reader |
| `docs/handoff-claude.md` | File này |

## 3. Việc cho Home (theo thứ tự)

Theo CLAUDE.md: sửa `packages/mock-mcp` + `fixtures/` trước, rồi mới sửa code. Mỗi mục một commit. Chi tiết:
[work-feedback.md](work-feedback.md), các mục "2026-11-26". Mọi mục phải chạy được end-to-end với `mock` ở Home.

1. **HINT chặn cho token `az` hết hạn / bị thu hồi.** (`packages/core/src/report.ts`, `HINTS`.)
   - Vì sao: lần 6 cloud-reader nhận 401 nhưng báo cáo ghi 0 lỗi, cloud-reader ✓ (mục C).
   - Mock trước: scenario/fixture cho cloud-reader trả lỗi tool
     `{"status":401,"message":"Azure credentials not found or unavailable. Please run 'az login' ...`.
   - Làm: thêm `{ re: /"status":\s*401|Azure credentials not found|AADSTS50173|invalid_grant/, kind: "blocking", text: ... }`,
     nội dung gợi ý `az logout` + `az login` (đúng `AZURE_CONFIG_DIR`), kiểm bằng `az account get-access-token`.
   - `blocking` chỉ bỏ item của cloud-reader: item Azure do comms-reader lấy từ mail vẫn giữ.
2. **Tuỳ chọn: lỗi tool không khớp HINT vẫn hiện.** (`report.ts`, `summarize()`.) Hiện dưới "Cảnh báo" dạng
   `agent: lỗi` (cắt ngắn), để báo cáo không ghi 0 lỗi khi agent có lỗi tool. Test bằng scenario ở mục 1.
3. **Task `code-reader`.** (`packages/core/src/agents.ts`.) Ghi rõ "workflow run: dùng `actions_list` với
   `method: "list_workflow_runs"` (không có tool `list_workflow_runs` riêng)". Bớt lượt model và mục "Bị chặn" giả
   (mục A). Tuỳ chọn: scenario có 1 lần `deny` tên tool không tồn tại.
4. **Không cần sửa mock GitHub:** `search_pull_requests` lần 6 gửi `{owner, query, repo}` (lần 5: `{query}`), mock
   đã nhận. Chỉ ghi nhận.
5. **Không cần `missingConfig` cho `GITHUB_MCP_TOKEN`:** token rỗng vẫn chạy (mục D). Tuỳ chọn ghi trong
   `docs/WORK.md` là token không bắt buộc khi Copilot CLI đã đăng nhập.
6. **Tuỳ chọn: `docs/WORK.md`.** Kiểm token Azure bằng `az account get-access-token` (không phải `az account show`).
7. Sau mỗi bước: `pnpm typecheck` + `pnpm test` xanh với `AGENTHUB_RUNTIME=mock`; `pnpm brief` (mock) mở được báo
   cáo. Tick dòng `[Home]` lần 6 trong `PLAN.md`. Viết `docs/handoff-copilot.md` mới với đúng việc Work cần kiểm (§4).

## 4. Việc còn lại ở Work

- User chạy `az logout` rồi `az login` (tương tác) với đúng `AZURE_CONFIG_DIR`; kiểm bằng `az account get-access-token`.
- Sau khi Home xong §3: pull, `pnpm install`, `pnpm typecheck` + `pnpm test`, chạy lại `pnpm brief` runtime `copilot`
  (~27–40 AI Credits): cloud-reader gọi chuỗi `monitor_*` không lỗi như lần 5; code-reader không còn `deny`.
- User đối chiếu AI Credits (lần 2: 44.29, lần 3: 39.25, lần 4: 39.29, lần 5: 40.06, lần 6: 26.88) với trang
  billing công ty.
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
