/**
 * skills/media/index.ts — music control, volume, brightness. Every real
 * change goes through `ctx.propose({capability: "SHELL_EXEC", ...})`;
 * `now_playing` is the one pure read, run directly (no gate needed --
 * same precedent as `system_health`'s OS reads and `weather`'s own
 * `fetch()` calls: reads are green by nature, only side effects are
 * gated).
 *
 * Targets Spotify by default (SOAK 1, 2026-08-06 -- the owner's own
 * correction: he doesn't use Music.app at all). `resolveTargetApp`
 * only switches to Music.app when the utterance itself names it
 * explicitly ("apple music", "music app") -- a deterministic text
 * check, not a runtime "which one is actually open" guess (an earlier
 * version of this file used `System Events` for that; dropped because
 * it answered the wrong question -- Spotify not being open yet doesn't
 * mean the owner wants Music, `tell application "Spotify" to play`
 * launches it same as any app). The resolved app is named in the
 * `humanSummary` the owner approves and baked into the signed payload,
 * not re-decided inside the executor (see `core/executors/media.ts`'s
 * own docstring for why).
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

export type GetNowPlayingFn = (app: MediaApp) => Promise<NowPlaying | null>;

// Requires "app"/"apple" alongside "music" -- bare "play some music" is
// generic phrasing, not naming the app, and must still resolve to
// Spotify. Only an explicit "apple music" or "music app" mention opts
// into Music.app.
const MUSIC_APP_PATTERN = /\b(apple\s+music|music\s+app)\b/i;

/** Pure and synchronous -- no OS call, no fake needed in tests, just
 * whatever the owner actually said this turn. */
function resolveTargetApp(utterance: string): MediaApp {
  return MUSIC_APP_PATTERN.test(utterance) ? "Music" : "Spotify";
}

// Bare "on"/"off" included -- the natural, expected reply to this
// skill's own ctx.ask("Turn Do Not Disturb on or off?") follow-up is
// exactly that one word, found live while writing this skill's own
// tests (a scripted "on" answer didn't resolve without it). Safe here
// specifically because this function only ever runs once dispatch has
// already decided the utterance is about set_focus_mode -- a bare "on"
// elsewhere in the app never reaches this code path.
// Checked in this order deliberately: PT-PT "desativa"/"desliga" contain
// "ativa"/"liga" as substrings, but \b word boundaries alone already
// prevent a false match (no boundary mid-word) -- OFF checked first
// anyway, cheap and removes any doubt.
const FOCUS_OFF_PATTERN = /\b(turn off|disable|deactivate|stop|off)\b/i;
const FOCUS_ON_PATTERN = /\b(turn on|enable|activate|on)\b/i;
const FOCUS_OFF_PATTERN_PT = /\b(desativa|desliga)\b/i;
const FOCUS_ON_PATTERN_PT = /\b(ativa|liga)\b/i;

/** Pure and synchronous, same precedent as `resolveTargetApp` -- on/off
 * is a narrow, well-known vocabulary, doesn't need a model call. `null`
 * (genuinely ambiguous) falls back to `ctx.ask`. */
function resolveFocusEnabled(utterance: string): boolean | null {
  if (FOCUS_OFF_PATTERN.test(utterance) || FOCUS_OFF_PATTERN_PT.test(utterance)) return false;
  if (FOCUS_ON_PATTERN.test(utterance) || FOCUS_ON_PATTERN_PT.test(utterance)) return true;
  return null;
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
  utterance: string,
  command: "play" | "pause" | "next" | "previous",
  label: string,
): Promise<{ speech: string }> {
  const app = resolveTargetApp(utterance);
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
}

const DEFAULT_DEPS: MediaDeps = { getNowPlaying: realGetNowPlaying };

/** Factory so tests can inject a fake `getNowPlaying` instead of
 * querying the real Music.app/Spotify (CLAUDE.md § 3), same pattern as
 * `skills/weather`/`skills/launcher`. `resolveTargetApp` needs no fake
 * -- it's pure text matching, not an OS call. */
export function createMediaSkill(deps: MediaDeps = DEFAULT_DEPS): Skill {
  return {
    manifest,

    async handle(input, ctx): Promise<{ speech: string }> {
      switch (input.intent) {
        case "play_music":
          return proposeMedia(ctx, input.utterance, "play", "resumed playback");
        case "pause_music":
          return proposeMedia(ctx, input.utterance, "pause", "paused playback");
        case "next_track":
          return proposeMedia(ctx, input.utterance, "next", "skipped to the next track");
        case "previous_track":
          return proposeMedia(ctx, input.utterance, "previous", "went back a track");

        case "now_playing": {
          const app = resolveTargetApp(input.utterance);
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

        case "set_focus_mode": {
          let enabled = resolveFocusEnabled(input.utterance);
          if (enabled === null) {
            const answer = await ctx.ask("Turn Do Not Disturb on or off?");
            enabled = resolveFocusEnabled(answer);
            if (enabled === null) {
              const speech = "I didn't catch whether that was on or off.";
              ctx.say(speech);
              return { speech };
            }
          }
          const label = `turned Do Not Disturb ${enabled ? "on" : "off"}`;
          const outcome = await ctx.propose({
            capability: "SHELL_EXEC",
            humanSummary: label.charAt(0).toUpperCase() + label.slice(1),
            payload: { action: "set_focus_mode" as const, enabled },
          });
          const speech = speechForOutcome(label, outcome);
          ctx.say(speech);
          return { speech };
        }

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
