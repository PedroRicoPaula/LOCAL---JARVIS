/**
 * skills/weather/index.ts — real weather, real source, honest gaps. No
 * model ever produces the temperature; it comes from Open-Meteo or the
 * skill says it doesn't know (CLAUDE.md § 6).
 */

import type { Skill } from "../../core/skills/types.ts";
import { describeWeatherCode, fetchCurrentWeather, geocode } from "./api.ts";
import { manifest } from "./manifest.ts";

const LOCATION_FACT_KEY = "location.city";

// Found live (SOAK 1, twice across two different sessions): asked for
// "the weather for tomorrow," this skill silently ignored "tomorrow"
// and proceeded into its ordinary current-weather flow -- asking for a
// city the owner had no reason to expect, which then timed out
// (`ctx.ask()`'s 30s window) because the question didn't match what was
// actually asked. This skill only ever calls Open-Meteo's *current*
// conditions endpoint (see api.ts) -- there is no forecast capability
// to silently fall short of. CLAUDE.md § 6: say so plainly rather than
// proceed as if a different, unsupported question was asked.
const FORECAST_PATTERN = /\b(tomorrow|forecast|next (week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this weekend)\b/i;

function speakWeather(cityName: string, tempC: number, windKph: number, code: number): string {
  const roundedTemp = Math.round(tempC);
  const roundedWind = Math.round(windKph);
  return `It's ${roundedTemp} degrees in ${cityName}, ${describeWeatherCode(code)}, wind ${roundedWind} kilometers per hour.`;
}

export interface WeatherDeps {
  geocode: typeof geocode;
  fetchCurrentWeather: typeof fetchCurrentWeather;
}

const DEFAULT_DEPS: WeatherDeps = { geocode, fetchCurrentWeather };

/** Factory, not just the plain `skill` export below, so tests can inject
 * a fake `geocode`/`fetchCurrentWeather` without a network call
 * (CLAUDE.md § 3) -- same reasoning as `core/router/providers/
 * ollama.ts`'s injectable `fetchFn`, one level up. */
export function createWeatherSkill(deps: WeatherDeps = DEFAULT_DEPS): Skill {
  return {
    manifest,

    async handle(input, ctx): Promise<{ speech: string }> {
      if (FORECAST_PATTERN.test(input.utterance)) {
        const speech = "I can only tell you the current weather right now, not a forecast for another day.";
        ctx.say(speech);
        return { speech };
      }

      const knownCity = ctx.memory.getFact(LOCATION_FACT_KEY);
      let cityQuery: string;
      let isNewCity = false;

      if (knownCity) {
        cityQuery = knownCity.value;
      } else {
        cityQuery = await ctx.ask("What city should I use for weather?");
        isNewCity = true;
      }

      const place = await deps.geocode(cityQuery);
      if (!place) {
        const speech = `I couldn't find a place called "${cityQuery}".`;
        ctx.say(speech);
        return { speech };
      }

      const current = await deps.fetchCurrentWeather(place.lat, place.lon);
      if (!current) {
        const speech = "I couldn't reach the weather service just now.";
        ctx.say(speech);
        return { speech };
      }

      const speech = speakWeather(place.name, current.tempC, current.windKph, current.code);
      ctx.say(speech);

      if (isNewCity) {
        // Fire-and-forget: remembering the city for next time must never
        // add latency to today's answer, and today's weather doesn't
        // depend on whether the owner approves saving it (CLAUDE.md § 7).
        ctx
          .propose({
            capability: "MEMORY_WRITE",
            humanSummary: `Remember "${place.name}" as your city for weather`,
            payload: { key: LOCATION_FACT_KEY, value: place.name, confidence: 0.95 },
          })
          .catch((err) => ctx.log.error("weather: failed to propose remembering city", { err: String(err) }));
      }

      return { speech };
    },
  };
}

export const skill: Skill = createWeatherSkill();
