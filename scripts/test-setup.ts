/**
 * Loaded by `pnpm test` (--import). Audit lines and reports from tests go to a temp dir, not logs/ or reports/,
 * so those only hold real runs. The test runner passes env and --import to each test file process; only the first process
 * (the one that created the dir) removes it.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// deepeval (evals/) sends usage telemetry unless opted out. Evals never report anywhere.
process.env.DEEPEVAL_TELEMETRY_OPT_OUT ??= "1";

if (!process.env.AGENTHUB_LOG_DIR) {
  const dir = mkdtempSync(path.join(tmpdir(), "agenthub-test-"));
  process.env.AGENTHUB_LOG_DIR = dir;
  process.env.AGENTHUB_REPORT_DIR = dir;
  // Never the developer's own gates/agents setup.
  process.env.AGENTHUB_HUB_FILE = path.join(dir, "agenthub.local.json");
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
}
