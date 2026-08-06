/**
 * skills/clipboard/manifest.ts — docs/SKILLS.md § 2. `pbpaste`/`pbcopy`,
 * both real side effects (reading arbitrary clipboard content could
 * surface something sensitive; writing overwrites whatever the owner had
 * copied) -- both go through `SHELL_EXEC`, neither is a green auto-run,
 * see `core/executors/clipboard.ts`'s own docstring.
 *
 * `write_clipboard` declares `act` alongside `converse` -- found live
 * (2026-08-06, via `bench_skill_routing.ts`): the lane classifier reads
 * "copy this for me"/"put this on my clipboard" as a command (`act`'s
 * own "running commands" framing), same pattern already fixed for
 * `launcher`/`media` (ADR-026) and `shopping_list` (ADR-030) -- declare
 * every lane real phrasing lands on rather than fight the classifier.
 * `read_clipboard` stays `converse`-only: its examples are all questions
 * ("what's on my clipboard"), confirmed classifying correctly.
 * `capture_screenshot` declares `act` and `see` too, alongside
 * `converse` -- `act` for the same imperative-command reasoning as
 * `write_clipboard`; `see` found live (2026-08-06, via
 * `bench_skill_routing.ts`): "grab a screenshot of this for me"
 * classifies as `see` (the classifier reads "grab .. of this" as
 * vision-adjacent phrasing, despite this being a screen capture, not a
 * camera request) -- confirmed via a real embedding-candidate check
 * (0.958, an excellent match, filtered out purely by the lane
 * mismatch) before concluding this was a lane-declaration gap.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "clipboard",
  version: "1.0.0",
  description: "Reads or writes the system clipboard -- one approval per action.",

  intents: [
    {
      id: "read_clipboard",
      description: "Read back what's currently on the clipboard.",
      examples: [
        "what's on my clipboard",
        "read my clipboard",
        "what did I copy",
        "what's copied right now",
        // PT-PT paraphrases (ADR-033)
        "o que está na área de transferência",
        "o que é que eu copiei",
      ],
      lanes: ["converse"],
    },
    {
      id: "write_clipboard",
      description: "Copy a given piece of text to the clipboard.",
      examples: [
        "copy this for me: see you at 5pm",
        "put this on my clipboard: buy milk",
        "copy my wifi password format: jarvis-guest",
        "copy this to clipboard",
        // PT-PT paraphrases (ADR-033)
        "copia isto para mim: até logo",
        "põe isto na área de transferência: comprar leite",
      ],
      lanes: ["converse", "act"],
    },
    {
      id: "capture_screenshot",
      description: "Take an interactive screenshot (the owner selects the area) and copy it to the clipboard.",
      examples: [
        "take a screenshot",
        "screenshot this",
        "capture the screen",
        "grab a screenshot of this",
        // PT-PT paraphrases (ADR-033)
        "tira uma captura de ecrã",
        "captura o ecrã",
      ],
      lanes: ["converse", "act", "see"],
    },
  ],

  capabilities: ["SHELL_EXEC"],
};
