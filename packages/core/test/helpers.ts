import type { BriefItem } from "../src/brief.ts";

/** A judged source item with every field; override what the test needs. */
export const item = (o: Partial<BriefItem> & Pick<BriefItem, "source" | "ref">): BriefItem => ({
  title: o.ref,
  summary: "s",
  detail: "d",
  isTodo: false,
  important: false,
  urgent: false,
  reason: "",
  priority: null,
  dueDate: null,
  todos: [],
  related: [],
  phishing: false,
  images: [],
  link: null,
  timestamp: null,
  ...o,
});
