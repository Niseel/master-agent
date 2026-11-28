import { z } from "zod";

export const SOURCES = ["outlook", "teams", "ado", "github", "azure"] as const;

// Every field required (nullable instead of optional): strict structured output needs it.
export const BriefItem = z.object({
  source: z.enum(SOURCES),
  title: z.string(),
  summary: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  actionRequired: z.boolean(),
  suggestedAction: z.string().nullable(),
  link: z.string().nullable(),
  timestamp: z.string().nullable(),
});
export type BriefItem = z.infer<typeof BriefItem>;

/** What each reader agent must return. Passed to sendAndWait as the response schema. */
export const AgentResult = z.object({ items: z.array(BriefItem) });
export type AgentResult = z.infer<typeof AgentResult>;

/**
 * Found at Work run 9: a reader returned one item with empty title and summary instead of `items: []`.
 * Drop those (not a schema error: that would fail the whole agent).
 */
export function dropEmpty(items: BriefItem[]) {
  const kept = items.filter((i) => i.title.trim() || i.summary.trim());
  return { items: kept, dropped: items.length - kept.length };
}
export const droppedText = (n: number) => `Bỏ ${n} mục rỗng (không có tiêu đề và tóm tắt)`;

