/**
 * core/executors/browser.ts — `SHELL_EXEC`'s `open_url` action: `open
 * <url>` via `execFile` (never a shell), same reasoning as `apps.ts`.
 * Only `http`/`https` accepted -- rejects `file:`, `javascript:`, and
 * anything else outright, a real check `URL` gives for free.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;

export interface OpenUrlPayload {
  action: "open_url";
  url: string;
}

function isOpenUrlPayload(payload: unknown): payload is OpenUrlPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return p["action"] === "open_url" && typeof p["url"] === "string" && p["url"].trim() !== "";
}

export async function openUrl(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isOpenUrlPayload(payload)) {
    return { ok: false, error: `malformed open_url payload: ${JSON.stringify(payload)}` };
  }

  let url: URL;
  try {
    url = new URL(payload.url);
  } catch {
    return { ok: false, error: `not a valid URL: ${payload.url}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `unsupported URL scheme: ${url.protocol}` };
  }

  try {
    await execFileFn("open", [url.toString()]);
    return { ok: true, result: { url: url.toString() } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
