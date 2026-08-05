/**
 * core/executors/media.ts — `SHELL_EXEC`'s `media_control` action:
 * play/pause/skip via `osascript`. Every AppleScript string run here is
 * built from two fixed, validated enums (`payload.app`,
 * `payload.command`), never from raw user text -- no injection surface
 * even though `osascript -e` takes a script, not a flag.
 *
 * Two target apps (SOAK 1, 2026-08-06) -- Music.app and Spotify, both
 * expose the identical AppleScript verbs (`play`/`pause`/`next track`/
 * `previous track`/`get {name, artist} of current track`), confirmed
 * live. Which app a given command targets is decided once, by
 * `skills/media/index.ts`, before the action is even proposed -- not
 * re-detected here at execution time. That's deliberate: the owner
 * approves a `humanSummary` that names the app; re-detecting inside the
 * executor could silently target a *different* app than the one shown
 * at proposal time if the owner switched apps in between (a real, if
 * narrow, mismatch between what was approved and what runs).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;

export type MediaApp = "Music" | "Spotify";
export type MediaCommand = "play" | "pause" | "next" | "previous";

export interface MediaControlPayload {
  action: "media_control";
  app: MediaApp;
  command: MediaCommand;
}

const APPLESCRIPT_VERB: Record<MediaCommand, string> = {
  play: "play",
  pause: "pause",
  next: "next track",
  previous: "previous track",
};

const VALID_APPS: readonly MediaApp[] = ["Music", "Spotify"];

function isMediaControlPayload(payload: unknown): payload is MediaControlPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return (
    p["action"] === "media_control" &&
    typeof p["app"] === "string" &&
    VALID_APPS.includes(p["app"] as MediaApp) &&
    typeof p["command"] === "string" &&
    p["command"] in APPLESCRIPT_VERB
  );
}

export async function controlMedia(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isMediaControlPayload(payload)) {
    return { ok: false, error: `malformed media_control payload: ${JSON.stringify(payload)}` };
  }
  try {
    const script = `tell application "${payload.app}" to ${APPLESCRIPT_VERB[payload.command]}`;
    await execFileFn("osascript", ["-e", script]);
    return { ok: true, result: { app: payload.app, command: payload.command } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}
