/**
 * skills/tasks/index.ts — a private task list in the skill's own table
 * (`skill_tasks_items`), no gate involved: this is low-stakes, frequently
 * -changing personal data, not a shared `fact` (docs/SKILLS.md § 1).
 */

import { ulid } from "ulid";
import type { Skill, SkillContext, SkillInitContext } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

const SCHEMA = `CREATE TABLE IF NOT EXISTS skill_tasks_items (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`;

const EXTRACT_SYSTEM = `Extract just the task description from what the owner said -- the thing
to remember or do, nothing else. Respond with the task text only: no
quotes, no "task:", no leading "to". If no clear task is stated, respond
with exactly: NONE`;

interface TaskRow {
  id: string;
  text: string;
}

async function extractTaskText(ctx: SkillContext, utterance: string): Promise<string | null> {
  const raw = await ctx.router.complete("converse", EXTRACT_SYSTEM, utterance, { maxTokens: 40 });
  // Trailing punctuation from the model reads oddly once this project's
  // own "Added: <text>." wraps it again ("Added: drink coffee at 9am..")
  // -- found live.
  const trimmed = raw.trim().replace(/[.!?]+$/, "");
  if (!trimmed || trimmed.toUpperCase() === "NONE") return null;
  return trimmed;
}

async function addTask(input: { utterance: string }, ctx: SkillContext): Promise<{ speech: string }> {
  let text = await extractTaskText(ctx, input.utterance).catch(() => null);
  if (!text) text = (await ctx.ask("What's the task?")).trim();
  if (!text) {
    const speech = "I didn't catch a task to add.";
    ctx.say(speech);
    return { speech };
  }
  ctx.store.run("INSERT INTO skill_tasks_items (id, text, done, created_at) VALUES (?, ?, 0, ?)", ulid(), text, ctx.now());
  const speech = `Added: ${text}.`;
  ctx.say(speech);
  return { speech };
}

function listTasks(ctx: SkillContext): { speech: string } {
  const rows = ctx.store.all<TaskRow>("SELECT id, text FROM skill_tasks_items WHERE done = 0 ORDER BY created_at");
  const speech =
    rows.length === 0
      ? "You have no open tasks."
      : `You have ${rows.length} open task${rows.length === 1 ? "" : "s"}: ${rows.map((r) => r.text).join(", ")}.`;
  ctx.say(speech);
  return { speech };
}

async function completeTask(input: { utterance: string }, ctx: SkillContext): Promise<{ speech: string }> {
  const query = (await extractTaskText(ctx, input.utterance).catch(() => null)) ?? input.utterance;
  const openTasks = ctx.store.all<TaskRow>("SELECT id, text FROM skill_tasks_items WHERE done = 0");
  const q = query.toLowerCase();
  const matches = openTasks.filter((t) => t.text.toLowerCase().includes(q) || q.includes(t.text.toLowerCase()));

  if (matches.length === 0) {
    const speech = `I couldn't find an open task like "${query}".`;
    ctx.say(speech);
    return { speech };
  }
  if (matches.length > 1) {
    const speech = `I found more than one match: ${matches.map((m) => m.text).join(", ")}. Which one?`;
    ctx.say(speech);
    return { speech };
  }
  ctx.store.run("UPDATE skill_tasks_items SET done = 1 WHERE id = ?", matches[0]!.id);
  const speech = `Marked "${matches[0]!.text}" as done.`;
  ctx.say(speech);
  return { speech };
}

export const skill: Skill = {
  manifest,

  async init(ctx: SkillInitContext): Promise<void> {
    ctx.store.exec(SCHEMA);
  },

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
