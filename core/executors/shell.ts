/**
 * core/executors/shell.ts — `SHELL_EXEC`'s one registered executor
 * (`Gate` maps one `Executor` per capability). Dispatches by
 * `payload.action` to the actual handler -- each one its own small,
 * independently-tested module. Adding a new `SHELL_EXEC` action means
 * adding a case here, not a new capability.
 *
 * `open_app`/`open_url` moved to `APP_CONTROL` (`core/executors/
 * appControl.ts`, 2026-08-07) -- opening/closing a window is lower risk
 * than everything left here (clipboard/screenshot can expose sensitive
 * content, volume/brightness/media/focus are minor but still real system
 * state changes), so it no longer needs a per-open approval click.
 */

import { readClipboard, writeClipboard } from "./clipboard.ts";
import { setFocusMode } from "./focusMode.ts";
import { controlMedia } from "./media.ts";
import { captureScreenshot } from "./screenshot.ts";
import { setBrightness, setVolume } from "./systemControls.ts";

export async function runShellAction(payload: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const action = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)["action"] : undefined;

  switch (action) {
    case "media_control":
      return controlMedia(payload);
    case "set_volume":
      return setVolume(payload);
    case "set_brightness":
      return setBrightness(payload);
    case "read_clipboard":
      return readClipboard(payload);
    case "write_clipboard":
      return writeClipboard(payload);
    case "capture_screenshot":
      return captureScreenshot(payload);
    case "set_focus_mode":
      return setFocusMode(payload);
    default:
      return { ok: false, error: `unknown SHELL_EXEC action: ${JSON.stringify(action)}` };
  }
}
