/**
 * skills/brief/index.ts — the reference skill for Phase 5 (docs/SKILLS.md
 * § 8: this is also what `make new-skill` scaffolds from). No executor
 * import — this skill only ever reads memory and speaks; enforced by
 * ESLint (`eslint.config.js`), not just by not having written one.
 */

import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

const PHRASING_SYSTEM = `You relay a list of known facts about the owner as
plain spoken sentences. Each fact is "<name> is <value>" -- state it
directly as something true about the owner, in one clause. Do not explain,
interpret, or comment on what a fact means -- just relay it.

Example input: "verbosity is terse; diet.avoids is peanuts"
Example output: "You prefer terse answers, and you avoid peanuts."

Combine all facts into one or two brief sentences total. Do not invent
anything not in the list. If the list is empty (shown as "(nothing)"), say
plainly that there's nothing new. No greetings-only filler.`;

function templatedBrief(factLines: string[], hasRecent: boolean): string {
  if (factLines.length === 0 && !hasRecent) {
    return "Nothing new since we last spoke.";
  }
  return factLines.length > 0 ? `Here's what I know: ${factLines.join(", ")}.` : "Nothing new to report.";
}

async function composeBrief(ctx: SkillContext, factLines: string[], hasRecent: boolean): Promise<string> {
  const template = templatedBrief(factLines, hasRecent);
  try {
    // Try a nicer phrasing through the router; degrade to the plain
    // template if it fails or comes back empty (docs/SKILLS.md § 7 test
    // 3: "the model returns garbage -> skill degrades, does not throw").
    const phrased = await ctx.router.complete("converse", PHRASING_SYSTEM, factLines.join("; ") || "(nothing)");
    return phrased.trim() || template;
  } catch {
    return template;
  }
}

export const skill: Skill = {
  manifest,

  async handle(_input, ctx): Promise<{ speech: string }> {
    const facts = ctx.memory.factsAboveConfidence();
    const recent = ctx.memory.recentEventsForSession(ctx.sessionId, 5);
    const factLines = facts.map((f) => `${f.key.split(".").pop()} is ${f.value}`);

    const speech = await composeBrief(ctx, factLines, recent.length > 0);
    ctx.say(speech);
    return { speech };
  },
};
