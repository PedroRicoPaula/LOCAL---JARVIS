/**
 * skills/media/index.ts — music control, volume, brightness. Every real
 * change goes through `ctx.propose({capability: "SHELL_EXEC", ...})`;
 * `now_playing` is the one pure read, run directly (no gate needed --
 * same precedent as `system_health`'s OS reads and `weather`'s own
 * `fetch()` calls: reads are green by nature, only side effects are
 * gated).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ApprovalOutcome } from "../../shared/types.ts";
import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

const execFileAsync = promisify(execFile);

export interface NowPlaying {
  name: string;
  artist: string;
}

export type GetNowPlayingFn = () => Promise<NowPlaying | null>;

async function realGetNowPlaying(): Promise<NowPlaying | null> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", 'tell application "Music" to get {name, artist} of current track']);
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

async function proposeMedia(ctx: SkillContext, command: "play" | "pause" | "next" | "previous", label: string): Promise<{ speech: string }> {
  const outcome = await ctx.propose({
    capability: "SHELL_EXEC",
    humanSummary: label.charAt(0).toUpperCase() + label.slice(1),
    payload: { action: "media_control" as const, command },
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
}

/** Factory so tests can inject a fake `getNowPlaying` instead of
 * querying the real Music.app (CLAUDE.md § 3), same pattern as
 * `skills/weather`/`skills/launcher`. */
export function createMediaSkill(deps: MediaDeps = { getNowPlaying: realGetNowPlaying }): Skill {
  return {
    manifest,

    async handle(input, ctx): Promise<{ speech: string }> {
      switch (input.intent) {
        case "play_music":
          return proposeMedia(ctx, "play", "resumed playback");
        case "pause_music":
          return proposeMedia(ctx, "pause", "paused playback");
        case "next_track":
          return proposeMedia(ctx, "next", "skipped to the next track");
        case "previous_track":
          return proposeMedia(ctx, "previous", "went back a track");

        case "now_playing": {
          const track = await deps.getNowPlaying();
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
