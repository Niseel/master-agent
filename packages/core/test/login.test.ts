import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { checkGates } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { defaultHubFile, HubFile } from "../src/hub-config.ts";
import { parseSignInLine, signInCommand, signOutCommand } from "../src/login.ts";

const root = path.resolve(import.meta.dirname, "../../..");

test("sign-in commands: constant flags, az profile must be absolute, Work IQ only accepts its EULA on request", () => {
  const ms = signInCommand("microsoft", { configDir: path.resolve("/tmp/az-ado"), deviceCode: true });
  assert.ok(ms.args.includes("--use-device-code") && ms.args.includes("--allow-no-subscriptions"));
  assert.equal(ms.env?.AZURE_CONFIG_DIR, path.resolve("/tmp/az-ado"));
  assert.throws(() => signInCommand("microsoft", { configDir: "relative/dir" }), /tuyệt đối/);
  assert.deepEqual(signInCommand("github").args, ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--skip-ssh-key"]);
  assert.ok(signInCommand("workiq").args.includes("accept-eula"));
  assert.equal(signOutCommand("workiq"), null);
});

test("parseSignInLine: device code and link from az and gh output", () => {
  assert.deepEqual(
    parseSignInLine("To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code ABCD12345 to authenticate."),
    { code: "ABCD12345", url: "https://microsoft.com/devicelogin" },
  );
  assert.deepEqual(parseSignInLine("! First copy your one-time code: 1A2B-3C4D"), { code: "1A2B-3C4D" });
  assert.deepEqual(parseSignInLine("Open this URL to continue in your web browser: https://github.com/login/device"), { url: "https://github.com/login/device" });
  assert.deepEqual(parseSignInLine("Logged in as me"), {});
});

test("checkGates: one row per gate; a custom gate is ok only when its secrets are in the keychain", async () => {
  const cfg = { ...(await loadConfig(root)), runtime: "copilot" as const };
  const file = HubFile.parse({
    ...defaultHubFile(cfg),
    servers: { notes: { type: "http", url: "https://n.example/mcp", headers: { Authorization: "Bearer ${input:notes_token}" } }, plain: { type: "stdio", command: "x" } },
    inputs: [{ id: "notes_token", password: true }],
  });
  const none = await checkGates(cfg, file, { get: () => null });
  assert.deepEqual(none.map((r) => [r.source, r.status, r.signIn]), [["notes", "error", "token"], ["plain", "unknown", null]]);
  assert.match(none[0].detail, /notes_token/);
  const have = await checkGates(cfg, file, { get: () => "t" });
  assert.equal(have[0].status, "unknown");
  const mock = await checkGates({ ...cfg, runtime: "mock" }, defaultHubFile(cfg), { get: () => null });
  assert.deepEqual(mock.map((r) => [r.source, r.status]), [["workiq", "mock"], ["ado", "mock"], ["github", "mock"], ["azure", "mock"]]);
});
