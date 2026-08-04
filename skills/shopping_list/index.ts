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

// Was single-item only -- found live (SOAK 1): "add Milk and Sugar to
// the shopping list" came back as one literal string containing an
// embedded newline ("Milk\nSugar"), stored as a single garbage item,
// and repeating the request more explicitly ("it's two items") produced
// the exact same bug again. The owner's phrasing was never ambiguous --
// the extraction contract just never had a way to say "more than one."
// Now explicitly asks for one item per line and every line becomes its
// own row.
const EXTRACT_SYSTEM = `Extract each distinct grocery/household item from what the owner said
-- the things to buy, nothing else. If more than one item was
mentioned, respond with each item on its own line, in the order
mentioned. No quotes, no leading "buy" or "some", no numbering, no
bullets. If no clear item is stated, respond with exactly: NONE`;

interface ItemRow {
  id: string;
  text: string;
}

async function extractItems(ctx: SkillContext, utterance: string): Promise<string[]> {
  const raw = await ctx.router.complete("converse", EXTRACT_SYSTEM, utterance, { maxTokens: 60 });
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "NONE") return [];
  return trimmed
    .split("\n")
    // Same trailing-punctuation cosmetic fix as skills/tasks -- found live.
    .map((line) => line.trim().replace(/[.!?]+$/, ""))
    .filter((line) => line.length > 0 && line.toUpperCase() !== "NONE");
}

async function addItem(input: { utterance: string }, ctx: SkillContext): Promise<{ speech: string }> {
  let items = await extractItems(ctx, input.utterance).catch(() => []);
  if (items.length === 0) {
    const answer = (await ctx.ask("What should I add?")).trim().replace(/[.!?]+$/, "");
    items = answer ? [answer] : [];
  }
  if (items.length === 0) {
    const speech = "I didn't catch an item to add.";
    ctx.say(speech);
    return { speech };
  }
  const now = ctx.now();
  for (const item of items) {
    ctx.store.run("INSERT INTO skill_shopping_list_items (id, text, created_at) VALUES (?, ?, ?)", ulid(), item, now);
  }
  const speech = `Added ${items.join(", ")} to the shopping list.`;
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
  // remove_item targets one item -- if the model somehow extracted more
  // than one (e.g. "remove milk and sugar"), match against the first;
  // multi-item removal isn't asked for by any real utterance seen yet.
  const extracted = await extractItems(ctx, input.utterance).catch(() => []);
  const query = extracted[0] ?? input.utterance;
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
