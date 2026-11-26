/**
 * Error -> hint for the user. Pure (no Node APIs): used by the report, the CLI and the dashboard in the browser.
 */

/** Prefix the Copilot runtime puts on a tool error when onPreToolUse denies the call (found at Work 2026-11-26). */
export const DENIED_PREFIX = "Denied by preToolUse hook: ";

/**
 * Known failure causes -> what the user should do. Agents never fix these themselves.
 * - `blocking`: the source is unusable until the user acts (auth, EULA, config): the agent counts as failed
 *   and its items are dropped (they only restate the error, seen at Work with EULA).
 * - `warning`: part of a source is unreadable (one Azure workspace) while the rest still works: shown under
 *   "Cảnh báo", items kept.
 * - `retry`: model mistakes it usually retries past; shown only when the agent fails with them.
 * Errors that match no hint are shown under "Cảnh báo" (unless the agent failed anyway): an unknown error must
 * never leave the report saying "0 lỗi" (found at Work 2026-11-26 with an Azure 401).
 */
type HintKind = "blocking" | "warning" | "retry";
const HINTS: { re: RegExp; kind: HintKind; text: string }[] = [
  { re: /EULA/i, kind: "blocking", text: "Tự chạy `npx -y @microsoft/workiq accept-eula` trong terminal (agent không được gọi accept_eula)." },
  { re: /AADSTS65001/, kind: "blocking", text: "Work IQ cần admin consent: hỏi IT." },
  {
    // Found at Work 2026-11-26: refresh token revoked after a password change; `az account show` still works (cache).
    re: /"status":\s*401|Azure credentials not found|AADSTS50173|invalid_grant/,
    kind: "blocking",
    text:
      "Token đăng nhập hết hạn hoặc bị thu hồi (thường sau khi đổi mật khẩu). Azure: `az logout` rồi `az login` " +
      "(đúng AZURE_CONFIG_DIR); ADO: như vậy với ADO_AZURE_CONFIG_DIR. Kiểm bằng `az account get-access-token` " +
      "(`az account show` đọc cache, không đủ). GitHub: `gh auth login`, rồi đặt lại GITHUB_MCP_TOKEN (hoặc để trống).",
  },
  { re: /VS30063/, kind: "blocking", text: "Tài khoản `az` không thuộc org ADO: `az login` đúng tài khoản, hoặc đặt ADO_AZURE_CONFIG_DIR (đường dẫn tuyệt đối) trong .env." },
  { re: /^Chưa cấu hình/, kind: "blocking", text: "Đặt biến còn thiếu trong `.env` (mẫu: `.env.example`, hướng dẫn: docs/WORK.md)." },
  { re: /ngân sách|limits_exhausted/i, kind: "blocking", text: "Tăng AGENTHUB_MAX_AI_CREDITS nếu cần (tối thiểu 30 mỗi agent)." },
  {
    re: /InsufficientAccessError|Could not find workspace/,
    kind: "warning",
    text:
      "Không đọc được 1 workspace. Azure MCP dùng tài khoản `az login` (AzureCliCredential): kiểm tra `az account get-access-token`, " +
      "tên workspace / subscription trong .env và quyền đọc (ví dụ Log Analytics Reader), hoặc bỏ workspace khỏi AZURE_LOG_WORKSPACE.",
  },
  {
    re: /unknown arguments|Missing Required options|is not available for the 'monitor' tool/,
    kind: "retry",
    text: "Model gọi sai lệnh/tham số Azure MCP. Nếu lặp lại: sửa task `cloud-reader` trong agents.ts (danh sách lệnh ở docs/mcp-tools.md).",
  },
  { re: /SYN0002/, kind: "retry", text: "KQL dùng từ khoá (ví dụ `last`) làm tên cột. Nếu lặp lại: nhắc tên cột khác (`lastSeen`) trong task `cloud-reader`." },
  { re: /BadArgumentError/, kind: "retry", text: "KQL sai tên bảng/cột. Nếu lặp lại: ghi tên bảng đúng vào task `cloud-reader`." },
  { re: /«SELECT»|Expecting constant value/, kind: "retry", text: "WIQL không có subquery: dùng `[System.Id] IN (@Follows)` hoặc `wit_work_item` action `my` (task `board-reader`)." },
];
export const findHint = (error: string) => HINTS.find(({ re }) => re.test(error));
export const hint = (error: string) => findHint(error)?.text ?? null;
export const isBlocking = (error: string) => findHint(error)?.kind === "blocking";
