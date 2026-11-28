import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TOUR } from "../src/tour.ts";

test("every tour step points at an anchor and a tab that exist in App.tsx", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  for (const s of TOUR) {
    assert.ok(app.includes(`data-tour="${s.el}"`), `thiếu data-tour="${s.el}"`);
    if (s.tab) assert.ok(app.includes(`setTab("${s.tab}")`), `thiếu tab ${s.tab}`);
  }
  assert.ok(app.includes("startTour(setTab)"));
});
