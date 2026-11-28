/**
 * wit-reader: every field of one ADO work item that matters for "check việc" (milestone-1 §5). The runtime calls
 * `wit_work_item` itself (`directRead`, no model turn, no AI Credits) and reads the fields in code, so text stays
 * verbatim. The model only runs if that call fails.
 */
import { z } from "zod";
import { only, readerAgents, UNTRUSTED_RULE, type AgentSpec } from "./agents.ts";
import type { HubConfig } from "./config.ts";

// Every field required (nullable instead of optional): strict structured output needs it (model fallback).
export const WorkItem = z.object({
  id: z.number().nullable(),
  type: z.string().nullable(),
  title: z.string(),
  state: z.string().nullable(),
  /** ADO Priority field, 1 (highest) to 4. */
  priority: z.number().nullable(),
  storyPoints: z.number().nullable(),
  originalEstimate: z.number().nullable(),
  remainingWork: z.number().nullable(),
  completedWork: z.number().nullable(),
  assignedTo: z.string().nullable(),
  iteration: z.string().nullable(),
  /** Due date, else target date (ISO). */
  dueDate: z.string().nullable(),
  tags: z.array(z.string()),
  /** Plain text, one line per paragraph or list item. */
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  url: z.string().nullable(),
});
export type WorkItem = z.infer<typeof WorkItem>;

export const DIRECT_READ_OK = "Đọc thẳng work item (nguyên văn, không qua model, không tốn AI Credits)";
export const DIRECT_READ_FAILED = "Không đọc thẳng được work item: để model đọc";

/** HTML of an ADO rich-text field -> plain lines: list items, <br>, blocks become line breaks; tags dropped; entities decoded. */
export const htmlLines = (html: string) =>
  html
    .replace(/<li\b[^>]*>|<br\s*\/?>|<\/(?:li|p|div|h\d|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** Non-empty trimmed lines; list markers ("-", "*", "1.", "AC1:") dropped. */
export const lines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|AC\s*\d+\s*[:.)-])\s*/i, "").trim())
    .filter(Boolean);

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const html = (v: unknown) => (typeof v === "string" ? lines(htmlLines(v)) : []);

/**
 * Work item fields of a `wit_work_item` get result. `data`: the tool result (MCP result object, content text or parsed
 * JSON). null = no work item with `fields` found in it.
 * ponytail: one AC per line/list item; a criterion written over several lines (Given/When/Then) splits.
 */
export function workItemFrom(data: unknown): WorkItem | null {
  const seen = new Set<unknown>();
  const find = (v: unknown): Record<string, unknown> | null => {
    if (typeof v === "string") {
      try {
        return find(JSON.parse(v));
      } catch {
        return null;
      }
    }
    if (!v || typeof v !== "object" || seen.has(v)) return null;
    seen.add(v);
    const o = v as Record<string, unknown>;
    if (o.fields && typeof o.fields === "object" && "System.Title" in o.fields) return o;
    for (const x of Object.values(o)) {
      const f = find(x);
      if (f) return f;
    }
    return null;
  };
  const wi = find(data);
  if (!wi) return null;
  const f = wi.fields as Record<string, unknown>;
  const who = f["System.AssignedTo"];
  const links = wi._links as { html?: { href?: unknown } } | undefined;
  return {
    id: num(wi.id) ?? num(f["System.Id"]),
    type: str(f["System.WorkItemType"]),
    title: String(f["System.Title"] ?? ""),
    state: str(f["System.State"]),
    priority: num(f["Microsoft.VSTS.Common.Priority"]),
    storyPoints: num(f["Microsoft.VSTS.Scheduling.StoryPoints"]),
    originalEstimate: num(f["Microsoft.VSTS.Scheduling.OriginalEstimate"]),
    remainingWork: num(f["Microsoft.VSTS.Scheduling.RemainingWork"]),
    completedWork: num(f["Microsoft.VSTS.Scheduling.CompletedWork"]),
    // Identity fields come as { displayName, uniqueName, ... } or as "Name <mail>".
    assignedTo: str((who as { displayName?: unknown } | null)?.displayName) ?? str(who),
    iteration: str(f["System.IterationPath"]),
    dueDate: str(f["Microsoft.VSTS.Scheduling.DueDate"]) ?? str(f["Microsoft.VSTS.Scheduling.TargetDate"]),
    tags: (str(f["System.Tags"]) ?? "").split(";").map((t) => t.trim()).filter(Boolean),
    description: html(f["System.Description"]).join("\n"),
    acceptanceCriteria: html(f["Microsoft.VSTS.Common.AcceptanceCriteria"]),
    url: str(links?.html?.href),
  };
}

/**
 * Reads one work item. Same ADO server and read-only header as board-reader, but only `wit_work_item`. The runtime
 * calls that tool itself (`directRead`) and reads the fields in code; the model only runs if that call fails.
 */
export function witReader(cfg: HubConfig, id: number): AgentSpec {
  const board = readerAgents(cfg).find((a) => a.name === "board-reader")!;
  return {
    ...board,
    name: "wit-reader",
    displayName: "Work item ADO",
    prompt:
      "Bạn là agent đọc đủ thông tin một work item Azure DevOps.\n\n" +
      `${UNTRUSTED_RULE}\n\nChỉ dùng tool chỉ-đọc. Trả về JSON đúng schema được yêu cầu.`,
    task:
      `Đọc work item ${id} bằng \`wit_work_item\` action "get" (project "${cfg.ado.project || "(theo work item)"}"). ` +
      "Điền các trường từ `fields` của work item, giữ NGUYÊN VĂN (không dịch, không diễn đạt lại). description và " +
      "acceptanceCriteria: bỏ thẻ HTML; mỗi mục danh sách hoặc mỗi dòng AC là một phần tử. Trường không có thì null " +
      "(tags, acceptanceCriteria: []; description: \"\").",
    readTools: only("ado", ["wit_work_item"]),
    // Same call the model made at Work run 11 (`action`, `id`, `project`).
    directRead: { server: "ado", tool: "wit_work_item", args: { action: "get", id, ...(cfg.ado.project ? { project: cfg.ado.project } : {}) } },
    output: "workItem",
  };
}
