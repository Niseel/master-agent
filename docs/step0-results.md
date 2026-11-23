# Bước 0 — kết quả [Work]

> Chỉ thông tin cấu trúc. Không chép nội dung mail/chat/work item/log, tên người, email, tenant id.
> Hướng dẫn: [WORK.md](WORK.md).

| # | Hạng mục | Kết quả (ok / lỗi / bị chặn) | Ghi chú (mã lỗi, thông báo đã xoá định danh) |
|---|---|---|---|
| 1 | Copilot SDK + license công ty (`pnpm smoke code-reader`, dòng `auth:`) | ok | Session chạy, `totalPremiumRequestCost: 1` mỗi lần smoke. Model mặc định khi `model=null`: `claude-sonnet-5.5` |
| 2 | Work IQ — mail chưa đọc (`pnpm smoke comms-reader`) | bị chặn | Server connected (13 tool), gate cho phép `workiq-fetch`, nhưng tool trả lỗi thông báo EULA cho đến khi user chấp nhận. Chưa biết có cần admin consent không |
| 3 | Work IQ — Teams chưa đọc | bị chặn | Như mục 2 (EULA) |
| 4 | ADO Remote MCP (`pnpm smoke board-reader`) | ok | Server báo `needs-auth` → cần `onMcpAuthRequest` (token Entra scope `https://mcp.dev.azure.com/.default` từ `az`). Sau đó connected (26 tool), gate OK. Lỗi `VS30063` khi token lấy từ profile `az` mặc định (tài khoản không thuộc org). Hết lỗi khi dùng profile `az` riêng qua `ADO_AZURE_CONFIG_DIR`: `ado-core_list_projects` chạy được |
| 5 | GitHub MCP (`pnpm smoke code-reader`) | ok | Connected, `github-get_me` chạy được. Đã đặt `GITHUB_MCP_TOKEN`; chưa thử để trống |
| 6 | Azure MCP (`pnpm smoke cloud-reader`) | chưa chạy | Chưa cấu hình `AZURE_*`; `readTools` vẫn `"*"` |
| 7 | Playwright MCP — quay thử video | chưa chạy | (Phase 4, chưa có script) |
| 8 | `pnpm list-tools` → docs/mcp-tools.md | ok | workiq 13, ado 26, github 32 tool. Thêm built-in `github-mcp-server` (6 tool) có trong mọi session |
| 9 | `pnpm brief` chạy thật: thời gian, credit | chưa chạy | Chờ xử lý mục 2 |

## Câu hỏi mở (PLAN.md §9)

- Model org cho phép:
- Ngân sách AI Credits hằng tháng / đặt `maxAiCredits` cho brief:
- Repo / project ADO / workspace cần theo dõi: (ghi vào `.env`, không ghi ở đây)
