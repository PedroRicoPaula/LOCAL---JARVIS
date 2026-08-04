/**
 * core/executors/media.ts — `SHELL_EXEC`'s `media_control` action:
 * play/pause/skip on Music.app via `osascript`. Every AppleScript string
 * run here comes from a fixed, hardcoded map keyed by a validated enum
 * (`payload.command`), never built from raw user text -- no injection
 * surface even though `osascript -e` takes a script, not a flag.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;

export type MediaCommand = "play" | "pause" | "next" | "previous";

export interface MediaControlPayload {
  action: "media_control";
  command: MediaCommand;
}

const APPLESCRIPT_BY_COMMAND: Record<MediaCommand, string> = {
  play: 'tell application "Music" to play',
  pause: 'tell application "Music" to pause',
  next: 'tell application "Music" to next track',
  previous: 'tell application "Music" to previous track',
};

function isMediaControlPayload(payload: unknown): payload is MediaControlPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return p["action"] === "media_control" && typeof p["command"] === "string" && p["command"] in APPLESCRIPT_BY_COMMAND;
}

export async function controlMedia(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isMediaControlPayload(payload)) {
    return { ok: false, error: `malformed media_control payload: ${JSON.stringify(payload)}` };
  }
  try {
    await execFileFn("osascript", ["-e", APPLESCRIPT_BY_COMMAND[payload.command]]);
    return { ok: true, result: { command: payload.command } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
