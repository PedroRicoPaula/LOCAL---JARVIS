import type { Skill } from "../../types.ts";

export const skill: Skill = {
  manifest: {
    id: "fixture_good",
    version: "1.0.0",
    description: "A valid fixture skill.",
    intents: [
      // Deliberately task-shaped, not a greeting. These were "hello" /
      // "hi there" until 2026-08-17, when `core/skills/socialUtterance.ts`
      // started short-circuiting pure pleasantries before dispatch --
      // which correctly made this fixture unreachable via "hello". A real
      // skill would never claim a bare greeting as an intent example
      // (that's exactly the case the guard exists for), so the fixture is
      // what was unrealistic here, not the guard.
      { id: "only", description: "the only intent", examples: ["polish the widget", "buff the widget"], lanes: ["converse"] },
    ],
    capabilities: ["MEMORY_READ"],
  },
  async handle() {
    return { speech: "ok" };
  },
};
