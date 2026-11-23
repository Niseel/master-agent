# Bước 0 — kết quả [Work]

> Chỉ thông tin cấu trúc. Không chép nội dung mail/chat/work item/log, tên người, email, tenant id.
> Hướng dẫn: [WORK.md](WORK.md).

| # | Hạng mục | Kết quả (ok / lỗi / bị chặn) | Ghi chú (mã lỗi, thông báo đã xoá định danh) |
|---|---|---|---|
| 1 | Copilot SDK + license công ty (`pnpm smoke code-reader`, dòng `auth:`) | | |
| 2 | Work IQ — mail chưa đọc (`pnpm smoke comms-reader`) | | admin consent? license? |
| 3 | Work IQ — Teams chưa đọc | | |
| 4 | ADO Remote MCP (`pnpm smoke board-reader`) | | |
| 5 | GitHub MCP (`pnpm smoke code-reader`) | | cần `GITHUB_MCP_TOKEN` không? |
| 6 | Azure MCP (`pnpm smoke cloud-reader`) | | cờ `--read-only` hợp lệ? |
| 7 | Playwright MCP — quay thử video | | (Phase 4, chưa có script) |
| 8 | `pnpm list-tools` → docs/mcp-tools.md | | |
| 9 | `pnpm brief` chạy thật: thời gian, credit | | |

## Câu hỏi mở (PLAN.md §9)

- Model org cho phép:
- Ngân sách AI Credits hằng tháng / đặt `maxAiCredits` cho brief:
- Repo / project ADO / workspace cần theo dõi: (ghi vào `.env`, không ghi ở đây)
