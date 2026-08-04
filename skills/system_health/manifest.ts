/**
 * skills/system_health/manifest.ts — docs/SKILLS.md § 2. Reads real OS
 * stats (`core/systemMetrics.ts`) -- no capability fits cleanly (it's
 * neither a file read nor a network call), and none is claimed.
 *
 * `check_system` declares `converse` + `see` + `act`, not `converse`
 * alone -- this exact intent already broke once (ADR-024: "how's my
 * computer doing" classified as `see`, fixed only by adding a few-shot
 * example to the shared classifier prompt) with no structural backstop,
 * and a later prompt regression (ADR-026) proved that shared prompt is
 * genuinely fragile to unrelated changes. `shopping_list` broke the
 * same way a second time (ADR-030) precisely because it had no
 * multi-lane declaration to fall back on. Redundant lane coverage here
 * is cheap insurance against a classifier prompt regression nobody
 * notices until this skill goes quiet again.
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
      lanes: ["converse", "see", "act"],
    },
  ],

  capabilities: [],
};
