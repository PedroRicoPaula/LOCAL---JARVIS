/**
 * skills/weather/index.test.ts — docs/SKILLS.md § 7's cases that apply:
 *   1. Happy path (known city) — covered.
 *   2. Owner rejects at confirmation — N/A directly, but "gate rejects
 *      the remember-city proposal" is covered (case 4) and must not
 *      affect today's spoken answer.
 *   3. The API returns nothing usable — covered (geocode miss, weather
 *      API miss), degrades honestly, does not throw.
 *   4. A proposal is rejected by the gate — covered.
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../../core/memory/db.ts";
import { Memory } from "../../core/memory/memory.ts";
import { fakeConversation, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { createWeatherSkill } from "./index.ts";

class FakeEmbedder {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [1, 0, 0]);
  }
}

test("happy path: known city from memory, no asking, speaks real weather", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  memory.upsertFact({ key: "location.city", value: "Ponta Delgada", confidence: 0.95 });
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ memory, conversation });
  const skill = createWeatherSkill({
    geocode: async () => ({ name: "Ponta Delgada", lat: 37.74, lon: -25.67 }),
    fetchCurrentWeather: async () => ({ tempC: 21, windKph: 14, code: 0 }),
  });

  const result = await skill.handle({ utterance: "what's the weather", intent: "current_weather", sessionId: "s1" }, ctx);

  assert.match(result.speech, /21 degrees in Ponta Delgada/);
  assert.match(result.speech, /clear sky/);
  memory.close();
});

test("no known city: asks once, then speaks weather for the answer", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const conversation = fakeConversation(["Lisbon"]);
  const ctx = fakeSkillContext({ memory, conversation });
  const skill = createWeatherSkill({
    geocode: async (city) => (city === "Lisbon" ? { name: "Lisbon", lat: 38.7, lon: -9.1 } : null),
    fetchCurrentWeather: async () => ({ tempC: 25, windKph: 8, code: 1 }),
  });

  const result = await skill.handle({ utterance: "what's the weather", intent: "current_weather", sessionId: "s1" }, ctx);

  assert.match(result.speech, /25 degrees in Lisbon/);
  memory.close();
});

test("unknown city: honest fallback, no crash, nothing proposed", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const conversation = fakeConversation(["Nowhereville"]);
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    memory,
    conversation,
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
  const skill = createWeatherSkill({
    geocode: async () => null,
    fetchCurrentWeather: async () => ({ tempC: 0, windKph: 0, code: 0 }),
  });

  const result = await skill.handle({ utterance: "what's the weather", intent: "current_weather", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't find/i);
  assert.equal(proposals.length, 0);
  memory.close();
});

test("weather API failure: honest fallback, does not throw", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  memory.upsertFact({ key: "location.city", value: "Ponta Delgada", confidence: 0.95 });
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ memory, conversation });
  const skill = createWeatherSkill({
    geocode: async () => ({ name: "Ponta Delgada", lat: 37.74, lon: -25.67 }),
    fetchCurrentWeather: async () => null,
  });

  const result = await skill.handle({ utterance: "what's the weather", intent: "current_weather", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't reach the weather service/i);
  memory.close();
});

test("asking about tomorrow/forecast is refused honestly, never silently asks for a city instead -- found live, SOAK 1", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const conversation = fakeConversation(); // no answer queued -- ctx.ask() must never be called
  const ctx = fakeSkillContext({ memory, conversation });
  const skill = createWeatherSkill({
    geocode: async () => {
      throw new Error("must not geocode for an unsupported forecast request");
    },
    fetchCurrentWeather: async () => {
      throw new Error("must not fetch weather for an unsupported forecast request");
    },
  });

  const result = await skill.handle(
    { utterance: "Can you give me the weather resume for tomorrow?", intent: "current_weather", sessionId: "s1" },
    ctx,
  );

  assert.match(result.speech, /can only tell you the current weather/i);
  memory.close();
});

test("a newly-learned city proposes remembering it, but a gate rejection doesn't change the spoken weather", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const conversation = fakeConversation(["Porto"]);
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    memory,
    conversation,
    propose: async (action) => {
      proposals.push(action);
      return { ok: false, reason: "rejected" };
    },
  });
  const skill = createWeatherSkill({
    geocode: async () => ({ name: "Porto", lat: 41.1, lon: -8.6 }),
    fetchCurrentWeather: async () => ({ tempC: 18, windKph: 20, code: 61 }),
  });

  const result = await skill.handle({ utterance: "what's the weather", intent: "current_weather", sessionId: "s1" }, ctx);

  assert.match(result.speech, /18 degrees in Porto/);
  await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget propose() settle
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.capability, "MEMORY_WRITE");
  memory.close();
});
