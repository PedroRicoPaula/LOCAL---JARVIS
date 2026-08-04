/**
 * skills/shopping_list/index.ts — same shape as `skills/tasks`: a
 * private list in the skill's own table, no gate involved.
 */

import { ulid } from "ulid";
import type { Skill, SkillContext, SkillInitContext } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

const SCHEMA = `CREATE TABLE IF NOT EXISTS skill_shopping_list_items (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`;

const EXTRACT_SYSTEM = `Extract just the grocery/household item from what the owner said --
the thing to buy, nothing else. Respond with the item name only: no
quotes, no leading "buy" or "some". If no clear item is stated, respond
with exactly: NONE`;

interface ItemRow {
  id: string;
  text: string;
}

async function extractItemText(ctx: SkillContext, utterance: string): Promise<string | null> {
  const raw = await ctx.router.complete("converse", EXTRACT_SYSTEM, utterance, { maxTokens: 40 });
  // Same trailing-punctuation cosmetic fix as skills/tasks -- found live.
  const trimmed = raw.trim().replace(/[.!?]+$/, "");
  if (!trimmed || trimmed.toUpperCase() === "NONE") return null;
  return trimmed;
}

async function addItem(input: { utterance: string }, ctx: SkillContext): Promise<{ speech: string }> {
  let text = await extractItemText(ctx, input.utterance).catch(() => null);
  if (!text) text = (await ctx.ask("What should I add?")).trim();
  if (!text) {
    const speech = "I didn't catch an item to add.";
    ctx.say(speech);
    return { speech };
  }
  ctx.store.run("INSERT INTO skill_shopping_list_items (id, text, created_at) VALUES (?, ?, ?)", ulid(), text, ctx.now());
  const speech = `Added ${text} to the shopping list.`;
  ctx.say(speech);
  return { speech };
}

function listItems(ctx: SkillContext): { speech: string } {
  const rows = ctx.store.all<ItemRow>("SELECT id, text FROM skill_shopping_list_items ORDER BY created_at");
  const speech = rows.length === 0 ? "The shopping list is empty." : `On the list: ${rows.map((r) => r.text).join(", ")}.`;
  ctx.say(speech);
  return { speech };
}

async function removeItem(input: { utterance: string }, ctx: SkillContext): Promise<{ speech: string }> {
  const query = (await extractItemText(ctx, input.utterance).catch(() => null)) ?? input.utterance;
  const items = ctx.store.all<ItemRow>("SELECT id, text FROM skill_shopping_list_items");
  const q = query.toLowerCase();
  const matches = items.filter((i) => i.text.toLowerCase().includes(q) || q.includes(i.text.toLowerCase()));

  if (matches.length === 0) {
    const speech = `I couldn't find "${query}" on the list.`;
    ctx.say(speech);
    return { speech };
  }
  if (matches.length > 1) {
    const speech = `I found more than one match: ${matches.map((m) => m.text).join(", ")}. Which one?`;
    ctx.say(speech);
    return { speech };
  }
  ctx.store.run("DELETE FROM skill_shopping_list_items WHERE id = ?", matches[0]!.id);
  const speech = `Removed ${matches[0]!.text} from the list.`;
  ctx.say(speech);
  return { speech };
}

function clearList(ctx: SkillContext): { speech: string } {
  ctx.store.run("DELETE FROM skill_shopping_list_items");
  const speech = "Shopping list cleared.";
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
      case "add_item":
        return addItem(input, ctx);
      case "list_items":
        return listItems(ctx);
      case "remove_item":
        return removeItem(input, ctx);
      case "clear_list":
        return clearList(ctx);
      default: {
        const speech = "I'm not sure what you want to do with the shopping list.";
        ctx.say(speech);
        return { speech };
      }
    }
  },
};
