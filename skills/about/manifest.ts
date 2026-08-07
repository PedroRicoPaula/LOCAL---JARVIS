/**
 * skills/about/manifest.ts — docs/SKILLS.md § 2. Pure static text, no
 * side effect, no capability needed (same precedent as `system_health`/
 * `tasks`'s own empty `capabilities: []`).
 *
 * Built 2026-08-07 after a real, reproducible bug: three separate real
 * "what can you do" phrasings that night all landed on the `converse`
 * lane correctly, but with no skill actually answering that question,
 * the disambiguator picked the least-wrong of an irrelevant shortlist
 * every time (`shopping_list.list_items`, `tasks.list_tasks` twice) --
 * "The shopping list is empty." is not an answer to "what skills do you
 * have." This skill exists so there's finally a correct candidate.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "about",
  version: "1.0.0",
  description: "Describes JARVIS's own real capabilities when the owner asks what it can do -- never invents one.",

  intents: [
    {
      id: "list_capabilities",
      description: "Summarize what JARVIS can actually do right now.",
      examples: [
        "what can you do",
        "what skills do you have",
        "what functionalities do you have",
        "give me a list of what you can do",
        "what are you capable of",
        "what can you help me with",
        // PT-PT paraphrases (ADR-033)
        "o que consegues fazer",
        "que funcionalidades tens",
        "dá-me uma lista das tuas funcionalidades",
        "do que és capaz",
        "o que é que tu consegues fazer por mim",
      ],
      lanes: ["converse"],
    },
  ],

  capabilities: [],
};
