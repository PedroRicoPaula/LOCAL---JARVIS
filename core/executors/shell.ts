/**
 * core/executors/shell.ts — `SHELL_EXEC`'s one registered executor
 * (`Gate` maps one `Executor` per capability). Dispatches by
 * `payload.action` to the actual handler -- each one its own small,
 * independently-tested module. Adding a new `SHELL_EXEC` action means
 * adding a case here, not a new capability.
 */

import { openApp } from "./apps.ts";
import { openUrl } from "./browser.ts";
import { readClipboard, writeClipboard } from "./clipboard.ts";
import { controlMedia } from "./media.ts";
import { setBrightness, setVolume } from "./systemControls.ts";

export async function runShellAction(payload: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const action = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)["action"] : undefined;

  switch (action) {
    case "open_app":
      return openApp(payload);
    case "open_url":
      return openUrl(payload);
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
    default:
      return { ok: false, error: `unknown SHELL_EXEC action: ${JSON.stringify(action)}` };
  }
}
