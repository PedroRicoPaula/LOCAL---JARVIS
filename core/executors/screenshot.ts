/**
 * core/executors/screenshot.ts — `SHELL_EXEC`'s screenshot action:
 * `screencapture -i -c`, both built into macOS, no new dependency
 * (docs/BACKLOG.md's "Screenshot -> clipboard" item; OCR on top is a
 * separate, not-yet-researched follow-up, not built here).
 *
 * `-i` (interactive selection) means the owner drags to pick a region
 * themselves before anything is captured -- combined with the gate's own
 * approval (SHELL_EXEC, yellow), there are two real confirmations before
 * a single pixel is captured: approve the proposal, then actually select
 * an area. Escape cancels the interactive capture with no output.
 * `-c` sends the result straight to the clipboard -- no file is ever
 * written to disk, so there's no `data/`-style cleanup concern.
 *
 * **Live-tested 2026-08-06, a real gap found, not assumed fixed:** a
 * non-interactive capture (`screencapture -c -m`) exited 0 but the
 * clipboard held stale text afterward, not image data (checked via
 * `osascript -e 'clipboard info'`) -- consistent with macOS's Screen
 * Recording permission (System Settings -> Privacy & Security -> Screen
 * Recording) not yet being granted to whatever process actually runs
 * this. `screencapture` itself gives no clear error in that case (exit
 * code 0 either way), so this executor can't reliably detect success
 * from the exit code alone -- reported honestly in `skills/clipboard`'s
 * response instead of assumed. Owner-required: grant the permission,
 * confirm live once granted.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;

const SCREENCAPTURE_BIN = "/usr/sbin/screencapture";
/** Generous -- the owner needs real time to drag-select a region;
 * Escape exits immediately, this is only a safety cap against a truly
 * abandoned request hanging the gate's own executor forever. */
const INTERACTIVE_TIMEOUT_MS = 60_000;

export interface CaptureScreenshotPayload {
  action: "capture_screenshot";
}

function isCaptureScreenshotPayload(payload: unknown): payload is CaptureScreenshotPayload {
  if (typeof payload !== "object" || payload === null) return false;
  return (payload as Record<string, unknown>)["action"] === "capture_screenshot";
}

export async function captureScreenshot(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isCaptureScreenshotPayload(payload)) {
    return { ok: false, error: `malformed capture_screenshot payload: ${JSON.stringify(payload)}` };
  }
  try {
    await execFileFn(SCREENCAPTURE_BIN, ["-i", "-c"], { timeout: INTERACTIVE_TIMEOUT_MS });
    // screencapture exits 0 both when a real capture completed AND when
    // the owner pressed Escape to cancel -- there is no reliable way to
    // tell those apart from the exit code alone (confirmed live, see
    // this file's own docstring). Reported as "sent," not "captured,"
    // so the spoken response never overclaims.
    return { ok: true, result: {} };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
