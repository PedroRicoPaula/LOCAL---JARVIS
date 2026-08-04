import type { Skill } from "../../types.ts";

export const skill: Skill = {
  manifest: {
    id: "fixture_good",
    version: "1.0.0",
    description: "A valid fixture skill.",
    intents: [
      { id: "only", description: "the only intent", examples: ["hello", "hi there"], lanes: ["converse"] },
    ],
    capabilities: ["MEMORY_READ"],
  },
  async handle() {
    return { speech: "ok" };
  },
};
