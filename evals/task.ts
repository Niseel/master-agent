/**
 * Eval Task: one case of the check việc eval, like a unit test (milestone-1 §7).
 * Thành tells a situation, Claude writes it as synthetic data + expected answer (status "draft"),
 * Thành checks every field until 100% sure (status "verified"). Only verified Tasks count toward the M1 thresholds.
 * Files: evals/tasks/<id>.json. Data is always made up: never company data.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** A source item, written `<source>:<id>`: `ado:1234`, `github:orders#87`, `outlook:m1`, `teams:t1`, `azure:a1`. */
const Ref = z.string().regex(/^(outlook|teams|ado|github|azure):\S+$/);

export const ExpectedTodo = z.object({
  /** Every source item this to-do comes from. More than one = the same work seen in several places, to merge into one card. */
  refs: z.array(Ref).min(1),
  /** Eisenhower: important (matters for the user's goals; ADO Priority when there is one) × urgent (deadline or content). */
  important: z.boolean(),
  urgent: z.boolean(),
  /** Facts the card must state (judged for meaning, not exact words). */
  mustMention: z.array(z.string()),
});
export type ExpectedTodo = z.infer<typeof ExpectedTodo>;

export const EvalTask = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  /** item: one source item -> one card. morning: a whole morning of items -> the to-do list (misses, extras, merges). */
  size: z.enum(["item", "morning"]),
  status: z.enum(["draft", "verified"]),
  /** Set when Thành verified it. */
  verified: z.object({ by: z.string(), at: z.string() }).nullable(),
  /** The situation in Thành's words, names removed. */
  story: z.string(),
  /** "Now" of the situation (ISO): the run's time window ends here, so dated data stays inside it. */
  now: z.string(),
  /** Synthetic source data per MCP server, same shape as fixtures/data/<server>.json. */
  data: z.record(z.string(), z.unknown()),
  expected: z.object({
    todos: z.array(ExpectedTodo),
    /** Source items that must NOT become a to-do (newsletters, FYI, already done). */
    notTodos: z.array(Ref),
    /** Items asking for secrets or an unusual send/forward/payment: flagged as phishing, never a to-do. */
    phishing: z.array(Ref).default([]),
  }),
});
export type EvalTask = z.infer<typeof EvalTask>;

export const TASK_DIR = path.join(import.meta.dirname, "tasks");

/** Tasks in `dir`, sorted by id. Drafts only when asked: they never count toward a threshold. Bad files throw with the file name. */
export function loadTasks(dir = TASK_DIR, { drafts = false } = {}): EvalTask[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return files
    .sort()
    .map((f) => {
      const parsed = EvalTask.safeParse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
      if (!parsed.success) throw new Error(`${f}: ${z.prettifyError(parsed.error)}`);
      if (parsed.data.status === "verified" && !parsed.data.verified) throw new Error(`${f}: status "verified" cần trường verified { by, at }`);
      return parsed.data;
    })
    .filter((t) => drafts || t.status === "verified");
}
