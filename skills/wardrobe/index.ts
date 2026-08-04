/**
 * skills/wardrobe/index.ts
 */

import type { Skill } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

export const skill: Skill = {
  manifest,

  async handle(_input, ctx): Promise<{ speech: string }> {
    const speech = "wardrobe is not implemented yet.";
    ctx.say(speech);
    return { speech };
  },
};
