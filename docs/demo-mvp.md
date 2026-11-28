# Demo MVP Agent Hub: kịch bản và audit

Tài liệu có hai việc:

1. Trình diễn MVP trong khoảng 10 phút, đi theo thứ tự của nút **Hướng dẫn** trên dashboard.
2. Audit tình trạng hiện tại: mỗi tính năng ghi một trong ba kết quả **Đạt**, **Lỗi** hoặc **Chưa kiểm**, kèm thời gian và credit.

## Chuẩn bị

| Chế độ | Lệnh | Credit | Dữ liệu |
|---|---|---|---|
| A. Mock | Work: `$env:AGENTHUB_RUNTIME = "mock"; corepack pnpm dashboard`. Home: `AGENTHUB_RUNTIME=mock pnpm dashboard` | 0 | kịch bản tự tạo trong `fixtures/` |
| B. Thật (chỉ ở Work) | `$env:AGENTHUB_RUNTIME = "copilot"; corepack pnpm dashboard` | theo trần ở handoff | mail, chat, ADO, GitHub, Azure thật |

Sau khi chạy lệnh, mở http://127.0.0.1:4317. Tắt bằng Ctrl+C trong terminal.

Ràng buộc khi demo:

- **Không bấm Duyệt.** Duyệt nghĩa là gửi thật tới người khác.
- Không chụp màn hình dashboard hoặc báo cáo vào repo.
- Không chép dữ liệu thật vào ghi chú. Chỉ ghi số, tên tool, trạng thái và mã lỗi.

## Kịch bản

Cột "Mock: mong đợi" là kết quả đã kiểm ở Home ngày 2026-11-28.

| # | Bước | Thao tác | Mock: mong đợi |
|---|---|---|---|
| 0 | Hướng dẫn | Bấm **Hướng dẫn** trên thanh trên. Bấm Tiếp tới hết, bấm Trước 2 lần, rồi nhấn Esc. | 11 bước. Popover chỉ đúng phần tử. Tab bên phải tự đổi ở các bước Chi tiết, Việc cần làm, Duyệt, Nghiệm thu, Đăng nhập. Esc đóng tour. Không có lỗi trong console. |
| 1 | Đăng nhập | Mở tab **Đăng nhập**, bấm **Kiểm tra lại**. | Mỗi nguồn ghi "Giả lập". |
| 2 | Check việc | Giữ lệnh "check việc", bấm **Chạy**. | 4 agent đọc chạy song song. code-reader xin gọi `github-add_issue_comment` vì fixture có prompt injection, và tab Duyệt tự mở. Bấm **Từ chối**. Báo cáo: 10 mục, 0 nguồn lỗi, 1 cảnh báo, 31.50 credits. |
| 3 | Chi tiết | Bấm một node agent, rồi một node MCP server. | Thấy từng lần gọi tool (✓, ✗, ⛔), thời gian và credit. Phần "Thông báo" không có JSON thô. |
| 4 | Giao việc | Mở tab **Việc cần làm**. Chọn một mục Teams, bấm **Giao việc**, ghi email người nhận và nội dung, bấm **Soạn**. Ở tab **Duyệt**: gõ lý do, bấm **Từ chối**. | Có đúng 1 yêu cầu duyệt. Mục ghi "Không có gì được gửi (bạn đã từ chối 1 yêu cầu: <lý do>)". Có dòng "Gate chặn N lần gọi" và dòng "Agent: …". Kết quả vẫn còn sau khi tải lại trang. |
| 5 | Theo số work item | Cuối tab Việc cần làm, mở **Giao theo số work item**. Nhập số `1234` và lời giao, bấm **Soạn**, rồi **Từ chối** ở tab Duyệt. | Có 1 yêu cầu duyệt `wit_work_item_comment_write`. Kết quả hiện ngay dưới form. |
| 6 | Lấy tiêu chí | Mở tab **Nghiệm thu**. Nhập `1234`, bấm **Lấy tiêu chí**. | Ra 3 tiêu chí "Hoàn tiền một phần…". Chi tiết node ac-reader ghi "Đọc thẳng trường Acceptance Criteria". |
| 7 | Nghiệm thu | Giữ URL mặc định và **3 tiêu chí mẫu**, bấm **Chạy nghiệm thu**. Mở link báo cáo. | Kết quả 2/3 đạt: tiêu chí "link mở tab mới" Không đạt. Báo cáo có ảnh, video và trace. Mock phát lại một kịch bản cố định cho 3 tiêu chí mẫu. Nếu bấm "Dùng các tiêu chí này" ở bước 6 thì bằng chứng sẽ không khớp tiêu chí: đây là giới hạn của mock, không phải lỗi. |
| 8 | Báo cáo | Xem khung **Báo cáo**, bấm **Mở tab mới**. | Mục "Cần bạn xử lý" nằm đầu báo cáo. Chạy check việc lần thứ hai ở ngày sau thì có dòng "N mới so với <ngày>". |
| 9 | Dừng | Bấm **Chạy**, rồi bấm **Dừng** khi agent đang chạy. | Báo cáo ghi "đã dừng giữa chừng". Yêu cầu duyệt đang chờ bị từ chối, không bao giờ tự duyệt. Lượt dừng ghi đè báo cáo HTML của ngày, nên làm bước này cuối cùng. File `brief-<ngày>.json` dùng cho "Có gì mới" vẫn giữ bản của lượt đủ trước đó. |

Ở chế độ B, làm cùng các bước. Ghi thời gian và credit của từng lượt chạy. Kết quả mong đợi riêng cho Work nằm trong [handoff-copilot.md](handoff-copilot.md) §3.

## Bảng audit

Chép bảng này vào `docs/work-feedback.md`, mục "lần 12 (audit MVP)". Mỗi ô kết quả ghi Đạt, Lỗi hoặc Chưa kiểm.

| Tính năng | Mock | Thật | Thời gian / credit | Ghi chú (không có dữ liệu thật) |
|---|---|---|---|---|
| Hướng dẫn (tour) | | | – | |
| Kiểm đăng nhập | | | – | |
| Check việc + báo cáo | | | | |
| Yêu cầu ghi bất thường từ agent đọc | | | – | |
| Chi tiết node | | | – | |
| Giao việc comms-writer + Từ chối | | | | |
| board-writer theo số work item + Từ chối | | | | |
| Lấy tiêu chí nguyên văn | | | | |
| Nghiệm thu (ảnh, video, trace) | | | | |
| "Có gì mới" | | | – | |
| Dừng | | | – | |
| Thanh credit khớp tổng | | | | |

Sau bảng, ghi thêm:

- **Đánh giá chung:** những gì đang cản việc dùng hằng ngày.
- **Top 3 vấn đề:** xếp theo mức ảnh hưởng. Mỗi vấn đề ghi bước tái hiện, file nghi ngờ (nếu biết) và mã lỗi đã xoá dữ liệu thật.
