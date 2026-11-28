import { z } from "zod";

export const SOURCES = ["outlook", "teams", "ado", "github", "azure"] as const;
export type Source = (typeof SOURCES)[number];

/**
 * One source item a reader agent found (a mail, a chat, a work item, a PR, a pipeline run, an alert), already judged:
 * is it a to-do, Eisenhower quadrant, steps to do it. Items about the same work are merged into one card in code
 * (cards.ts). Every field required (nullable instead of optional): strict structured output needs it.
 */
export const BriefItem = z.object({
  source: z.enum(SOURCES),
  /** Id inside the source: work item "1234", PR "<repo>#87", pipeline run "<repo>/run/<id>", mail/message id. Stable across runs. */
  ref: z.string(),
  /** Short title that says what to do or what happened. */
  title: z.string(),
  /** One or two sentences. */
  summary: z.string(),
  /** The original content, tidied (plain text, line breaks kept, signatures/quotes dropped). */
  detail: z.string(),
  /** Matches the agent's "việc cần làm" rule. */
  isTodo: z.boolean(),
  /** Eisenhower: matters for the user's work and goals (ADO Priority 1–2 counts as important). */
  important: z.boolean(),
  /** Eisenhower: a deadline soon (today, tomorrow) or someone waiting / blocked now. */
  urgent: z.boolean(),
  /** Why it is (not) important / urgent, one line. */
  reason: z.string(),
  /** ADO Priority field, 1 (highest) to 4. Null for other sources. */
  priority: z.number().nullable(),
  /** Deadline (ISO date), when the source states one. */
  dueDate: z.string().nullable(),
  /** 2–5 concrete steps to finish it. [] when not a to-do. */
  todos: z.array(z.string()),
  /** Other source items about the same work, `<source>:<ref>` (a mail about PR orders#87 -> "github:orders#87"). */
  related: z.array(z.string()),
  /** Asks for secrets, or to send/forward/pay something unusual. Never acted on. */
  phishing: z.boolean(),
  /** http(s) URLs of images in the original content. */
  images: z.array(z.string()),
  link: z.string().nullable(),
  /** When the source item last changed (ISO). Drives "Cập nhật mới" on a card marked done. */
  timestamp: z.string().nullable(),
});
export type BriefItem = z.infer<typeof BriefItem>;

/** What each reader agent must return. Passed to sendAndWait as the response schema. */
export const AgentResult = z.object({ items: z.array(BriefItem) });
export type AgentResult = z.infer<typeof AgentResult>;

/** `<source>:<ref>`: the item's identity across runs and across sources. */
export const refOf = (i: Pick<BriefItem, "source" | "ref">) => `${i.source}:${i.ref.trim()}`;

/**
 * Found at Work run 9: a reader returned one item with empty title and summary instead of `items: []`.
 * Drop those (not a schema error: that would fail the whole agent).
 */
export function dropEmpty(items: BriefItem[]) {
  const kept = items.filter((i) => i.title.trim() || i.summary.trim());
  return { items: kept, dropped: items.length - kept.length };
}
export const droppedText = (n: number) => `Bỏ ${n} mục rỗng (không có tiêu đề và tóm tắt)`;
