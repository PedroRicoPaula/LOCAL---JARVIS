import type { Skill } from "../../types.ts";

export const skill: Skill = {
  manifest: {
    id: "fixture_throwing_init",
    version: "1.0.0",
    description: "A skill whose init() throws.",
    intents: [{ id: "only", description: "x", examples: ["x"], lanes: ["converse"] }],
    capabilities: ["MEMORY_READ"],
  },
  async init() {
    throw new Error("deliberate init failure");
  },
  async handle() {
    return { speech: "should never be reached" };
  },
};
