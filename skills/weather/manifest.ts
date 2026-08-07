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
        "give me the weather right now in Lisbon",
        // PT-PT paraphrases (ADR-033)
        "como está o tempo",
        "vai chover",
        "está frio lá fora",
        "preciso de casaco",
      ],
      // Multi-lane, not just `converse` -- found live, 2026-08-06: "Give
      // me the weather right now, em Ponta Delgada, Açores." (a longer,
      // code-switched sentence naming a real place) classified as `see`,
      // not `converse`. `dispatch()` filters skill candidates to the
      // classified lane before the embedding match ever runs
      // (core/skills/dispatch.ts), so a converse-only declaration made
      // this unreachable for that exact phrasing regardless of score --
      // the same root cause and same fix as `look.describe` (this same
      // day) and `media.now_playing` (ADR-026/030). The fallback that
      // caught it (general conversation) then made things worse: it
      // parroted an unrelated prior forecast-refusal line from its own
      // recent-context window instead of admitting it didn't know,
      // rather than actually answering -- fixed by making this
      // reachable again, not by patching the fallback's honesty.
      lanes: ["converse", "see"],
    },
  ],

  capabilities: ["NET_READ", "MEMORY_WRITE"],
};
