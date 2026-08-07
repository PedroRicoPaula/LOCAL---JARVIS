/**
 * core/executors/appControl.ts — `APP_CONTROL`'s one registered executor
 * (`Gate` maps one `Executor` per capability). Dispatches by
 * `payload.action`, same shape `core/executors/shell.ts` already uses
 * for `SHELL_EXEC`'s several actions -- `open_app`/`open_url` moved here
 * from `SHELL_EXEC` (2026-08-07, owner request: opening/closing a
 * window is low-risk and shouldn't need a per-open approval click);
 * `close_app` is new.
 */

import { openApp, closeApp } from "./apps.ts";
import { openUrl } from "./browser.ts";

export async function runAppControlAction(payload: unknown): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const action = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)["action"] : undefined;

  switch (action) {
    case "open_app":
      return openApp(payload);
    case "close_app":
      return closeApp(payload);
    case "open_url":
      return openUrl(payload);
    default:
      return { ok: false, error: `unknown APP_CONTROL action: ${JSON.stringify(action)}` };
  }
}
