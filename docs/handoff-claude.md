# Bàn giao Work → Home (2026-11-28, lần 11)

> Cho Claude Code ở Home. Chỉ thông tin cấu trúc, không có dữ liệu công ty.
> Đọc kèm: [PLAN.md](../PLAN.md), [work-feedback.md](work-feedback.md) (các mục "2026-11-28 (lần 11)"),
> [step0-results.md](step0-results.md) (dòng 9).
> Bàn giao trước: 2026-11-26 lần 10 (base `3a724d1`).

## 1. Trạng thái

- Base `a649bdd` (= `origin/main`, code ở `8ab1b02`). `typecheck` exit 0, `test` 57/57. Dashboard runtime `copilot`.
- **Check việc**: 65.2s, 26.53/120, 7 mục, 0 lỗi, 0 cảnh báo. Audit 22 dòng: 21 `allow`, 1 `deny`
  (`github-github-actions_list`, tự sửa). board-reader trả 0 mục. "Có gì mới" không kiểm (người dùng bỏ qua).
- **board-writer chưa kiểm được** ở Work vì brief không có mục ADO; đề xuất Home cho nhập số work item để giao việc
  board-writer.
- **Từ chối** kiểm thay bằng comms-writer: đạt. Lý do hiện ở Duyệt, trên mục (cả sau đóng form, tải lại), node.
  Phát hiện: tên đoán `workiq-call_function_placeholder`, thiếu tool tra người nhận, tự thử lại sau khi bị từ chối.
- **QA chạy lại**: đạt cả 4 điểm của lần 9. Còn: 3 ảnh giống hệt nhau, tiêu chí link tab mới không kiểm được.
- **Lấy tiêu chí** (work item thật): 11 tiêu chí, đủ số, không khớp nguyên văn.
- Tổng **44.3/120**: check việc 26.53, Soạn ≈2.6, QA ≈9.9, Lấy tiêu chí ≈5.3.

| Mục | Kết quả |
|---|---|
| Copilot SDK + license | ok |
| GitHub MCP (`code-reader`) | ok. 1 `deny` đoán tên (lần 8–11 đều có), tự sửa |
| ADO Remote MCP (`board-reader`, `ac-reader`) | ok. board-reader 0 mục; ac-reader 1 lời gọi |
| Work IQ (`comms-reader`, `comms-writer`) | ok. Writer: 2 `ask` → 2 `reject`, không gửi gì |
| Azure MCP (`cloud-reader`) | ok |
| Agent ghi (Phase 3) | Từ chối đạt (comms-writer). board-writer chưa kiểm (không có mục ADO) |
| Nghiệm thu (Phase 4) | Đạt, 2/3 tiêu chí. Ảnh trùng, link `target` không kiểm được |
| Check việc runtime `copilot` | Lần 11: 65.2s, 26.53. Lần 10: 61.8s, 31.11. Lần 9: 52.8s, 31.39. Lần 8: 55.0s, 33.11 |

## 2. Thay đổi trong commit này (Work)

Chỉ đổi tài liệu. Không đổi code, quyền hay danh tính.

| File | Nội dung |
|---|---|
| `docs/step0-results.md` | Dòng 9: lần 11 |
| `docs/work-feedback.md` | Các mục "2026-11-28 (lần 11)" |
| `PLAN.md` | Dòng `[Work]` giao việc/Từ chối, nghiệm thu lại, lấy tiêu chí, bộ nhớ |
| `docs/handoff-claude.md` | File này |

## 3. Việc cho Home (theo thứ tự)

Mọi mục chạy end-to-end với `mock`, `pnpm test` + `pnpm typecheck` xanh. Đổi quyền thì ghi rõ trong commit message.

### Mục 1. Giao việc board-writer theo số work item

Brief thật thường không có mục ADO (lần 10: không `actionRequired`; lần 11: board-reader 0 mục). Đề xuất: ở tab Việc cần
làm (hoặc Nghiệm thu, cạnh "Lấy tiêu chí") cho nhập số work item + lời giao → board-writer. Server tạo `BriefItem`
nguồn Azure DevOps từ số đó (không cần model), giữ gate `allowedActions` hiện có. Mock: kịch bản giao theo số.

### Mục 2. comms-writer

- Có tool đoán tên `workiq-call_function_placeholder` (bị `deny`). Thêm luật tên tool vào system prompt như code-reader.
- Thiếu cách tra người nhận: agent dừng, không xin duyệt. Cân nhắc cho đọc tool tra cấu trúc người/chat (chỉ id,
  không nội dung) hoặc cho UI nhập người nhận; nêu trong prompt "thiếu người nhận thì nói rõ và dừng".
- Sau `reject`, agent tự gọi lại `workiq-create_entity` với `jsonBody` rỗng. Đề xuất: gate dừng session writer sau lần
  `reject` đầu (hoặc prompt: bị từ chối thì dừng, không thử lại).
- Mục kết thúc không có yêu cầu duyệt chỉ hiện "Không có gì được gửi." Đề xuất thêm câu giải thích cuối của agent.

### Mục 3. UI nhỏ

- Thông báo ở header hiện JSON thô `{"link":null,"summary":...}`: hiện `summary`.
- Chip `workiq` vẫn xám sau khi gọi tool thành công: cập nhật trạng thái theo lời gọi thật.
- Console lặp `GET /report net::ERR_ABORTED`: xem có phải tải lại thừa không (ưu tiên thấp).

### Mục 4. ac-reader giữ nguyên văn

11 tiêu chí đủ số nhưng bị dịch/diễn đạt lại. Đề xuất: lấy trường `Microsoft.VSTS.Common.AcceptanceCriteria` rồi tách
bằng code (HTML → các `<li>`/dòng, bỏ thẻ, giữ nguyên chữ), model không viết lại. Có thể bỏ hẳn model (gọi thẳng tool
đọc), đỡ ≈5.3 credit. Tuỳ chọn: đánh dấu tiêu chí không kiểm được bằng UI.

### Mục 5. QA: ảnh từng tiêu chí và link tab mới

- `ac-1/2/3.png` giống hệt nhau: `browser_take_screenshot` không có `ref`/`element`. Đề xuất: task yêu cầu chụp theo
  `ref` của phần tử từ snapshot (hoặc `fullPage: true` khi không có phần tử cụ thể); kiểm trong mock rằng tên tham số
  đúng với schema thật (`docs/mcp-tools*.md`).
- Tiêu chí "mở tab mới" không kiểm được: snapshot không có `target`. Không mở `browser_evaluate`. Cân nhắc: cho kết luận
  "Không kiểm được" là hợp lệ, hoặc kiểm bằng code phía server (tải HTML trang, đọc `target` của link) và ghi vào báo cáo.

### Mục 6. Tuỳ chọn, ưu tiên thấp

- code-reader vẫn 1 tên đoán mỗi lần (lần 11: `github-github-actions_list`).
- board-reader 0 mục: xem lại truy vấn mặc định.

### Mục 7. Viết `docs/handoff-copilot.md` (lần 12)

Kiểm: "Có gì mới" (cần `brief-<ngày trước>.json`), giao việc board-writer + Từ chối (theo mục 1), comms-writer dừng sau
Từ chối, ảnh QA khác nhau, lấy tiêu chí nguyên văn rồi chạy QA với các tiêu chí đó.

## 3b. (lưu) Việc cho Home lần 10 — đã xong

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

- Lần 12: "Có gì mới", board-writer + Từ chối theo số work item, QA với tiêu chí ADO.
- User đối chiếu AI Credits (lần 2: 44.29, lần 3: 39.25, lần 4: 39.29, lần 5: 40.06, lần 6: 26.88, lần 7: 34.59,
  lần 8: 33.11, lần 9: 31.39 brief / ≈39.39 tổng, lần 10: 31.11, lần 11: 26.53 brief / 44.3 tổng) với trang billing
  công ty.
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
