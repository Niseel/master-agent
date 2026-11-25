# AGENTS.md — quy ước cho Copilot agent mode (Work)

Đọc [PLAN.md](PLAN.md) trước khi làm. Hướng dẫn chạy ở Work: [docs/WORK.md](docs/WORK.md).
**Việc đang dở từ Home: [docs/handoff-copilot.md](docs/handoff-copilot.md) — đọc trước tiên.**

- TypeScript strict, ESM, Node 22, pnpm. Chạy `pnpm test` và `pnpm typecheck` trước khi commit.
- API SDK: đối chiếu `node_modules/@github/copilot-sdk/dist/types.d.ts`, không đoán.
- Không thêm tool ghi vào agent đọc (`kind: "reader"` trong `packages/core/src/agents.ts`).
  Mọi thay đổi về quyền phải ghi rõ trong commit message.
- Không dùng `approveAll`. Mọi quyết định tool đi qua `decide()` trong `packages/core/src/security.ts`.
- **Không đưa dữ liệu công ty vào repo**: không vào fixture, test, docs, commit message.
  Chỉ ghi cấu trúc (tên tool, schema, mã lỗi) vào `docs/step0-results.md`, `docs/mcp-tools.md`,
  `docs/work-feedback.md`.
- Không commit `.env`, `logs/`, `reports/`, token.
- Khi có tên tool thật: thay `readTools: "*"` bằng danh sách tên tool đọc cụ thể.
