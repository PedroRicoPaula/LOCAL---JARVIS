/**
 * skills/media/index.ts — music control, volume, brightness. Every real
 * change goes through `ctx.propose({capability: "SHELL_EXEC", ...})`;
 * `now_playing` is the one pure read, run directly (no gate needed --
 * same precedent as `system_health`'s OS reads and `weather`'s own
 * `fetch()` calls: reads are green by nature, only side effects are
 * gated).
 *
 * Targets Music.app or Spotify (SOAK 1, 2026-08-06) -- whichever is
 * actually running, detected once per request via `detectRunningApp`
 * and named in the `humanSummary` the owner approves, not re-detected
 * inside the executor (see `core/executors/media.ts`'s own docstring
 * for why). Music.app stays the default when neither is running --
 * preserves the original behavior for anyone not using Spotify.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ApprovalOutcome } from "../../shared/types.ts";
import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

const execFileAsync = promisify(execFile);

// Duplicated from core/executors/media.ts's own MediaApp, deliberately
// not imported from there -- a skill cannot import an executor at all
// (CLAUDE.md § 5b, enforced by lint), not even for a type. Same
// pattern this file already used for MediaCommand's literal union
// below, just named this time.
export type MediaApp = "Music" | "Spotify";

export interface NowPlaying {
  name: string;
  artist: string;
}

export type DetectRunningAppFn = () => Promise<MediaApp>;
export type GetNowPlayingFn = (app: MediaApp) => Promise<NowPlaying | null>;

/** Spotify only if it's actually running -- Music.app is the fallback
 * whether Music is confirmed running or neither app answered, same
 * "boring default" this skill always had before Spotify existed. */
async function realDetectRunningApp(): Promise<MediaApp> {
  try {
    const { stdout } = await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to return exists (application process "Spotify")',
    ]);
    return stdout.trim() === "true" ? "Spotify" : "Music";
  } catch {
    return "Music";
  }
}

async function realGetNowPlaying(app: MediaApp): Promise<NowPlaying | null> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", `tell application "${app}" to get {name, artist} of current track`]);
    const [name, artist] = stdout.trim().split(", ");
    if (!name) return null;
    return { name, artist: artist ?? "" };
  } catch {
    return null;
  }
}

function extractLevelSystem(kind: string): string {
  return `Extract the target ${kind} level 0-100 from what the owner said. If they
said "mute", respond with 0. If they said "max" or "full", respond with
100. Respond with just the number, nothing else. If no level is stated,
respond with exactly: NONE`;
}

async function extractLevel(ctx: SkillContext, kind: string, utterance: string): Promise<number | null> {
  const raw = await ctx.router.complete("converse", extractLevelSystem(kind), utterance, { maxTokens: 10 }).catch(() => "");
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "NONE") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n);
}

function speechForOutcome(label: string, outcome: ApprovalOutcome): string {
  if (outcome.ok) return `Done -- ${label}.`;
  if (outcome.reason === "rejected") return `Okay, didn't ${label}.`;
  if (outcome.reason === "expired") return `The request to ${label} expired before you answered.`;
  return `Couldn't ${label} -- ${outcome.detail ?? "something went wrong"}.`;
}

async function proposeMedia(
  ctx: SkillContext,
  detectRunningApp: DetectRunningAppFn,
  command: "play" | "pause" | "next" | "previous",
  label: string,
): Promise<{ speech: string }> {
  const app = await detectRunningApp();
  const outcome = await ctx.propose({
    capability: "SHELL_EXEC",
    humanSummary: `${label.charAt(0).toUpperCase() + label.slice(1)} (${app})`,
    payload: { action: "media_control" as const, app, command },
  });
  const speech = speechForOutcome(label, outcome);
  ctx.say(speech);
  return { speech };
}

async function proposeLevel(
  ctx: SkillContext,
  action: "set_volume" | "set_brightness",
  kind: "volume" | "brightness",
  utterance: string,
): Promise<{ speech: string }> {
  let level = await extractLevel(ctx, kind, utterance);
  if (level === null) {
    const answer = await ctx.ask(`What ${kind}, 0 to 100?`);
    const n = Number(answer.trim());
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      const speech = `I didn't get a valid ${kind} level.`;
      ctx.say(speech);
      return { speech };
    }
    level = Math.round(n);
  }
  const label = `set ${kind} to ${level}`;
  const outcome = await ctx.propose({
    capability: "SHELL_EXEC",
    humanSummary: label.charAt(0).toUpperCase() + label.slice(1),
    payload: { action, level },
  });
  const speech = speechForOutcome(label, outcome);
  ctx.say(speech);
  return { speech };
}

export interface MediaDeps {
  getNowPlaying: GetNowPlayingFn;
  detectRunningApp: DetectRunningAppFn;
}

const DEFAULT_DEPS: MediaDeps = { getNowPlaying: realGetNowPlaying, detectRunningApp: realDetectRunningApp };

/** Factory so tests can inject fakes for `getNowPlaying`/
 * `detectRunningApp` instead of querying the real Music.app/Spotify/
 * System Events (CLAUDE.md § 3), same pattern as
 * `skills/weather`/`skills/launcher`. */
export function createMediaSkill(deps: MediaDeps = DEFAULT_DEPS): Skill {
  return {
    manifest,

    async handle(input, ctx): Promise<{ speech: string }> {
      switch (input.intent) {
        case "play_music":
          return proposeMedia(ctx, deps.detectRunningApp, "play", "resumed playback");
        case "pause_music":
          return proposeMedia(ctx, deps.detectRunningApp, "pause", "paused playback");
        case "next_track":
          return proposeMedia(ctx, deps.detectRunningApp, "next", "skipped to the next track");
        case "previous_track":
          return proposeMedia(ctx, deps.detectRunningApp, "previous", "went back a track");

        case "now_playing": {
          const app = await deps.detectRunningApp();
          const track = await deps.getNowPlaying(app);
          const speech = track
            ? `Now playing: ${track.name}${track.artist ? ` by ${track.artist}` : ""}.`
            : "Nothing seems to be playing right now.";
          ctx.say(speech);
          return { speech };
        }

        case "set_volume":
          return proposeLevel(ctx, "set_volume", "volume", input.utterance);
        case "set_brightness":
          return proposeLevel(ctx, "set_brightness", "brightness", input.utterance);

        default: {
          const speech = "I'm not sure what you want me to do with media.";
          ctx.say(speech);
          return { speech };
        }
      }
    },
  };
}

export const skill: Skill = createMediaSkill();
