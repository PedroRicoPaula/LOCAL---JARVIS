import type { Skill } from "../../types.ts";

// Deliberately declares the same id as goodSkill.ts, from a different
// file -- the realistic shape of the mistake this fixture exists to
// catch (a copy-pasted manifest, id left unchanged), which two loop
// iterations over the exact same path string wouldn't exercise (module
// resolution caches by URL, so the "same path twice" case collapses in
// a way a real duplicate-id bug from two different files doesn't).
export const skill: Skill = {
  manifest: {
    id: "fixture_good",
    version: "1.0.0",
    description: "A second, distinct fixture skill that collides on id.",
    intents: [
      { id: "only", description: "the only intent", examples: ["totally different example"], lanes: ["converse"] },
    ],
    capabilities: ["MEMORY_READ"],
  },
  async handle() {
    return { speech: "should never be reached -- duplicate id" };
  },
};
