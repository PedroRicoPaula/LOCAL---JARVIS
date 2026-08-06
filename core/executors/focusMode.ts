/**
 * core/executors/focusMode.ts — `SHELL_EXEC`'s Focus/Do Not Disturb
 * toggle (docs/BACKLOG.md's "Do Not Disturb toggle" item).
 *
 * **Why this goes through the Shortcuts app, not AppleScript/`defaults`
 * directly:** researched 2026-08-04 and re-confirmed 2026-08-06 -- macOS
 * removed Focus modes' scriptable property when it replaced the old
 * single Do Not Disturb toggle (unlike volume/brightness, which
 * `systemControls.ts` controls directly). There is no public, stable
 * AppleScript dictionary or `defaults` key for this; the only Apple-
 * supported automation surface is the Shortcuts app's own "Set Focus"
 * action, invoked here via `shortcuts run <name>` (`/usr/bin/shortcuts`,
 * confirmed present).
 *
 * **Real, owner-required setup, same shape as `bench/gmail_authorize.ts`'s
 * one-time dance:** the owner must create two Shortcuts.app shortcuts
 * once, each containing a single "Set Focus" action -- one that turns Do
 * Not Disturb on, one that turns it off. Names are configurable
 * (`JARVIS_FOCUS_ON_SHORTCUT`/`JARVIS_FOCUS_OFF_SHORTCUT`) so this isn't
 * hardcoded to an assumption about what the owner names them. See
 * `README.md`'s setup section for the exact steps.
 *
 * **A real gap found live, not fully resolved from this side:** run
 * directly in an interactive shell, `shortcuts run <nonexistent name>`
 * returns almost instantly with a clear "couldn't find the shortcut"
 * error (exit 1). The exact same command via this file's own `execFile`
 * call, from a plain Node process, hung with no output at all past 15+
 * seconds. Likely cause, not confirmed -- no way to from this side:
 * macOS's TCC permission system gating a *new* process's first attempt
 * to drive Shortcuts.app, waiting on a system dialog this process can't
 * see or click. Same shape as Phase 1's Accessibility prompt and this
 * session's own Screen Recording finding (`screenshot.ts`) --
 * owner-required: run `core` for real, watch for a permission dialog
 * the first time this fires, grant it, confirm live end to end.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;

const FOCUS_ON_SHORTCUT = process.env["JARVIS_FOCUS_ON_SHORTCUT"] ?? "JARVIS Focus On";
const FOCUS_OFF_SHORTCUT = process.env["JARVIS_FOCUS_OFF_SHORTCUT"] ?? "JARVIS Focus Off";

export interface SetFocusModePayload {
  action: "set_focus_mode";
  enabled: boolean;
}

function isSetFocusModePayload(payload: unknown): payload is SetFocusModePayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return p["action"] === "set_focus_mode" && typeof p["enabled"] === "boolean";
}

export async function setFocusMode(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isSetFocusModePayload(payload)) {
    return { ok: false, error: `malformed set_focus_mode payload: ${JSON.stringify(payload)}` };
  }
  const shortcutName = payload.enabled ? FOCUS_ON_SHORTCUT : FOCUS_OFF_SHORTCUT;
  try {
    await execFileFn("shortcuts", ["run", shortcutName]);
    return { ok: true, result: { enabled: payload.enabled } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
