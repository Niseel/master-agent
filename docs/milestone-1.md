# Milestone 1: Check việc (bản nháp, chốt sau audit 2026-11-28)

> Nguồn: buổi hỏi đáp giữa Thành và Claude sau khi Thành chạy tour trên dashboard (2026-11-28).
> Mục "Chờ Thành chốt" ở cuối liệt kê điểm chưa chốt. Chưa chốt thì chưa code phần đó.

## 1. Output của M1

1. **Cổng MCP và agent quản lý được trên UI.** Thêm, bớt, sửa, bật hoặc tắt cổng và agent; không hardcode.
   Import server từ file `mcp.json` của VS Code vào catalog. Kéo cổng từ catalog thả vào sơ đồ.
2. **Đăng nhập và trạng thái đăng nhập trên UI.** Người dùng cấp quyền cho từng cổng bằng nút trên UI, không cần
   gõ `az login` hay biết token là gì.
3. **Check việc ra danh sách việc cần làm.** Kết quả là các card việc đã gộp trùng, xếp ưu tiên, có chi tiết và todo list.
4. **Eval bằng deepeval đạt ngưỡng** trên các Task Thành đã verify (§7).

## 2. Bỏ khỏi dự án (đi sai hướng)

| Bỏ | Lý do |
|---|---|
| Tab Nghiệm thu, agent `qa`, Playwright MCP như một tính năng | Kiểm UI dựa vào AC + title của PBI là sai nghiệp vụ: PBI có thể là task nghiên cứu, backend hoặc DevOps. Playwright chỉ để Claude tự kiểm UI của Master Agent khi phát triển. |
| Agent ghi (comms-writer, board-writer, code-writer), tab Việc cần làm (giao việc), tab Duyệt, `allowedActions`, `stopAfterReject` | Thành chốt xoá hẳn. M1 chỉ đọc. Agent đọc gọi tool ghi thì bị chặn luôn, không vào hàng duyệt. |
| Kịch bản demo cũ (`docs/demo-mvp.md`), các bước writer/QA trong handoff | Kiểm các tính năng đã bỏ. |
| Lịch chạy tự động mỗi sáng | Sau M1. |

Giữ lại:
- Core runtime (`mock` / `byok` / `copilot`), gate allowlist, audit, sơ đồ realtime, tour hướng dẫn, "Có gì mới".
- ac-reader được đổi tên thành **wit-reader** và mở rộng (§5).

## 3. Khái niệm

| Khái niệm | Nghĩa | Trên sơ đồ |
|---|---|---|
| **Cổng** (MCP server) | Kết nối tới một hệ thống (stdio: lệnh; http: URL), cách đăng nhập, tài khoản gắn với nó, danh sách tool, các tool đọc được tick cho dùng. | Node có tag **MCP** + mô tả |
| **Agent** | Một phiên Copilot có các thành phần: việc cần đọc, quy tắc "thế nào là việc cần làm", các cổng được dùng, model / effort, ngân sách. Nhiều agent dùng chung một cổng được. | Node có tag **Agent** + mô tả, nối dây tới cổng |
| **Tài khoản** | Một danh tính đăng nhập (Microsoft, GitHub, …). Mỗi cổng gắn một tài khoản. Đăng nhập một lần thì mọi cổng gắn tài khoản đó dùng được. | Hiện trong chi tiết cổng |
| **Việc** | Một card trong kết quả check việc. | Danh sách việc |
| **Task (eval)** | Một case eval mà Thành đã verify 100%, giống một unit test của eval. | – |

**Vì sao có nhiều agent (kiến trúc, không chỉ là tên gọi).** Mỗi agent là một phiên model riêng và chỉ thấy tool của
cổng nó được nối. Lý do tách:
- Mail chứa prompt injection không thể khiến agent Outlook gọi tool GitHub, vì agent đó không có tool GitHub.
- Danh sách tool mỗi phiên ngắn, nên ngữ cảnh mỗi lượt nhỏ và đỡ token.
- Các agent chạy song song.
- Một nguồn lỗi không kéo nguồn khác lỗi theo.

Gộp tất cả vào một agent thì ít phiên hơn, nhưng mỗi lượt mang theo toàn bộ danh sách tool và mất lớp cách ly trên.

## 4. Cổng, catalog, đăng nhập

**File cấu hình** (thay phần hardcode trong `agents.ts`):
- File riêng của Agent Hub. Khối `servers` cùng dạng với `mcp.json` của VS Code, thêm `agents` và `accounts`.
- File không chứa bí mật. Bí mật được tham chiếu kiểu `${input:…}` và lưu trong kho bí mật của OS (Windows Credential Manager / macOS Keychain).
- UI sinh ra từ file này, và mọi chỉnh sửa trên UI cũng ghi ngược vào file.

**Catalog:**
- Có mẫu sẵn: Work IQ (Outlook + Teams), Azure DevOps (WIT, Repos/PR, Pipelines), GitHub, Azure Monitor.
- Có nút "Import từ mcp.json" (VS Code user hoặc workspace) để thêm server vào catalog.
- Mỗi ô nhập trả lời 4 câu: đây là gì, điền gì, lấy ở đâu, dùng để làm gì. Có link tới chỗ lấy thông tin.
- Kéo cổng từ catalog vào sơ đồ, nối dây cổng tới agent. Bỏ dây hoặc xoá node để gỡ.

**Tool được dùng:**
- Nút "Lấy danh sách tool" gọi thẳng server, không tốn credit.
- Người dùng tick các tool đọc được dùng.
- Tool trông như tool ghi bị khoá mặc định. Không có chế độ `"*"`.

**Đăng nhập:**
- Tuỳ cổng: SSO (bên dưới là az / device code, `gh auth login --web`, OAuth của MCP http) hoặc ô dán token có hướng dẫn và link tới chỗ lấy token.
- Đăng nhập xong, hub tự kiểm lại và đổi màu node.
- Có Đăng xuất. Không bao giờ hiện token.
- Nhiều tài khoản, mỗi cổng chọn một tài khoản. Ví dụ ADO tách khỏi Azure Monitor như hiện nay (`ADO_AZURE_CONFIG_DIR`).
- Trạng thái mỗi cổng là một trong bốn: ok, hết hạn lúc …, chưa đăng nhập, lỗi + gợi ý sửa.

## 5. Check việc

**Trước khi chạy**, chọn ba thứ trên UI:
- khoảng thời gian: hôm nay, 24h, 3 ngày hoặc 1 tuần;
- các agent sẽ chạy;
- ngân sách credit.

**Agent mặc định (5):**
- Outlook + Teams (Work IQ);
- ADO Board (WIT);
- ADO Repos + Pipelines (PR, pipeline; dùng chung cổng ADO);
- GitHub;
- Azure Monitor.

**Quy tắc "việc cần làm":**
- Mỗi agent có một ô quy tắc viết bằng lời, sửa được, có mẫu sẵn.
- Ví dụ ADO: WIT giao cho tôi hoặc tôi theo dõi, state khác Done / Closed / Removed.
- Ví dụ GitHub / ADO Repos: PR chờ tôi review, PR của tôi có comment mới, pipeline fail.

**wit-reader:**
- Đọc đủ trường của một work item bằng gọi thẳng tool, không qua model, 0 credit (đã có ở ac-reader).
- Các trường: title, description, AC, story point, remaining / completed work, priority, state, người được giao, iteration, hạn, tag, link liên quan.
- Có ba công dụng:
  - Dùng state để quyết định việc còn mở hay không.
  - Làm giàu card việc.
  - Làm nguồn cho các milestone sau.

**Card việc:**
- Nền theo theme sáng / tối, có border.
- Có các nhãn:
  - **nguồn**;
  - **priority** (trường Priority của ADO; nguồn khác không có trường này);
  - ô **Eisenhower**: quan trọng × gấp. "Gấp" dựa vào nội dung và hạn hoàn thành.
- Tiêu đề tóm tắt và mô tả ngắn.
- Bấm vào card để mở chi tiết:
  - nội dung gốc trình bày gọn;
  - ảnh: hiện nếu tool trả được ảnh, không thì ghi "có N ảnh" kèm link;
  - link "Mở bản gốc";
  - **todo list**: model gợi ý; người dùng thêm, sửa, sắp xếp lại, gạch bỏ, tick xong; lưu local.

**Danh sách:**
- Gộp trùng giữa các nguồn: cùng WIT / PR / link thì thành 1 việc, kèm các nguồn liên quan.
- Xếp theo Eisenhower, rồi priority, rồi hạn.
- Đánh dấu đã xong hoặc ẩn. Nếu nguồn có thay đổi sau đó, việc hiện lại với nhãn "Cập nhật mới".
- Xuất ra Markdown / HTML. Không gửi tự động.

## 6. Model và credit

**Chọn model:**
- Nguồn model: Copilot (mặc định), Anthropic, OpenAI, Ollama.
- Có một model mặc định chung. Agent nào cần thì đổi riêng: tên model, chế độ auto, effort.
- Copilot SDK 1.0.34 có sẵn các tuỳ chọn này:
  - `model`;
  - `reasoningEffort`;
  - `autoTier`: `efficiency` / `balance` / `intelligence`;
  - `client.listModels()` trả hệ số giá `billing.multiplier`.
- UI hiện hệ số giá cạnh tên model.
- Judge của eval chọn nguồn bằng cùng cơ chế.

**Credit thực tế.**
- 30 AI Credits là **mức trần tối thiểu** của mỗi phiên ("Minimum session limit is 30 AI credits"), không phải mức tiêu.
- Các lần chạy thật ở Work (lần 8–11) tiêu 31–35 credit cho cả 4 agent, khoảng 8 credit mỗi agent.

| Giả định | Credit/tháng | % của 110.000 |
|---|---|---|
| Thực tế ~35/lần, 22 ngày làm việc | ~770 | ~0,7% |
| Trần 150/lần, 22 ngày | 3.300 | 3,0% |
| Trần 150/lần, 30 ngày | 4.500 | 4,1% |

**Đề xuất giảm credit** (chờ Thành chốt):

1. **Kiểm trước bằng code, 0 credit.** Trước lượt model của mỗi agent, runtime gọi thẳng vài tool đọc rẻ, giống cách
   wit-reader đọc WIT:
   - WIQL `ChangedDate > lần chạy trước`;
   - GitHub search `updated:>…`;
   - danh sách PR / pipeline của ADO.

   Không có gì mới và các việc đang mở không đổi thì bỏ qua lượt model, dùng lại kết quả cũ.

   Work IQ (`ask` / `retrieve`) là tool ngữ nghĩa: cần Work kiểm xem có cách kiểm trước rẻ hay không.
2. **Code lấy dữ liệu, model chỉ phán đoán.** Code gọi tool lấy dữ liệu. Model chỉ xếp Eisenhower, tóm tắt và gợi ý
   todo cho các mục mới. Model không phải tự dò tool, nên ít lượt và ít token hơn.
3. **Model rẻ + effort thấp cho việc đọc**, chọn bằng số đo:
   - chạy cùng bộ Task eval trên vài tổ hợp model / effort / auto;
   - lấy tổ hợp rẻ nhất mà vẫn đạt ngưỡng §7.

Rủi ro: `rpc.mcp.callTool` còn experimental, và Work chưa xác nhận nó chạy ở máy công ty. Nếu không chạy thì mất cả
cách 1 lẫn 2.

## 7. Eval (deepeval)

**Thư viện:**
- Gói npm `deepeval` (TypeScript, 0.9.x).
- Tắt telemetry; kiểm đúng tên biến môi trường khi cài.
- Không tải dữ liệu lên Confident AI.

**Judge:** nguồn model chọn được, như §6. Mặc định là Copilot qua SDK.

**Metric và ngưỡng xong M1:**

| Metric | Ngưỡng |
|---|---|
| Nhận đúng việc cần làm (bỏ sót, báo thừa, gộp trùng) | ≥ 0,9 |
| Xếp ô Eisenhower đúng | ≥ 0,9 |
| Tóm tắt trung thực + todo hữu ích | ≥ 0,9 |
| An toàn: không làm theo prompt injection, gắn nhãn nghi lừa đảo, không đoán tên tool, gọi đúng tool | 1,0 |

**Quy trình tạo Task:**
1. Thành kể tình huống công việc thật và kết quả mong đợi.
2. Claude viết thành case: dữ liệu giả trong `fixtures/` và đáp án.
3. Thành verify tới khi chắc chắn 100%, rồi mới chấp nhận.

Chỉ Task đã verify mới tính vào ngưỡng.

**Nơi chạy:**
- Home: dữ liệu tự tạo, kết quả commit được.
- Work: cùng bộ case, chạy trên Copilot công ty, chỉ ghi điểm số về repo.

## 8. Thứ tự làm

1. **Dọn:** xoá các phần ở §2; ac-reader → wit-reader; chặn tool ghi của agent đọc; sửa tour. — **xong 2026-11-28** (`pnpm wit <số>`).
2. **Output:** card việc, wit-reader đủ trường, gộp trùng, Eisenhower, todo list, đã xong / cập nhật mới, xuất. Dựng
   khung eval song song từ bước này.
3. **Quản lý cổng / agent:** file cấu hình, form tự giải thích, catalog, import `mcp.json`, kéo thả, chọn tool.
4. **Đăng nhập:** tài khoản, SSO / token, kho bí mật của OS, trạng thái.
5. **Eval đủ:** các Task đã verify, chạy ở Home và Work, đạt ngưỡng.

## 9. Định nghĩa xong M1

- [ ] Thêm một cổng mới từ catalog hoặc từ `mcp.json`, nối vào agent, tick tool, đăng nhập trên UI và chạy check việc. Không phải sửa code.
- [ ] Bỏ một cổng hoặc agent trên UI; check việc vẫn chạy với phần còn lại.
- [ ] Trạng thái đăng nhập của mọi cổng đúng với thực tế ở Work.
- [ ] Check việc ra card đúng §5 ở Work với 5 agent mặc định.
- [ ] Eval đạt ngưỡng §7 ở Work.
- [ ] `pnpm test` + `pnpm typecheck` xanh; mọi tính năng chạy được với `mock`.

## 10. Chờ Thành chốt

1. Đề xuất giảm credit §6 (kiểm trước bằng code; code lấy dữ liệu, model chỉ phán đoán; chọn model bằng eval): làm
   ở M1 hay để sau?
2. Model và effort mặc định cho agent đọc khi chưa có số đo eval.
3. Bộ Task eval đầu tiên: Thành kể các tình huống (bắt đầu bằng hỏi đáp).
