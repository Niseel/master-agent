/**
 * Loaded by `pnpm test` (--import). Audit lines from tests go to a temp dir, not logs/, so logs/ only holds
 * real runs. The test runner passes env and --import to each test file process; only the first process
 * (the one that created the dir) removes it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

if (!process.env.AGENTHUB_LOG_DIR) {
  const dir = mkdtempSync(path.join(tmpdir(), "agenthub-test-"));
  process.env.AGENTHUB_LOG_DIR = dir;
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
}
