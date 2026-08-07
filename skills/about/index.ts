/**
 * skills/about/index.ts — a fixed, hand-maintained summary, not a model
 * call. Same reasoning `skills/weather`'s own template uses: fast, no
 * added latency (CLAUDE.md § 7), no risk of a model inventing a
 * capability that doesn't exist. Update `CAPABILITIES_SPEECH` by hand
 * whenever a real (non-placeholder) skill is added or removed.
 */

import type { Skill } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

const CAPABILITIES_SPEECH =
  "I can check the weather for a city you've told me, manage a task list and a shopping list, " +
  "open and close apps, projects, and websites, control music playback, report your system's CPU, memory, and disk usage, " +
  "give you a morning brief, use the camera to describe or answer questions about what it sees, " +
  "check your Gmail, and read or write the clipboard.";

export const skill: Skill = {
  manifest,

  async handle(_input, ctx): Promise<{ speech: string }> {
    ctx.say(CAPABILITIES_SPEECH);
    return { speech: CAPABILITIES_SPEECH };
  },
};
