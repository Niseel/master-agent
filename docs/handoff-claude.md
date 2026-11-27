# Bàn giao Work → Home (2026-11-26, lần 10)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục "2026-11-26 (lần 10)"),
> [step0-results.md](step0-results.md) (dòng 9), [mcp-tools-writers.md](mcp-tools-writers.md) (sinh lại, đúng).
> Bàn giao trước: 2026-11-26 lần 9 (base `0f4b421`).

## 1. Trạng thái

> **Home 2026-11-27:** xong §3 mục 1, 2, 3 (gợi ý mạnh hơn trong system prompt code-reader + lời gọi đoán tên trong mock
> `brief-ok`), mục 4 (handoff lần 11). Thêm: gate giới hạn `action` ADO, "có gì mới", lấy tiêu chí từ work item ADO.

- Base `3a724d1` (= `origin/main`). `pnpm typecheck` exit 0, `pnpm test` 52/52.
- `corepack pnpm dashboard` chạy thẳng (tự build web). Sửa của lần 9 đạt.
- `list-tools --writers`: workiq 13, ado 43, github 49 tool; có `ado-wit_work_item_comment_write`,
  `ado-wit_work_item_write`, `ado-wit_work_item`. `BOARD_WRITE` mới khớp tên thật.
- **Check việc** (runtime `copilot`): 61.8s, 31.11/120, 5 mục, 2 cần xử lý (đều Azure, không có writer), 0 lỗi,
  0 cảnh báo. Audit 28 dòng: 27 `allow`, 1 `deny` (`github-list_workflow_runs_placeholder`, tự sửa). Không còn mục rỗng.
- **Giao việc bị chặn lần 2**: không có mục ADO/GitHub nào `actionRequired: true`. Tab Việc cần làm chỉ hiện mục
  `actionRequired`, nên không có nút Giao việc. Work không gọi thẳng `POST /api/act` (người dùng không cho phép đi
  vòng UI). Từ chối chưa kiểm được.
- **QA**: chưa chạy (chuyển lần 11).

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. 1 `deny` đoán tên (lần 8, 9, 10 đều có), tự sửa |
| ADO Remote MCP (`board-reader`) | ok |
| Work IQ (`comms-reader`) | ok, bỏ 1 mục rỗng đúng |
| Azure MCP (`cloud-reader`) | ok |
| Agent ghi (Phase 3) | **Chặn**: không có mục để giao qua UI |
| Nghiệm thu (Phase 4) | Chưa chạy lại |
| Check việc runtime `copilot` | Lần 10: 61.8s, 31.11. Lần 9: 52.8s, 31.39 (tổng ≈ 39.39). Lần 8: 55.0s, 33.11. Lần 7: 75.7s, 34.59 |

## 2. Thay đổi trong commit này (Work)

Chỉ đổi tài liệu. Không đổi code, quyền hay danh tính.

| File | Nội dung |
|---|---|
| `docs/step0-results.md` | Dòng 9: lần 10 |
| `docs/work-feedback.md` | Các mục "2026-11-26 (lần 10)" |
| `docs/mcp-tools-writers.md` | Sinh lại bởi `pnpm list-tools --writers` (đúng nội dung) |
| `PLAN.md` | Dòng `[Work]` dashboard, `list-tools --writers`, giao việc, nghiệm thu lại |
| `docs/handoff-claude.md` | File này |

## 3. Việc cho Home (theo thứ tự)

Yêu cầu chung của người dùng: **mọi trạng thái, lý do và kết quả (kể cả Từ chối) phải xem được trên UI.** Mọi mục
phải chạy end-to-end với `mock` ở Home, `pnpm test` + `pnpm typecheck` xanh. Không dự kiến đổi quyền; nếu có, ghi
rõ trong commit message.

### Mục 1. Giao việc cho mọi mục có writer (gỡ chặn bước giao việc)

Vấn đề: `Todo` trong `apps/web/src/App.tsx` (dòng ~420) lọc `.filter(({ item }) => item.actionRequired)`. Báo cáo
thật thường có mục ADO/GitHub nhưng `actionRequired: false`, nên không giao được. Server không lọc
`actionRequired` (`Hub.act`, `apps/server/src/server.ts` dòng 110–121), không cần sửa server.

Làm:
- Tách hàm thuần, ví dụ `todoGroups(report, writerFor)` trong `apps/web/src/state.ts`, trả 2 nhóm (giữ chỉ số `i`
  gốc của mục trong `report.items`):
  - "Cần bạn xử lý": mục `actionRequired` (như cũ, kể cả nguồn không có writer, hiện "Chưa có agent ghi…").
  - "Mục khác có agent ghi": mục không `actionRequired` mà `writerFor[item.source]` có writer.
- `Todo` hiện nhóm 1 như cũ; nhóm 2 trong `<details>` (mặc định đóng) có số mục trong `<summary>`, cùng nút
  "Giao việc: <writer>" và form như nhóm 1.
- Thông báo rỗng: nhóm 1 rỗng vẫn hiện "Không có mục nào cần xử lý." nhưng không che nhóm 2.
- Mock: thêm vào kịch bản brief (ví dụ `fixtures/scenarios/brief-ok.jsonl` hoặc `fixtures/data/ado.json`) ít nhất 1 mục
  ADO `actionRequired: false`, để Home giao việc nó end-to-end qua `act-board-writer.jsonl`.

Nghiệm thu (Home, `mock`):
- Test `state.test.ts`: `todoGroups` chia đúng 2 nhóm, giữ `i` gốc, bỏ mục không `actionRequired` mà nguồn không có
  writer (ví dụ Azure).
- Dashboard mock: mở nhóm 2, Giao việc mục ADO → board-writer xin duyệt ở tab Duyệt.

### Mục 2. Từ chối (và mọi kết quả writer) hiện đủ trên UI

Vấn đề (đọc code, xem work-feedback lần 10):
- `approval.resolved` (`packages/core/src/events.ts` dòng 19) chỉ có `{id, decision}`. `sdk.ts` dòng 194 và `mock.ts`
  dòng 65, 91 phát event không có lý do. Lý do chỉ có trong audit (`reason`).
- `Approval` (`state.ts` dòng 81–88) không có `feedback`, `resolvedAt`. Handler `approval.resolved` chỉ đặt `decision`.
- "Đã xử lý" ở tab Duyệt (`App.tsx` dòng 365–371) chỉ hiện `✗ Từ chối: agent → tool`.
- Kết quả ở Việc cần làm (`App.tsx` dòng 471) chỉ hiện khi form của mục đang mở (`open === i`) và chỉ là
  `action.summary`.

Làm:
- `events.ts`: `approval.resolved` thêm `feedback?: string`. `sdk.ts` `gate()` (dòng ~176–200) và `mock.ts` (dòng 65, 91)
  điền `feedback` (lý do người dùng gõ, hoặc "Người dùng từ chối" mặc định của UI). Không đổi gì ở audit hay kết quả
  `deny` trả cho model.
- `state.ts`: `Approval` thêm `feedback?`, `resolvedAt?` (thời điểm event). Handler lưu cả hai.
- Tab Duyệt "Đã xử lý": mỗi dòng hiện quyết định, agent, tool, giờ, lý do (nếu có), tham số trong `<details>` đóng sẵn.
  Hiện lý do dạng text thường (JSX), không `dangerouslySetInnerHTML`.
- Việc cần làm: nhớ mục nào đã giao (ví dụ state `assigned` = chỉ số `i` + tên writer), và hiện khối trạng thái của
  mục đó **không phụ thuộc form mở hay đóng**:
  - đang soạn / chờ duyệt (n yêu cầu, link sang tab Duyệt) / xong / lỗi (+ `error`, `hint`);
  - xong mà mọi yêu cầu ghi đều bị từ chối, hoặc không có yêu cầu nào được duyệt: "Không có gì được gửi (bạn đã từ
    chối N yêu cầu: <lý do>)";
  - có yêu cầu được duyệt: "Đã gửi: <tool>" + `action.summary`.
- Node writer / Chi tiết: cùng dòng tóm tắt ("Bị từ chối — không gửi gì" hoặc "Đã gửi N").
- Có thể tách hàm thuần, ví dụ `writerOutcome(view, agent)` trong `state.ts`, để test.

Nghiệm thu (Home, `mock`):
- `state.test.ts`: `approval.resolved` có `feedback` → view lưu `feedback`, `resolvedAt`; `writerOutcome` trả
  "từ chối, không gửi gì" khi mọi yêu cầu bị reject, "đã gửi" khi có approve.
- `apps/server/test/server.test.ts`: `POST /api/approvals/:id {decision:"reject", feedback:"x"}` → event
  `approval.resolved` có `feedback: "x"`.
- Dashboard mock, nhánh từ chối của `act-board-writer`: gõ lý do, Từ chối → thấy lý do ở tab Duyệt và ở Việc cần làm
  (sau khi đóng form vẫn thấy), node writer ghi "không gửi gì".

### Mục 3. Tuỳ chọn, ưu tiên thấp: tên đoán của code-reader

`github-list_workflow_runs_placeholder` bị `deny` đúng 1 lần ở lần 8, 9, 10 dù đã có gợi ý (`agents.ts` dòng 165–166).
Vô hại (gate chặn, model tự sửa). Có thể viết gợi ý mạnh hơn (ví dụ đặt đầu task: "Chỉ gọi tool có trong danh sách;
workflow run = `actions_list`"), hoặc chấp nhận và bỏ qua.

### Mục 4. Viết `docs/handoff-copilot.md` (lần 11)

Chỉ ghi lệnh cần chạy và điều cần ghi lại:
1. `corepack pnpm install`, `typecheck`, `test` (ghi số test), `corepack pnpm dashboard` runtime `copilot`.
2. Check việc: thời gian, credit, số mục, audit allow/deny.
3. Việc cần làm: mở nhóm "Mục khác có agent ghi", Giao việc 1 mục ADO (người dùng chọn mục và nội dung). Ở tab Duyệt
   kiểm đủ tham số, gõ lý do, **Từ chối**. Ghi lại: lý do hiện ở tab Duyệt và Việc cần làm (cả sau khi đóng form),
   trạng thái "không gửi gì", audit có `ask` rồi `reject` với `reason`. Không bấm Duyệt.
4. Nghiệm thu chạy lại (trang `http://127.0.0.1:4317/report`): chapter không lỗi, ảnh không dính lớp phủ, chỉ một
   `qa.webm` được nhúng, thanh credit có phần QA.
5. Tổng credit lần 11.

## 4. Việc còn lại ở Work

- Lần 11: giao việc + Từ chối, nghiệm thu chạy lại (theo `handoff-copilot.md` lần 11).
- User đối chiếu AI Credits (lần 2: 44.29, lần 3: 39.25, lần 4: 39.29, lần 5: 40.06, lần 6: 26.88, lần 7: 34.59,
  lần 8: 33.11, lần 9: 31.39 brief / ≈39.39 tổng, lần 10: 31.11) với trang billing công ty.
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
