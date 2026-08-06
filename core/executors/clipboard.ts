/**
 * core/executors/clipboard.ts — `SHELL_EXEC`'s clipboard actions:
 * `pbpaste`/`pbcopy`, both built into macOS, no new dependency
 * (docs/BACKLOG.md's "Clipboard read/write" item).
 *
 * Both go through `SHELL_EXEC` (yellow, requires approval), not a green
 * capability -- unlike `system_health`'s CPU/disk reads, clipboard
 * content is arbitrary and could be sensitive (a password just copied,
 * a token). `FS_READ`'s whitelist model (CLAUDE.md § 5) exists for
 * exactly this reason; there's no way to whitelist clipboard content in
 * advance since it's different every time, so it isn't auto-approved
 * either.
 */

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;
export type WriteClipboardFn = (text: string) => Promise<void>;

export interface ReadClipboardPayload {
  action: "read_clipboard";
}

export interface WriteClipboardPayload {
  action: "write_clipboard";
  text: string;
}

function isReadClipboardPayload(payload: unknown): payload is ReadClipboardPayload {
  if (typeof payload !== "object" || payload === null) return false;
  return (payload as Record<string, unknown>)["action"] === "read_clipboard";
}

function isWriteClipboardPayload(payload: unknown): payload is WriteClipboardPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  if (p["action"] !== "write_clipboard") return false;
  return typeof p["text"] === "string" && p["text"] !== "";
}

/** `pbcopy` reads from stdin, not args -- `execFile`'s promisified form
 * has no stdin option (that's `execFileSync`-only), so this writes to a
 * real `spawn`ed process directly instead. */
async function realWriteClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pbcopy");
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`pbcopy exited with code ${code}`))));
    child.stdin.end(text);
  });
}

export async function readClipboard(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isReadClipboardPayload(payload)) {
    return { ok: false, error: `malformed read_clipboard payload: ${JSON.stringify(payload)}` };
  }
  try {
    const { stdout } = await execFileFn("pbpaste", []);
    return { ok: true, result: { text: stdout } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export async function writeClipboard(
  payload: unknown,
  writeFn: WriteClipboardFn = realWriteClipboard,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isWriteClipboardPayload(payload)) {
    return { ok: false, error: `malformed write_clipboard payload: ${JSON.stringify(payload)}` };
  }
  try {
    await writeFn(payload.text);
    return { ok: true, result: { text: payload.text } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
