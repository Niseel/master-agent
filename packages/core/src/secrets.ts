/**
 * Secrets of gates (tokens, keys) in the OS keychain: Windows Credential Manager, macOS Keychain, Linux Secret Service.
 * agenthub.local.json only holds `${input:<id>}`; the value is filled when a run starts and never sent to the browser.
 */
import { Entry } from "@napi-rs/keyring";
import type { HubFile } from "./hub-config.ts";

const SERVICE = "agent-hub";

export const keychain = {
  get(id: string): string | null {
    try {
      return new Entry(SERVICE, id).getPassword();
    } catch {
      return null;
    }
  },
  set(id: string, value: string) {
    new Entry(SERVICE, id).setPassword(value);
  },
  delete(id: string): boolean {
    try {
      return new Entry(SERVICE, id).deletePassword();
    } catch {
      return false;
    }
  },
};
export type SecretStore = Pick<typeof keychain, "get">;

const INPUT = /\$\{input:([A-Za-z0-9_.-]+)\}/g;

/** Every `${input:id}` in the strings of `value`, filled: password inputs from the keychain, others from file.values. */
export function resolveInputs<T>(value: T, file: Pick<HubFile, "inputs" | "values">, store: SecretStore = keychain): { value: T; missing: string[] } {
  const secret = new Set(file.inputs.filter((i) => i.password).map((i) => i.id));
  const missing = new Set<string>();
  const fill = (s: string) =>
    s.replace(INPUT, (m, id: string) => {
      const v = secret.has(id) ? store.get(id) : file.values[id];
      if (v === null || v === undefined || v === "") {
        missing.add(id);
        return m;
      }
      return v;
    });
  const walk = (v: unknown): unknown =>
    typeof v === "string" ? fill(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  return { value: walk(value) as T, missing: [...missing] };
}
