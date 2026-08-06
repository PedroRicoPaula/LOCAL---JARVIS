/**
 * skills/weather/manifest.ts — docs/SKILLS.md § 2. `NET_READ` (green,
 * auto-runs) for the Open-Meteo calls; `MEMORY_WRITE` (yellow) only for
 * remembering the city once, first time it's asked.
 */

import type { SkillManifest } from "../../shared/types.ts";

export const manifest: SkillManifest = {
  id: "weather",
  version: "1.0.0",
  description: "Real current weather from Open-Meteo (free, no key) for a city the owner names once and JARVIS remembers.",

  intents: [
    {
      id: "current_weather",
      description: "Report current temperature and conditions for the owner's city.",
      examples: [
        "what's the weather",
        "what's the weather like",
        "is it going to rain",
        "how cold is it outside",
        "weather today",
        "do I need a jacket",
        "what's it like outside",
        // PT-PT paraphrases (ADR-033)
        "como está o tempo",
        "vai chover",
        "está frio lá fora",
        "preciso de casaco",
      ],
      lanes: ["converse"],
    },
  ],

  capabilities: ["NET_READ", "MEMORY_WRITE"],
};
