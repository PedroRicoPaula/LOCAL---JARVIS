/**
 * core/executors/apps.ts — the first real executor (SPEC.md § 38: "only
 * executors invoked *by the gate* cause side effects"). `SHELL_EXEC`'s
 * one supported shape right now: launch a macOS app, optionally with a
 * path (`open -a <App> [path]`), nothing else.
 *
 * `open` is a narrow macOS launcher, not a shell interpreter — no `&&`,
 * no pipes, no injection surface. `execFile` (never `exec`) with args as
 * an array, never string-concatenated, means even a hostile `app`/`path`
 * value can't do anything beyond "fail to find that app." A skill's
 * `humanSummary` always names the exact app before the owner approves,
 * so there's nothing hidden in what gets run.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;

export interface OpenAppPayload {
  action: "open_app";
  app: string;
  path?: string;
}

function isOpenAppPayload(payload: unknown): payload is OpenAppPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (p["action"] !== "open_app") return false;
  if (typeof p["app"] !== "string" || p["app"].trim() === "") return false;
  if (p["path"] !== undefined && typeof p["path"] !== "string") return false;
  return true;
}

/** Verified-payload -> real side effect. The gate has already checked
 * the HMAC signature before calling this (see gate.ts's `decide()`) --
 * this only re-validates the *shape*, which is a correctness check, not
 * a trust boundary. */
export async function openApp(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isOpenAppPayload(payload)) {
    return { ok: false, error: `malformed open_app payload: ${JSON.stringify(payload)}` };
  }
  const args = ["-a", payload.app, ...(payload.path ? [payload.path] : [])];
  try {
    await execFileFn("open", args);
    return { ok: true, result: { app: payload.app, path: payload.path ?? null } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
