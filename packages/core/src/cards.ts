/**
 * Check việc output (milestone-1 §5): source items -> to-do cards. Items about the same work (same `<source>:<ref>`, or
 * linked through `related`) merge into one card; cards sort by Eisenhower quadrant, then ADO Priority, then deadline.
 * The user's marks (done / hidden) and todo edits live in a local state file and survive runs.
 * Pure functions (also used in the browser); the server keeps the state file.
 */
import { refOf, type BriefItem, type Source } from "./brief.ts";

export type Quadrant = 1 | 2 | 3 | 4;
/** Eisenhower: 1 important + urgent, 2 important, 3 urgent, 4 neither. */
export const quadrant = (important: boolean, urgent: boolean): Quadrant => (important ? (urgent ? 1 : 2) : urgent ? 3 : 4);
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  1: "Làm ngay",
  2: "Lên lịch",
  3: "Làm nhanh hoặc nhờ người",
  4: "Để sau",
};
export const SOURCE_LABEL: Record<Source, string> = { outlook: "Outlook", teams: "Teams", ado: "Azure DevOps", github: "GitHub", azure: "Azure" };

export interface Card {
  /** Ref of the main item: the card's identity. */
  key: string;
  /** Main item first, then the others about the same work. */
  items: BriefItem[];
  title: string;
  summary: string;
  detail: string;
  reason: string;
  isTodo: boolean;
  important: boolean;
  urgent: boolean;
  quadrant: Quadrant;
  priority: number | null;
  dueDate: string | null;
  todos: string[];
  phishing: boolean;
  link: string | null;
  images: string[];
  /** Latest `timestamp` of its items. */
  updatedAt: string | null;
}

// The main item is the system of record (work item, PR, pipeline, alert), not the chat or mail about it.
const MAIN_RANK: Record<Source, number> = { ado: 0, github: 1, azure: 2, teams: 3, outlook: 4 };
const sorted = <T extends string | number>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null && x !== "").sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const min = <T extends string | number>(xs: (T | null)[]) => sorted(xs)[0] ?? null;
const max = <T extends string | number>(xs: (T | null)[]) => sorted(xs).at(-1) ?? null;

export function mergeCards(items: BriefItem[]): Card[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const i of items) {
    find(refOf(i));
    // A phishing item never joins real work, whatever it claims to be about.
    if (!i.phishing) for (const r of i.related) union(refOf(i), r.trim());
  }
  const groups = new Map<string, BriefItem[]>();
  for (const i of items) {
    const root = i.phishing ? `phishing|${refOf(i)}` : find(refOf(i));
    groups.set(root, [...(groups.get(root) ?? []), i]);
  }
  return [...groups.values()].map((group) => {
    const byRank = [...group].sort((a, b) => MAIN_RANK[a.source] - MAIN_RANK[b.source] || Number(b.isTodo) - Number(a.isTodo));
    const main = byRank[0];
    const important = group.some((i) => i.important);
    const urgent = group.some((i) => i.urgent);
    return {
      key: refOf(main),
      items: byRank,
      title: main.title,
      summary: main.summary,
      detail: main.detail,
      reason: main.reason,
      isTodo: group.some((i) => i.isTodo),
      important,
      urgent,
      quadrant: quadrant(important, urgent),
      priority: min(group.map((i) => i.priority)),
      dueDate: min(group.map((i) => i.dueDate)),
      todos: byRank.find((i) => i.todos.length)?.todos ?? [],
      phishing: group.some((i) => i.phishing),
      link: byRank.find((i) => i.link)?.link ?? null,
      images: [...new Set(group.flatMap((i) => i.images))],
      updatedAt: max(group.map((i) => i.timestamp)),
    };
  });
}

/** Quadrant, then ADO Priority (none last), then deadline (none last), then most recently changed. */
export const sortCards = <T extends Card>(cards: T[]) =>
  [...cards].sort(
    (a, b) =>
      a.quadrant - b.quadrant ||
      (a.priority ?? 9) - (b.priority ?? 9) ||
      (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") ||
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );

export interface TodoStep {
  text: string;
  done: boolean;
  /** Crossed out: dropped, kept visible. */
  struck: boolean;
}
export interface CardState {
  status: "open" | "done" | "hidden";
  /** When the user marked it. */
  at: string;
  /** The card's updatedAt when marked: a later change shows it again as "Cập nhật mới". */
  seen: string | null;
  /** The user's todo list once edited; replaces the model's suggestion. */
  todos?: TodoStep[];
}
export type CardStates = Record<string, CardState>;

export interface CardView extends Card {
  state: "open" | "done" | "hidden" | "updated";
  steps: TodoStep[];
  /** No ref of this card was in the previous day's brief. */
  isNew: boolean;
}

/** Cards with the user's marks applied. A state is found by any ref of the card, so a card whose main item changed keeps it. */
export function viewCards(cards: Card[], states: CardStates, previousRefs?: Set<string>): CardView[] {
  return sortCards(cards).map((c) => {
    const s = states[c.key] ?? c.items.map((i) => states[refOf(i)]).find(Boolean);
    const changed = !!s && s.status !== "open" && !!c.updatedAt && (!s.seen || c.updatedAt > s.seen);
    return {
      ...c,
      state: !s ? "open" : changed ? "updated" : s.status,
      steps: s?.todos ?? c.todos.map((text) => ({ text, done: false, struck: false })),
      isNew: !!previousRefs && !c.items.some((i) => previousRefs.has(refOf(i))),
    };
  });
}

const where = (c: Card) =>
  [
    ...new Set(c.items.map((i) => SOURCE_LABEL[i.source])),
    c.priority ? `P${c.priority}` : "",
    c.dueDate ? `hạn ${c.dueDate.slice(0, 10)}` : "",
  ].filter(Boolean).join(", ");

/** The to-do list as Markdown, to paste anywhere (milestone-1 §5 "Xuất"). Hidden cards are left out. */
export function cardsMarkdown(views: CardView[], date: string): string {
  const out = [`# Việc cần làm — ${date}`, ""];
  const todo = views.filter((v) => v.isTodo && !v.phishing && v.state !== "hidden");
  for (const q of [1, 2, 3, 4] as Quadrant[]) {
    const list = todo.filter((v) => v.quadrant === q);
    if (!list.length) continue;
    out.push(`## ${QUADRANT_LABEL[q]}`, "");
    for (const v of list) {
      const box = v.state === "done" ? "x" : " ";
      const title = v.link && /^https?:\/\//.test(v.link) ? `[${v.title}](${v.link})` : v.title;
      out.push(`- [${box}] **${title}** (${where(v)})${v.state === "updated" ? " — cập nhật mới" : ""}`, `  ${v.summary}`);
      for (const s of v.steps) out.push(`  - [${s.done ? "x" : " "}] ${s.struck ? `~~${s.text}~~` : s.text}`);
    }
    out.push("");
  }
  const phishing = views.filter((v) => v.phishing);
  if (phishing.length) out.push("## Nghi lừa đảo (không làm theo)", "", ...phishing.map((v) => `- ${v.title}`), "");
  return out.join("\n");
}
