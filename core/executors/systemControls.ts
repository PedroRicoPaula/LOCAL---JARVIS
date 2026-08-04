/**
 * core/executors/systemControls.ts — `SHELL_EXEC`'s `set_volume` and
 * `set_brightness` actions.
 *
 * Volume: `osascript "set volume output volume N"` is a real, reliable,
 * built-in macOS AppleScript command -- no extra dependency.
 *
 * Brightness has no equivalent built-in AppleScript property. The usual
 * reliable free tool is `brightness` (github.com/nriley/brightness, a
 * small open-source CLI -- CLAUDE.md § 0.2's "free" bar, just not
 * pre-installed). Not installed on this machine as of 2026-08-04 --
 * rather than fake a hardware key-code hack of uncertain reliability
 * across keyboards/displays, a missing tool is reported honestly
 * (CLAUDE.md § 6) so the owner knows exactly what to install, instead of
 * a silent no-op or an unverified guess at a side effect on the real
 * screen.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExecFileFn = typeof execFileAsync;

export interface SetVolumePayload {
  action: "set_volume";
  level: number; // 0-100
}

function isSetVolumePayload(payload: unknown): payload is SetVolumePayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return p["action"] === "set_volume" && typeof p["level"] === "number" && p["level"] >= 0 && p["level"] <= 100;
}

export async function setVolume(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isSetVolumePayload(payload)) {
    return { ok: false, error: `malformed set_volume payload: ${JSON.stringify(payload)}` };
  }
  const level = Math.round(payload.level);
  try {
    await execFileFn("osascript", ["-e", `set volume output volume ${level}`]);
    return { ok: true, result: { level } };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

export interface SetBrightnessPayload {
  action: "set_brightness";
  level: number; // 0-100
}

function isSetBrightnessPayload(payload: unknown): payload is SetBrightnessPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return p["action"] === "set_brightness" && typeof p["level"] === "number" && p["level"] >= 0 && p["level"] <= 100;
}

export async function setBrightness(
  payload: unknown,
  execFileFn: ExecFileFn = execFileAsync,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  if (!isSetBrightnessPayload(payload)) {
    return { ok: false, error: `malformed set_brightness payload: ${JSON.stringify(payload)}` };
  }
  const level = Math.round(payload.level);
  try {
    await execFileFn("brightness", [(level / 100).toFixed(2)]);
    return { ok: true, result: { level } };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/ENOENT/.test(message)) {
      return { ok: false, error: `brightness control needs the "brightness" CLI (brew install brightness) -- not installed` };
    }
    return { ok: false, error: message };
  }
}
