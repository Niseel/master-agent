# AGENTS.md — quy ước cho Copilot agent mode (Work)

Đọc [PLAN.md](PLAN.md) trước khi làm. Hướng dẫn chạy ở Work: [docs/WORK.md](docs/WORK.md).
**Việc đang dở từ Home: [docs/handoff-copilot.md](docs/handoff-copilot.md) — đọc trước tiên.**

**Vai trò (từ 2026-11-26): Work chỉ chạy app và kiểm chứng. Claude Code ở Home viết toàn bộ code.**
- Không sửa code: `apps/`, `packages/`, `scripts/`, `fixtures/`, `package.json`, `pnpm-lock.yaml`, `agenthub.config.ts`.
- Được làm: chạy lệnh trong handoff (`pnpm install/test/typecheck/brief/wit/smoke/list-tools/dashboard`),
  đọc `logs/audit-*.jsonl` và báo cáo, sửa `.env` (không commit).
- Chỉ ghi vào: `docs/step0-results.md`, `docs/work-feedback.md`, `docs/handoff-claude.md`, `docs/mcp-tools.md`
  (do `pnpm list-tools` sinh), checklist `[Work]` trong `PLAN.md`. Cần sửa code thì ghi đề xuất vào
  `docs/work-feedback.md` (file, lý do, lỗi/mã lỗi thật dạng cấu trúc). Home sửa.

- TypeScript strict, ESM, Node 22, pnpm. Chạy `pnpm test` và `pnpm typecheck` trước khi commit.
- API SDK: đối chiếu `node_modules/@microsoft/copilot-sdk/dist/types.d.ts`, không đoán.
- Không thêm tool ghi vào agent (mọi agent trong `packages/core/src/agents.ts` chỉ đọc).
  Mọi thay đổi về quyền phải ghi rõ trong commit message.
- Không dùng `approveAll`. Mọi quyết định tool đi qua `decide()` trong `packages/core/src/security.ts`.
- **Không đưa dữ liệu công ty vào repo**: không vào fixture, test, docs, commit message.
  Chỉ ghi cấu trúc (tên tool, schema, mã lỗi) vào `docs/step0-results.md`, `docs/mcp-tools.md`,
  `docs/work-feedback.md`.
- Không commit `.env`, `logs/`, `reports/`, token.
- Khi có tên tool thật: thay `readTools: "*"` bằng danh sách tên tool đọc cụ thể.
