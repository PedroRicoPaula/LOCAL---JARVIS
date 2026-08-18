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
      // Every example names clothes explicitly. Measured 2026-08-17
      // against the full live index, three of the originals matched by
      // *sentence shape* rather than meaning and pulled in utterances
      // with nothing to do with clothes:
      //   "o que é que eu visto"  -> 0.8583 vs "o que é que eu tenho
      //                              para fazer" (a tasks utterance),
      //                              0.7624 vs "Como é que tu estás?",
      //                              0.7376 vs "tudo bem?"
      //   "isto combina"          -> 0.7463 vs "isto está bom?"
      //   "does this match"       -> 0.7880 vs "does this look right",
      //                              which it actually *won*
      // The bare frames "o que é que eu ..." / "isto ..." / "does this
      // ..." are generic; the embedder weighs them over the missing
      // clothing noun. Same "a word becomes a magnet" failure this
      // project has now hit four times (coffee ADR-026, the Cursor app
      // name ADR-059, "rastreio de mãos" ADR-061, and this). Fix is
      // always the same: anchor the example on the noun that actually
      // makes it this intent.
      examples: [
        "what should I wear",
        "check my outfit",
        "does this shirt match these trousers",
        "wardrobe",
        "help me pick an outfit",
        "what clothes should I put on today",
        // PT-PT paraphrases (ADR-033)
        "que roupa é que visto hoje",
        "esta camisa combina com estas calças",
        "ajuda-me a escolher roupa",
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
