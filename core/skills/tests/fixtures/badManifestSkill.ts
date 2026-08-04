import type { Skill } from "../../types.ts";

export const skill = {
  manifest: {
    id: "fixture_bad",
    version: "1.0.0",
    // description deliberately missing -- must fail validateManifest()
    intents: [],
    capabilities: [],
  },
  async handle() {
    return { speech: "should never load" };
  },
} as unknown as Skill;
