/**
 * skills/launcher/manifest.ts — docs/SKILLS.md § 2. `FS_READ` (green) for
 * listing project directory names only, never contents; `APP_CONTROL`
 * (green, 2026-08-07 owner request) for actually opening/closing
 * anything -- runs immediately, no per-open approval click, executed by
 * `core/executors/appControl.ts`. Still logged (`Gate.propose()`'s own
 * green-tier executor call) -- "no approval needed" isn't "invisible."
 * Was `SHELL_EXEC` (yellow) until this same day; see DECISIONS.md.
 *
 * `open_app`/`open_project`/`open_url`/`close_app` declare both
 * `converse` and `act` -- found live: the lane classifier consistently
 * reads "open X"/"close X" as `act` ("requires... running commands",
 * which is technically true of `open -a`/`osascript`), not `converse`,
 * so a `converse`-only intent was unreachable in practice ("Can you
 * open Facebook?" fell through to general conversation, which then
 * wrongly denied having this capability at all). Same fix pattern
 * Phase 5's `wardrobe` already established for its own lane ambiguity --
 * declare every lane real phrasing lands on, don't fight the
 * classifier's reasonable-but-narrow reading of a single utterance.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "launcher",
  version: "1.0.0",
  description: "Opens and closes apps, and lists/opens projects under the owner's dev folder -- hands-free, no approval needed.",

  intents: [
    {
      id: "open_app",
      description: "Open a named application.",
      examples: [
        "open Cursor",
        "open Safari",
        "launch the calculator",
        "open Finder",
        "start Terminal",
        "open Spotify",
        // PT-PT paraphrases (ADR-033)
        "abre o Cursor",
        "abre o Finder",
        "abre a calculadora",
      ],
      lanes: ["converse", "act"],
    },
    {
      id: "close_app",
      description: "Close/quit a named application.",
      examples: [
        "close Spotify",
        "quit Spotify",
        "close Cursor",
        "quit Terminal",
        "close the calculator",
        "quit Finder",
        // PT-PT paraphrases (ADR-033)
        "fecha o Spotify",
        "fecha o Cursor",
        "sai do Spotify",
      ],
      // Found live, 2026-08-07: "close Calculator" classified as `reflex`
      // (the classifier's own reflex bullet names "stop, cancel, pause" --
      // "close" reads close enough to that set), not `converse`/`act`.
      // Without `reflex` declared here, dispatch.ts's lane filter dropped
      // this intent from the candidate list entirely, and disambiguation
      // picked `media.pause_music` instead (it does declare `reflex`) --
      // a real, live misroute: "close Calculator" tried to pause Spotify.
      // Same fix pattern as everywhere else tonight: declare every lane
      // real phrasing lands on.
      lanes: ["converse", "act", "reflex"],
    },
    {
      id: "list_projects",
      description: "List the owner's project directories.",
      examples: [
        "what projects do I have",
        "list my projects",
        "show me my projects",
        "what's in my dev folder",
        // PT-PT paraphrases (ADR-033)
        "que projetos é que eu tenho",
        "mostra-me os meus projetos",
      ],
      lanes: ["converse"],
    },
    {
      id: "open_project",
      description: "Open a named project in Cursor.",
      examples: [
        "open the Jarvis project in Cursor",
        "open Jarvis in Cursor",
        "open my Jarvis project",
        "load the Jarvis project",
        // PT-PT paraphrases (ADR-033)
        "abre o projeto Jarvis no Cursor",
        "abre o meu projeto Jarvis",
      ],
      lanes: ["converse", "act"],
    },
    {
      id: "open_url",
      description: "Open a web address in the default browser.",
      examples: [
        "open github.com",
        "open GitHub",
        "look up the weather forecast online",
        "go to google.com",
        "open the NVIDIA build website",
        // PT-PT paraphrases (ADR-033)
        "abre o github.com",
        "vai ao google.com",
        "procura a previsão do tempo online",
      ],
      lanes: ["converse", "act"],
    },
  ],

  capabilities: ["FS_READ", "APP_CONTROL"],
};
