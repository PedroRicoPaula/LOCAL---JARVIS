/**
 * skills/launcher/manifest.ts — docs/SKILLS.md § 2. `FS_READ` (green) for
 * listing project directory names only, never contents; `SHELL_EXEC`
 * (yellow) for actually opening anything -- every open goes through
 * `ctx.propose` and the owner's approval, executed by
 * `core/executors/shell.ts`.
 *
 * `open_app`/`open_project`/`open_url` declare both `converse` and `act`
 * -- found live: the lane classifier consistently reads "open X" as
 * `act` ("requires... running commands", which is technically true of
 * `open -a`), not `converse`, so a `converse`-only intent was
 * unreachable in practice ("Can you open Facebook?" fell through to
 * general conversation, which then wrongly denied having this
 * capability at all). Same fix pattern Phase 5's `wardrobe` already
 * established for its own lane ambiguity -- declare every lane real
 * phrasing lands on, don't fight the classifier's reasonable-but-narrow
 * reading of a single utterance.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "launcher",
  version: "1.0.0",
  description: "Opens apps and lists/opens projects under the owner's dev folder -- hands-free, one approval per open.",

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
      ],
      lanes: ["converse", "act"],
    },
    {
      id: "list_projects",
      description: "List the owner's project directories.",
      examples: [
        "what projects do I have",
        "list my projects",
        "show me my projects",
        "what's in my dev folder",
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
      ],
      lanes: ["converse", "act"],
    },
  ],

  capabilities: ["FS_READ", "SHELL_EXEC"],
};
