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
| 6 | Azure MCP (`pnpm smoke cloud-reader`) | ok | `--namespace monitor --read-only`: 4 tool (`monitor` gộp 22 lệnh con, `subscription_list`, `group_list`, `group_resource_list`). `azure-subscription_list` chạy được. Không có lệnh liệt kê alert. `readTools` đã đổi từ `"*"` sang allowlist |
| 7 | Playwright MCP — quay thử video | chưa chạy | (Phase 4, chưa có script) |
| 8 | `pnpm list-tools` → docs/mcp-tools.md | ok | workiq 13, ado 26, github 32, azure 4 tool. Thêm built-in `github-mcp-server` (6 tool) có trong mọi session |
| 9 | `pnpm brief` chạy thật: thời gian, credit | ok | 2026-11-25 (lần 2), runtime `copilot`: 60.5s (tổng lệnh 62s, dưới 3 phút), AI Credits 44.29 / 120. Cả 4 agent ok, 0 lỗi: code-reader 15.8s, board-reader 21.7s, comms-reader 24.3s, cloud-reader 59.1s (thử lại nhiều lần, xem work-feedback). Audit: không có tool ghi nào được `allow`; 2 tool built-in `github-mcp-server-*` gọi từ cloud-reader bị `deny`. Lần 1: 27.1s, 22.17 credit, comms-reader lỗi EULA, cloud-reader thiếu `AZURE_*` |

## Câu hỏi mở (PLAN.md §9)

- Model org cho phép:
- Ngân sách AI Credits hằng tháng / đặt `maxAiCredits` cho brief:
- Repo / project ADO / workspace cần theo dõi: (ghi vào `.env`, không ghi ở đây)
