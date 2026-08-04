/**
 * skills/media/manifest.ts — docs/SKILLS.md § 2. `now_playing` is a pure
 * read (queries Music.app directly, no capability needed, same
 * precedent as `system_health`'s OS reads); every other intent is a real
 * side effect and goes through `SHELL_EXEC`.
 *
 * Every action intent declares `converse`, `act`, and `reflex` --
 * found live: the lane classifier scattered these across all three for
 * near-identical phrasings ("play music" -> act, "pause the music" ->
 * reflex, "mute" -> reflex, "brighten the screen to 80" -> act), never
 * reliably `converse` alone. `reflex`'s own definition ("trivial,
 * instant... turning the camera on or off") arguably fits play/pause/
 * volume better than `converse` does in the first place -- this isn't
 * fighting a classifier mistake, it's covering a genuinely multi-lane
 * class of request. Same reasoning as `skills/launcher`'s own fix.
 */

import type { SkillManifest } from "../../shared/types.ts";

const CONTROL_LANES = ["converse", "act", "reflex"] as const;

export const manifest: SkillManifest = {
  id: "media",
  version: "1.0.0",
  description: "Music playback, volume, and screen brightness -- hands-free, one approval per change.",

  intents: [
    {
      id: "play_music",
      description: "Resume/start music playback.",
      examples: ["play music", "resume the music", "play the song", "start playing music"],
      lanes: [...CONTROL_LANES],
    },
    {
      id: "pause_music",
      description: "Pause music playback.",
      examples: ["pause the music", "pause", "stop the music", "pause music"],
      lanes: [...CONTROL_LANES],
    },
    {
      id: "next_track",
      description: "Skip to the next track.",
      examples: ["next song", "skip this song", "next track", "play the next one"],
      lanes: [...CONTROL_LANES],
    },
    {
      id: "previous_track",
      description: "Go back to the previous track.",
      examples: ["previous song", "go back a track", "play the last song", "previous track"],
      lanes: [...CONTROL_LANES],
    },
    {
      id: "now_playing",
      description: "Report what's currently playing.",
      examples: ["what's playing", "what song is this", "what's this song", "what am I listening to"],
      // Read-only, no camera involved -- but the lane classifier reads
      // "what's playing"/"what song is this" as `see` (something about
      // "what's on screen" phrasing). Tried fixing via a prompt example
      // first; it worked in isolation but regressed 3 unrelated cases on
      // the full 45-case benchmark (97.8% -> 91.1%) -- prompt few-shot
      // examples have non-local effects, reverted. Declaring `see` here
      // too costs nothing (no skill contests this intent on that lane)
      // and doesn't touch the shared prompt every other case also
      // depends on.
      lanes: ["converse", "see"],
    },
    {
      id: "set_volume",
      description: "Set the system output volume.",
      examples: ["set the volume to 50", "turn the volume to 30", "mute", "max volume", "volume 20"],
      lanes: [...CONTROL_LANES],
    },
    {
      id: "set_brightness",
      description: "Set the screen brightness.",
      examples: ["set brightness to 50", "brightness to 80", "dim the screen to 20", "brighten the screen to full"],
      lanes: [...CONTROL_LANES],
    },
  ],

  capabilities: ["SHELL_EXEC"],
};
