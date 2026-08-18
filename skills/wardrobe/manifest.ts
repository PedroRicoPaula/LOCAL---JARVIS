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
      //
      // **Known, accepted cost.** Dropping the bare "o que é que eu
      // visto" means the natural PT-PT phrasing without a clothing noun
      // ("o que visto hoje") no longer reaches this skill -- measured:
      // it lands on `look.describe` instead, since "visto" is both
      // *vestir* (to wear) and a form the classifier reads as *ver* (to
      // see). Adding it back was tried and measured: it fixes that case
      // (rank 1, 1.0000) but re-pollutes -- "o que é que eu tenho para
      // fazer" goes from rank 11 (0.7360) back to rank 4 (0.8174), and
      // two other unrelated utterances similarly. Since this skill is a
      // deliberate placeholder that only ever answers "not built yet"
      // (ROADMAP.md's unscheduled backlog), clean routing for every real
      // skill is worth more than reaching this one. **Revisit when
      // wardrobe is actually built** -- the trade-off flips the moment
      // it does something useful.
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
