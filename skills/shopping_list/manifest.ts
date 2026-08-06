/**
 * skills/shopping_list/manifest.ts — docs/SKILLS.md § 2. Same pattern as
 * `skills/tasks`: skill-owned storage, no capability gate.
 *
 * `id` is `shopping_list`, not `shopping-list` -- found live: `ctx.store`
 * enforces the `skill_<id>_` table prefix as a literal string match
 * (`core/skills/store.ts`), and a hyphen isn't a valid unquoted SQL
 * identifier character, so `skill_shopping-list_items` would never match
 * its own namespace check. Underscore-only skill ids if the skill uses
 * `ctx.store`.
 *
 * Examples avoid "coffee" deliberately -- found live: `add_item`/
 * `remove_item` both used to say "coffee" ("we're out of coffee", "got
 * the coffee"), and any real utterance mentioning coffee for an
 * unrelated reason ("remind me to drink coffee at 9am") embedded closer
 * to this skill than to `tasks`' own matching example, misrouting a
 * task-add into a shopping-list intent. "Coffee" isn't special --
 * whatever word an example uses becomes a magnet for anything else that
 * happens to mention it.
 *
 * Every intent declares `converse`, `act`, and `see` -- found live in a
 * real conversation (SOAK 1): "Can you delete milk sugar from the
 * shopping list?" classified as `act`, "Remove or delete Milk Sugar
 * from Shopping List" classified as `see` -- neither matched this
 * skill's `converse`-only intents, so both silently fell through to
 * `converse`'s general-conversation fallback, which then *claimed* to
 * have deleted the item (never did -- see `core/persona.md`'s new rule
 * against this). Same root pattern ADR-026 already fixed for
 * `launcher`/`media` (multi-lane over fighting the classifier prompt),
 * just never applied here. Not `reflex` -- list edits aren't the
 * "trivial, instant" class that lane is defined for.
 */

import type { SkillManifest } from "../../shared/types.ts";

const LIST_LANES = ["converse", "act", "see"] as const;

export const manifest: SkillManifest = {
  id: "shopping_list",
  version: "1.0.0",
  description: "A household shopping list -- add, list, remove, and clear items by voice.",

  intents: [
    {
      id: "add_item",
      description: "Add an item to the shopping list.",
      examples: [
        "add milk to the shopping list",
        "we need eggs",
        "put bread on the list",
        "add to shopping list",
        "we're out of butter",
        "buy more paper towels",
        // PT-PT paraphrases (ADR-033)
        "adiciona leite à lista de compras",
        "falta-nos ovos",
        "põe pão na lista",
        "estamos sem manteiga",
      ],
      lanes: [...LIST_LANES],
    },
    {
      id: "list_items",
      description: "Read back the current shopping list.",
      examples: [
        "what's on the shopping list",
        "read my shopping list",
        "what do I need to buy",
        "what are we out of",
        // PT-PT paraphrases (ADR-033)
        "o que está na lista de compras",
        "o que é que eu preciso de comprar",
        "lê-me a lista de compras",
      ],
      lanes: [...LIST_LANES],
    },
    {
      id: "remove_item",
      description: "Remove an item from the shopping list, e.g. after buying it.",
      examples: [
        "take milk off the list",
        "I already bought eggs",
        "remove bread from the shopping list",
        "got the butter",
        // PT-PT paraphrases (ADR-033)
        "tira o leite da lista",
        "já comprei os ovos",
        "remove o pão da lista de compras",
      ],
      lanes: [...LIST_LANES],
    },
    {
      id: "clear_list",
      description: "Clear the entire shopping list, e.g. after a shopping trip.",
      examples: [
        "clear the shopping list",
        "I did all the shopping",
        "empty the shopping list",
        "start a fresh shopping list",
        // PT-PT paraphrases (ADR-033)
        "limpa a lista de compras",
        "já fiz as compras todas",
        "esvazia a lista de compras",
      ],
      lanes: [...LIST_LANES],
    },
  ],

  capabilities: [],
};
