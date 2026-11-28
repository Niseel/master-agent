/**
 * Sign in to a gate from the dashboard (milestone-1 §4): the same CLIs an engineer runs (az, gh, Work IQ), started by
 * the hub, with the device code and link shown on the UI. Commands and flags are constants; the only user value is the
 * az profile dir, which must be an absolute path.
 */
import path from "node:path";

export type SignIn = "microsoft" | "github" | "workiq";

export interface Command {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/** az is a .cmd shim and npx a .cmd on Windows: go through cmd /c (args are constants, so this is safe). */
const shim = (cmd: string, args: string[]): Pick<Command, "command" | "args"> =>
  process.platform === "win32" ? { command: "cmd", args: ["/c", cmd, ...args] } : { command: cmd, args };

const profile = (dir?: string) => {
  if (!dir) return undefined;
  if (!path.isAbsolute(dir)) throw new Error(`Thư mục hồ sơ az phải là đường dẫn tuyệt đối (đang là "${dir}")`);
  return { AZURE_CONFIG_DIR: dir };
};

export function signInCommand(kind: SignIn, opts: { configDir?: string; deviceCode?: boolean } = {}): Command {
  switch (kind) {
    case "microsoft":
      // --allow-no-subscriptions: the ADO account often has no Azure subscription.
      return { ...shim("az", ["login", "--allow-no-subscriptions", ...(opts.deviceCode ? ["--use-device-code"] : [])]), env: profile(opts.configDir) };
    case "github":
      // Without a terminal, gh prints a one-time code and the URL instead of asking questions.
      return { command: "gh", args: ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web", "--skip-ssh-key"] };
    case "workiq":
      // The user accepts Work IQ's EULA here, by pressing the button; an agent may never call accept_eula.
      return shim("npx", ["-y", "@microsoft/workiq", "accept-eula"]);
  }
}

export function signOutCommand(kind: SignIn, opts: { configDir?: string } = {}): Command | null {
  if (kind === "microsoft") return { ...shim("az", ["logout"]), env: profile(opts.configDir) };
  if (kind === "github") return { command: "gh", args: ["auth", "logout", "--hostname", "github.com"] };
  return null;
}

/** Device code and link in a line of az / gh output. */
export function parseSignInLine(line: string): { code?: string; url?: string } {
  const code = line.match(/enter the code ([A-Z0-9-]{6,})/i)?.[1] ?? line.match(/one-time code: ([A-Z0-9]{4}-[A-Z0-9]{4})/i)?.[1];
  const url = line.match(/https:\/\/(?:microsoft\.com\/devicelogin|login\.microsoft\.com\/device|github\.com\/login\/device)\S*/i)?.[0];
  return { ...(code ? { code } : {}), ...(url ? { url: url.replace(/[.,)]+$/, "") } : {}) };
}
