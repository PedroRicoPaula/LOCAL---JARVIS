/**
 * skills/system_health/manifest.ts — docs/SKILLS.md § 2. Reads real OS
 * stats (`core/systemMetrics.ts`) -- no capability fits cleanly (it's
 * neither a file read nor a network call), and none is claimed.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "system_health",
  version: "1.0.0",
  description: "Reports real CPU, memory, and disk usage for this machine -- read from the OS, never guessed.",

  intents: [
    {
      id: "check_system",
      description: "Report current CPU load, memory usage, and disk space.",
      examples: [
        "how's my computer doing",
        "check system health",
        "what's my cpu usage",
        "how much memory am I using",
        "check disk space",
        "how's the machine running",
        "system status",
        "is my pc ok",
      ],
      lanes: ["converse"],
    },
  ],

  capabilities: [],
};
