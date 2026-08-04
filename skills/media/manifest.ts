/**
 * skills/media/manifest.ts — docs/SKILLS.md § 2. `now_playing` is a pure
 * read (queries Music.app directly, no capability needed, same
 * precedent as `system_health`'s OS reads); every other intent is a real
 * side effect and goes through `SHELL_EXEC`.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "media",
  version: "1.0.0",
  description: "Music playback, volume, and screen brightness -- hands-free, one approval per change.",

  intents: [
    {
      id: "play_music",
      description: "Resume/start music playback.",
      examples: ["play music", "resume the music", "play the song", "start playing music"],
      lanes: ["converse"],
    },
    {
      id: "pause_music",
      description: "Pause music playback.",
      examples: ["pause the music", "pause", "stop the music", "pause music"],
      lanes: ["converse"],
    },
    {
      id: "next_track",
      description: "Skip to the next track.",
      examples: ["next song", "skip this song", "next track", "play the next one"],
      lanes: ["converse"],
    },
    {
      id: "previous_track",
      description: "Go back to the previous track.",
      examples: ["previous song", "go back a track", "play the last song", "previous track"],
      lanes: ["converse"],
    },
    {
      id: "now_playing",
      description: "Report what's currently playing.",
      examples: ["what's playing", "what song is this", "what's this song", "what am I listening to"],
      lanes: ["converse"],
    },
    {
      id: "set_volume",
      description: "Set the system output volume.",
      examples: ["set the volume to 50", "turn the volume to 30", "mute", "max volume", "volume 20"],
      lanes: ["converse"],
    },
    {
      id: "set_brightness",
      description: "Set the screen brightness.",
      examples: ["set brightness to 50", "brightness to 80", "dim the screen to 20", "brighten the screen to full"],
      lanes: ["converse"],
    },
  ],

  capabilities: ["SHELL_EXEC"],
};
