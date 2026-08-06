/**
 * skills/brief/manifest.ts — docs/SKILLS.md § 2. `MEMORY_READ` only
 * (ROADMAP.md Phase 5: "so it needs no gate yet" — Phase 6 builds the gate).
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "brief",
  version: "1.0.0",
  description: "Gives the owner a spoken summary of what's relevant right now, drawn from memory.",

  intents: [
    {
      id: "morning_brief",
      description: "Summarize what the owner should know right now, from memory.",
      examples: [
        "good morning",
        "give me my brief",
        "what's up",
        "catch me up",
        "morning",
        "what do I need to know today",
        "brief me",
        "what's going on",
        // PT-PT paraphrases (ADR-033) -- same terse/sloppy register as
        // the English ones above, not textbook translations.
        "bom dia",
        "põe-me a par",
        "o que se passa",
        "resumo do dia",
        "o que preciso de saber hoje",
      ],
      lanes: ["converse"],
    },
  ],

  capabilities: ["MEMORY_READ"],
};
