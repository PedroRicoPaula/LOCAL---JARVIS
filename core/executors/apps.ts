/**
 * core/executors/apps.ts — the first real executor (SPEC.md § 38: "only
 * executors invoked *by the gate* cause side effects"). `APP_CONTROL`'s
 * two supported shapes: launch a macOS app, optionally with a path
 * (`open -a <App> [path]`), and quit one (`osascript -e 'tell
 * application "<App>" to quit'`).
 *
 * `open` is a narrow macOS launcher, not a shell interpreter — no `&&`,
 * no pipes, no injection surface. `execFile` (never `exec`) with args as
 * an array, never string-concatenated, means even a hostile `app`/`path`
 * value can't do anything beyond "fail to find that app." A skill's
 * `humanSummary` always names the exact app; `APP_CONTROL` is green-tier
 * (auto-runs, no owner click) but still audit-logged by the gate
 * (`Gate.propose()`'s own green-tier executor call, ADR pending) --
 * nothing here is hidden, just not blocked on approval.
 *
 * `close_app` goes through `osascript`, not `pkill` -- AppleScript's
 * "quit" asks the app to quit gracefully (lets it prompt to save unsaved
 * work, run its own shutdown handlers), `pkill` would just signal it.
 * `execFile` still means no shell is ever invoked, so there is no shell-
 * metacharacter injection surface either way; the one remaining risk
 * specific to embedding `app` inside the AppleScript source string
 * itself (a literal `"` breaking out of the quoted name) is rejected
 * outright by `isCloseAppPayload` rather than escaped, since a real
 * macOS app name never legitimately contains one.
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

/** Verified-payload -> real side effect. Reached two ways: a yellow-tier
 * capability's `decide()` (HMAC-signature-verified first) or a
 * green-tier capability's `propose()` (no signature at all -- green
 * skips the approval dance by design, `Gate.propose()`'s own green
 * branch). Either way this only re-validates the payload *shape*, which
 * is a correctness check, not a trust boundary. */
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

export interface CloseAppPayload {
  action: "close_app";
  app: string;
}

function isCloseAppPayload(payload: unknown): payload is CloseAppPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (p["action"] !== "close_app") return false;
  if (typeof p["app"] !== "string" || p["app"].trim() === "") return false;
  // Rejected, not escaped -- see this file's own docstring. A real app
  // name never legitimately contains a quote.
  if (p["app"].includes('"') || p["app"].includes("\\")) return false;
  return true;
}

export async function closeApp(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isCloseAppPayload(payload)) {
    return { ok: false, error: `malformed close_app payload: ${JSON.stringify(payload)}` };
  }
  try {
    // Check the app is genuinely running *before* quitting it -- found
    // live, 2026-08-12 (the owner asked JARVIS to close "Instagram",
    // heard "Closed Instagram", and nothing had happened). AppleScript's
    // `tell application "X" to quit` exits 0 with no error even when no
    // such application exists at all, so trusting the exit code alone
    // made every close look successful, including ones that did nothing.
    // "Instagram" was never a closeable app in the first place -- it's a
    // website opened as a browser tab (`open_url`), which is exactly the
    // case this now reports honestly instead of claiming success for.
    const { stdout } = await execFileFn("osascript", [
      "-e",
      `tell application "System Events" to (name of processes) contains "${payload.app}"`,
    ]);
    if (stdout.trim() !== "true") {
      return { ok: false, error: `${payload.app} isn't running` };
    }
    await execFileFn("osascript", ["-e", `tell application "${payload.app}" to quit`]);
    return { ok: true, result: { app: payload.app } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
