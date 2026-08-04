/**
 * skills/wardrobe/manifest.ts — docs/SKILLS.md § 2.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "wardrobe",
  version: "1.0.0",
  description: "Placeholder wardrobe skill -- no-op scaffold proving the 30-minute test, not a real implementation (docs/BACKLOG.md).",

  intents: [
    {
      id: "wardrobe_default",
      description: "Placeholder intent for the wardrobe skill scaffold.",
      examples: [
        "what should I wear",
        "check my outfit",
        "does this match",
        "wardrobe",
        "help me pick an outfit",
      ],
      // Real wardrobe (docs/BACKLOG.md) needs to look at actual clothing --
      // the lane classifier correctly sends "does this shirt go with these
      // trousers"-style phrasing to `see`, not `converse` (confirmed live
      // during Phase 5's routing benchmark). Declaring only `converse` here
      // would silently make those utterances unroutable once this skill is
      // real, so both lanes are declared even on the placeholder.
      lanes: ["converse", "see"],
    },
  ],

  capabilities: ["MEMORY_READ"],
};
