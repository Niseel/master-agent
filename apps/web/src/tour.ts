/** Guided tour of the dashboard (driver.js). Steps that explain a tab switch to it before they are shown. */
import { driver, type DriveStep } from "driver.js";
import { flushSync } from "react-dom";

export type TourTab = "detail" | "config" | "auth";
type Step = { el: string; tab?: TourTab; title: string; text: string };

export const TOUR: Step[] = [
  { el: "command", title: "Lệnh", text: "Gõ lệnh rồi bấm Chạy (Ctrl+Enter). \"check việc\" gọi mọi agent đọc và gộp thành báo cáo buổi sáng." },
  { el: "window", title: "Khoảng thời gian", text: "Chỉ đọc mục thay đổi trong khoảng này: hôm nay, 24 giờ, 3 ngày hoặc 7 ngày." },
  { el: "agents", title: "Agent và trần credit", text: "Bỏ chọn agent không cần chạy lần này. Trần credit là mức tối đa, không phải số tiêu; mỗi agent cần tối thiểu 30." },
  { el: "runtime", title: "Runtime", text: "mock: phát lại kịch bản trong fixtures/, không tốn credit. copilot: chạy thật qua Copilot SDK." },
  { el: "credits", title: "AI Credits", text: "Credit đã dùng trong lượt so với ngân sách AGENTHUB_MAX_AI_CREDITS. Vượt ngân sách thì lượt dừng." },
  { el: "auth", title: "Đăng nhập cổng", text: "Mỗi chip là một cổng MCP. Xanh: đã đăng nhập hoặc đã gọi tool thành công. Bấm để mở tab Đăng nhập." },
  { el: "graph", title: "Sơ đồ", text: "Orchestrator, các Agent và cổng MCP (nhãn trên mỗi node). Màu cho biết trạng thái. Bấm một node để xem từng lần gọi tool." },
  { el: "catalog", title: "Thêm cổng và agent", text: "Mở catalog: cổng có sẵn (Outlook + Teams, Azure DevOps, GitHub, Azure), agent có sẵn, cổng tự tạo, import từ mcp.json của VS Code. Kéo vào sơ đồ, rồi kéo dây từ agent sang cổng. Chọn dây hoặc node rồi bấm Delete để gỡ." },
  { el: "panel", tab: "detail", title: "Chi tiết", text: "Trạng thái, thời gian, credit, tool đã gọi (✓ / ✗ / ⛔ bị gate chặn) và thông báo của node đang chọn." },
  { el: "panel", tab: "config", title: "Cấu hình", text: "Sửa node đang chọn. Cổng: điền thông tin (mỗi ô có hướng dẫn lấy ở đâu), Lấy danh sách tool rồi tick tool được dùng; tool ghi luôn bị khoá. Agent: quy tắc việc cần làm, cổng được đọc." },
  { el: "panel", tab: "auth", title: "Đăng nhập", text: "Cấp quyền cho từng cổng: nút Đăng nhập Microsoft / GitHub, mã thiết bị hiện ngay đây. Kiểm trạng thái không tốn credit, không hiện token." },
  { el: "report", title: "Việc cần làm", text: "Card việc đã gộp trùng giữa các nguồn, xếp theo ô Eisenhower (Làm ngay, Lên lịch, …). Bấm card để xem nội dung gốc và todo list; sửa, thêm, sắp xếp, gạch bỏ bước; đánh dấu Đã xong hoặc Ẩn. Nguồn đổi sau đó thì card hiện lại với nhãn \"Cập nhật mới\"." },
];

export function startTour(setTab: (t: TourTab) => void) {
  const steps: DriveStep[] = TOUR.map((s) => ({ element: `[data-tour="${s.el}"]`, data: { tab: s.tab }, popover: { title: s.title, description: s.text } }));
  // flushSync: the tab is rendered before driver.js measures the next element.
  const go = (by: 1 | -1, move: () => void) => {
    const tab = steps[(d.getActiveIndex() ?? 0) + by]?.data?.tab;
    if (tab) flushSync(() => setTab(tab));
    move();
  };
  const d = driver({
    steps,
    showProgress: true,
    progressText: "{{current}} / {{total}}",
    nextBtnText: "Tiếp",
    prevBtnText: "Trước",
    doneBtnText: "Xong",
    popoverClass: "tour",
    onNextClick: () => go(1, d.moveNext),
    onPrevClick: () => go(-1, d.movePrevious),
  });
  d.drive();
}
