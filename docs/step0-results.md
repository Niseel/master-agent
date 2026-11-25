# Bước 0 — kết quả [Work]

> Chỉ thông tin cấu trúc. Không chép nội dung mail/chat/work item/log, tên người, email, tenant id.
> Hướng dẫn: [WORK.md](WORK.md).

| # | Hạng mục | Kết quả (ok / lỗi / bị chặn) | Ghi chú (mã lỗi, thông báo đã xoá định danh) |
|---|---|---|---|
| 1 | Copilot SDK + license công ty (`pnpm smoke code-reader`, dòng `auth:`) | ok | Session chạy, `totalPremiumRequestCost: 1` mỗi lần smoke. Model mặc định khi `model=null`: `claude-sonnet-5.5` |
| 2 | Work IQ — mail chưa đọc (`pnpm smoke comms-reader`) | ok | Server connected (13 tool). Ban đầu bị chặn: tool trả lỗi EULA. Hết lỗi sau khi user tự chấp nhận EULA (2026-11-25), không cần admin consent; `workiq-fetch` chạy được (tham số thật `entityUrls`, đường dẫn kiểu Graph) |
| 3 | Work IQ — Teams chưa đọc | ok | Như mục 2, cùng server |
| 4 | ADO Remote MCP (`pnpm smoke board-reader`) | ok | Server báo `needs-auth` → cần `onMcpAuthRequest` (token Entra scope `https://mcp.dev.azure.com/.default` từ `az`). Sau đó connected (26 tool), gate OK. Lỗi `VS30063` khi token lấy từ profile `az` mặc định (tài khoản không thuộc org). Hết lỗi khi dùng profile `az` riêng qua `ADO_AZURE_CONFIG_DIR`: `ado-core_list_projects` chạy được |
| 5 | GitHub MCP (`pnpm smoke code-reader`) | ok | Connected, `github-get_me` chạy được. Đã đặt `GITHUB_MCP_TOKEN`; chưa thử để trống |
| 6 | Azure MCP (`pnpm smoke cloud-reader`) | ok | `--namespace monitor --read-only`: 4 tool (`monitor` gộp 22 lệnh con, `subscription_list`, `group_list`, `group_resource_list`). `azure-subscription_list` chạy được. Không có lệnh liệt kê alert. `readTools` đã đổi từ `"*"` sang allowlist. Server chạy với env `AZURE_TOKEN_CREDENTIALS=AzureCliCredential` (credential mặc định chọn danh tính khác `az login`, xem work-feedback "chẩn đoán workspace thứ hai") |
| 7 | Playwright MCP — quay thử video | chưa chạy | (Phase 4, chưa có script) |
| 8 | `pnpm list-tools` → docs/mcp-tools.md | ok | workiq 13, ado 26, github 32, azure 4 tool. Thêm built-in `github-mcp-server` (6 tool) có trong mọi session |
| 9 | `pnpm brief` chạy thật: thời gian, credit | ok | **Lần 4** (2026-11-25, sau khi Work sửa task `cloud-reader`): 46.5s, AI Credits 39.29 / 120, 7 mục, 0 agent lỗi. code-reader 16.2s, board-reader 22.0s (trước 76.4s), comms-reader 32.4s, cloud-reader 45.5s (trước 47.6s). cloud-reader: 10 lần gọi (`azure-monitor` ×7, `group_list` ×1, `group_resource_list` ×2); có `monitor_activitylog_list` ×2 (kèm `resource-name`); không còn `SYN0002` (query dùng `lastSeen`); 1× 404 `Could not find workspace with name ...` ở workspace thứ hai (lần 3 là 403), không thử lại. board-reader: 2 `wit_query` (`@Me`, `@Follows`, không subquery), `list_revisions` ×2, `list_comments` ×2. Báo cáo: không item nào nhắc lại lỗi tool. Audit: 23 bản ghi, tất cả `allow`, không `deny`, không tool ghi. **Lần 3** (2026-11-25, sau task mới của Home): 77.4s (tổng lệnh 79.5s), AI Credits 39.25 / 120, 8 mục, 0 agent lỗi. code-reader 21.1s, cloud-reader 47.6s, comms-reader 57.6s, board-reader 76.4s. cloud-reader: 8 lần `azure-monitor` (trước 15) + `group_list` ×1 + `group_resource_list` ×2; không còn `unknown arguments` / `not available`; 2× `BadArgumentError` (KQL dùng `last` làm tên cột, xem work-feedback), 1× 403 `InsufficientAccessError` (thiếu quyền trên 1 trong 2 workspace); không gọi `monitor_activitylog_list`. board-reader: không còn lỗi WIQL `«SELECT»`, dùng `@Me` + `@Follows` (2 `wit_query`), không dùng `action:"my"`. Báo cáo: không item nào nhắc lại lỗi tool. Audit: 27 bản ghi, tất cả tool đọc `allow`, không có `deny`, không tool ghi. **Lần 2:** 60.5s (tổng lệnh 62s, dưới 3 phút), AI Credits 44.29 / 120. Cả 4 agent ok, 0 lỗi: code-reader 15.8s, board-reader 21.7s, comms-reader 24.3s, cloud-reader 59.1s (thử lại nhiều lần, xem work-feedback). Audit: không có tool ghi nào được `allow`; 2 tool built-in `github-mcp-server-*` gọi từ cloud-reader bị `deny`. Lần 1: 27.1s, 22.17 credit, comms-reader lỗi EULA, cloud-reader thiếu `AZURE_*` |

## Câu hỏi mở (PLAN.md §9)

- Model org cho phép:
- Ngân sách AI Credits hằng tháng / đặt `maxAiCredits` cho brief:
- Repo / project ADO / workspace cần theo dõi: (ghi vào `.env`, không ghi ở đây)
