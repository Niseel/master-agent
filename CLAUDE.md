# CLAUDE.md — quy ước cho Claude Code (Home)

Đọc [PLAN.md](PLAN.md) trước khi làm. Đây là môi trường Home: không có Copilot công ty, không có dữ liệu công ty.

- Mặc định `AGENTHUB_RUNTIME=mock`. Mọi feature phải chạy end-to-end với `mock` trước khi coi là xong.
- `pnpm test` + `pnpm typecheck` phải xanh. Test không gọi dịch vụ thật.
- API SDK: đối chiếu `node_modules/@github/copilot-sdk/dist/types.d.ts`, không đoán.
- Không tự thêm tool ghi vào agent đọc. Thay đổi quyền ghi rõ trong commit message.
- Khi có `docs/work-feedback.md` mới: cập nhật `packages/mock-mcp` + `fixtures/` cho khớp thật trước, rồi mới sửa code.
- Phần chỉ kiểm chứng được ở Work: đánh dấu `[Work]` trong checklist PLAN.md và ghi cách kiểm tra vào `docs/WORK.md`.
- Fixture là dữ liệu tự tạo. Không bao giờ dùng dữ liệu công ty.
