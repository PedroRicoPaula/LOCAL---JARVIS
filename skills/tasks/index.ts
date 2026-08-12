/**
 * skills/tasks/index.ts — real Reminders.app tasks, via `ctx.propose({
 * capability: "REMINDERS", ...})` (`core/executors/reminders.ts`) --
 * never a direct call, matching every other capability's rule
 * (docs/SKILLS.md § 1). `REMINDERS` is green -- these calls run and
 * return immediately, no approval wait, but are still logged
 * (CLAUDE.md § 5's "runs unprompted... still logged").
 *
 * Extraction and fuzzy-matching logic (`extractTaskText`, matching a
 * spoken description against the real open reminders) is unchanged from
 * the private-table version -- only the storage calls changed.
 */

import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { extractOrNull } from "../_shared/extract.ts";
import { manifest } from "./manifest.ts";

const EXTRACT_SYSTEM = `Extract just the task description from what the owner said -- the thing
to remember or do, nothing else. Respond with the task text only: no
quotes, no "task:", no leading "to". If no clear task is stated, respond
with exactly: NONE`;

/** Local mirror of `core/executors/reminders.ts`'s `ReminderItem` -- a
 * skill can't import from `core/executors/**` at all (ESLint-enforced,
 * docs/SKILLS.md § 1), so this is the wire shape `ctx.propose()`'s
 * `outcome.result` actually has, kept in sync by hand. */
interface ReminderItem {
  id: string;
  name: string;
}

// Trailing punctuation from the model reads oddly once this project's
// own "Added: <text>." wraps it again ("Added: drink coffee at 9am..")
// -- found live.
function extractTaskText(ctx: SkillContext, utterance: string): Promise<string | null> {
  return extractOrNull(ctx, EXTRACT_SYSTEM, utterance, { maxTokens: 40, stripTrailingPunctuation: true });
}

async function addTask(input: { utterance: string }, ctx: SkillContext): Promise<{ speech: string }> {
  let text = await extractTaskText(ctx, input.utterance).catch(() => null);
  if (!text) text = (await ctx.ask("What's the task?")).trim();
  if (!text) {
    const speech = "I didn't catch a task to add.";
    ctx.say(speech);
    return { speech };
  }
  const outcome = await ctx.propose({
    capability: "REMINDERS",
    humanSummary: `Add reminder: ${text}`,
    payload: { action: "add", text },
  });
  const speech = outcome.ok ? `Added: ${text}.` : `Couldn't add that -- ${outcome.detail ?? outcome.reason ?? "something went wrong"}.`;
  ctx.say(speech);
  return { speech };
}

async function listTasks(ctx: SkillContext): Promise<{ speech: string }> {
  const outcome = await ctx.propose({
    capability: "REMINDERS",
    humanSummary: "List open reminders",
    payload: { action: "list" },
  });
  if (!outcome.ok) {
    const speech = `Couldn't check your tasks -- ${outcome.detail ?? outcome.reason ?? "something went wrong"}.`;
    ctx.say(speech);
    return { speech };
  }
  const items = outcome.result as ReminderItem[];
  const speech =
    items.length === 0
      ? "You have no open tasks."
      : `You have ${items.length} open task${items.length === 1 ? "" : "s"}: ${items.map((i) => i.name).join(", ")}.`;
  ctx.say(speech);
  return { speech };
}

async function completeTask(input: { utterance: string }, ctx: SkillContext): Promise<{ speech: string }> {
  const query = (await extractTaskText(ctx, input.utterance).catch(() => null)) ?? input.utterance;

  const listOutcome = await ctx.propose({
    capability: "REMINDERS",
    humanSummary: "List open reminders",
    payload: { action: "list" },
  });
  if (!listOutcome.ok) {
    const speech = `Couldn't check your tasks -- ${listOutcome.detail ?? listOutcome.reason ?? "something went wrong"}.`;
    ctx.say(speech);
    return { speech };
  }
  const openTasks = listOutcome.result as ReminderItem[];
  const q = query.toLowerCase();
  const matches = openTasks.filter((t) => t.name.toLowerCase().includes(q) || q.includes(t.name.toLowerCase()));

  if (matches.length === 0) {
    const speech = `I couldn't find an open task like "${query}".`;
    ctx.say(speech);
    return { speech };
  }
  if (matches.length > 1) {
    const speech = `I found more than one match: ${matches.map((m) => m.name).join(", ")}. Which one?`;
    ctx.say(speech);
    return { speech };
  }

  const completeOutcome = await ctx.propose({
    capability: "REMINDERS",
    humanSummary: `Complete reminder: ${matches[0]!.name}`,
    payload: { action: "complete", id: matches[0]!.id },
  });
  const speech = completeOutcome.ok
    ? `Marked "${matches[0]!.name}" as done.`
    : `Couldn't mark that done -- ${completeOutcome.detail ?? completeOutcome.reason ?? "something went wrong"}.`;
  ctx.say(speech);
  return { speech };
}

export const skill: Skill = {
  manifest,

  async handle(input, ctx): Promise<{ speech: string }> {
    switch (input.intent) {
      case "add_task":
        return addTask(input, ctx);
      case "list_tasks":
        return listTasks(ctx);
      case "complete_task":
        return completeTask(input, ctx);
      default: {
        const speech = "I'm not sure what you want to do with your tasks.";
        ctx.say(speech);
        return { speech };
      }
    }
  },
};
