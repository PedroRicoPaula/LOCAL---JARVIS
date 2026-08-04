/**
 * skills/shopping_list/index.test.ts — docs/SKILLS.md § 7's cases that
 * apply, same reasoning as skills/tasks/index.test.ts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSkillStore } from "../../core/skills/store.ts";
import { fakeConversation, fakeLogger, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import { skill } from "./index.ts";

function freshStore() {
  const db = new DatabaseSync(":memory:");
  return createSkillStore(db, "shopping_list");
}

async function initialized(store: ReturnType<typeof freshStore>) {
  await skill.init!({ store, memory: undefined as never, log: fakeLogger() });
}

test("happy path: add, list, remove", async () => {
  const store = freshStore();
  await initialized(store);

  const addResult = await skill.handle(
    { utterance: "we need eggs", intent: "add_item", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "eggs" }) }),
  );
  assert.equal(addResult.speech, "Added eggs to the shopping list.");

  const listResult = await skill.handle(
    { utterance: "what's on the list", intent: "list_items", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter() }),
  );
  assert.match(listResult.speech, /eggs/);

  const removeResult = await skill.handle(
    { utterance: "got the eggs", intent: "remove_item", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "eggs" }) }),
  );
  assert.match(removeResult.speech, /Removed eggs/);

  const afterResult = await skill.handle(
    { utterance: "what's on the list", intent: "list_items", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter() }),
  );
  assert.equal(afterResult.speech, "The shopping list is empty.");
});

test("clear_list empties everything, unconditionally", async () => {
  const store = freshStore();
  await initialized(store);
  await skill.handle(
    { utterance: "add milk", intent: "add_item", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "milk" }) }),
  );
  await skill.handle(
    { utterance: "add bread", intent: "add_item", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "bread" }) }),
  );

  const result = await skill.handle(
    { utterance: "clear the shopping list", intent: "clear_list", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter() }),
  );

  assert.equal(result.speech, "Shopping list cleared.");
  const after = await skill.handle(
    { utterance: "what's on the list", intent: "list_items", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter() }),
  );
  assert.equal(after.speech, "The shopping list is empty.");
});

test("extraction failure falls back to asking", async () => {
  const store = freshStore();
  await initialized(store);
  const conversation = fakeConversation(["paper towels"]);

  const result = await skill.handle(
    { utterance: "add to shopping list", intent: "add_item", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "NONE" }), conversation }),
  );

  assert.equal(result.speech, "Added paper towels to the shopping list.");
});

test("removing something not on the list is honest, not a guess", async () => {
  const store = freshStore();
  await initialized(store);

  const result = await skill.handle(
    { utterance: "remove caviar", intent: "remove_item", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "caviar" }) }),
  );

  assert.match(result.speech, /couldn't find/i);
});
