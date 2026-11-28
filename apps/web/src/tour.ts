/** Guided tour of the dashboard (driver.js). Steps that explain a tab switch to it before they are shown. */
import { driver, type DriveStep } from "driver.js";
import { flushSync } from "react-dom";

export type TourTab = "detail" | "auth";
type Step = { el: string; tab?: TourTab; title: string; text: string };

export const TOUR: Step[] = [
  { el: "command", title: "Lệnh", text: "Gõ lệnh rồi bấm Chạy (Ctrl+Enter). \"check việc\" gọi mọi agent đọc và gộp thành báo cáo buổi sáng." },
  { el: "runtime", title: "Runtime", text: "mock: phát lại kịch bản trong fixtures/, không tốn credit. copilot: chạy thật qua Copilot SDK." },
  { el: "credits", title: "AI Credits", text: "Credit đã dùng trong lượt so với ngân sách AGENTHUB_MAX_AI_CREDITS. Vượt ngân sách thì lượt dừng." },
  { el: "auth", title: "Đăng nhập nguồn", text: "Mỗi chip là một nguồn (Outlook, Teams, ADO, GitHub, Azure). Xanh: đã đăng nhập hoặc đã gọi tool thành công. Bấm để xem chi tiết." },
  { el: "graph", title: "Sơ đồ agent", text: "Orchestrator, các agent và MCP server. Màu cho biết trạng thái. Bấm một node để xem từng lần gọi tool." },
  { el: "panel", tab: "detail", title: "Chi tiết", text: "Trạng thái, thời gian, credit, tool đã gọi (✓ / ✗ / ⛔ bị gate chặn) và thông báo của node đang chọn." },
  { el: "panel", tab: "auth", title: "Đăng nhập", text: "Kiểm nhanh từng nguồn, không tốn credit, không hiện token. Lỗi đăng nhập có gợi ý cách sửa." },
  { el: "report", title: "Báo cáo", text: "Báo cáo check việc hiện ở đây sau khi mọi agent xong. \"N mới so với <ngày>\": mục chưa có trong lần trước." },
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
