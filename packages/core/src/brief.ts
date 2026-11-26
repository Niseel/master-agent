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

/** What a writer agent returns (Phase 3). */
export const ActionResult = z.object({ summary: z.string(), link: z.string().nullable() });
export type ActionResult = z.infer<typeof ActionResult>;
