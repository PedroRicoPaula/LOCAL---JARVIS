/**
 * skills/tasks/index.test.ts — docs/SKILLS.md § 7's cases that apply:
 *   1. Happy path — add, list, complete, covered below.
 *   2. Owner rejects at confirmation — N/A, no ctx.propose() in this skill.
 *   3. The model returns garbage (extraction) — covered: falls back to
 *      ctx.ask() when extraction yields nothing usable.
 *   4. A proposal is rejected by the gate — N/A, no ctx.propose().
 *   5. cancel() mid-interaction — N/A, no multi-turn state, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSkillStore } from "../../core/skills/store.ts";
import { fakeConversation, fakeLogger, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import { skill } from "./index.ts";

function freshStore() {
  const db = new DatabaseSync(":memory:");
  return createSkillStore(db, "tasks");
}

async function initialized(store: ReturnType<typeof freshStore>) {
  await skill.init!({ store, memory: undefined as never, log: fakeLogger() });
}

test("strips trailing punctuation the model adds -- found live as 'Added: X..'", async () => {
  const store = freshStore();
  await initialized(store);
  const router = fakeRouter({ completeReturns: "drink coffee at 9am." });

  const result = await skill.handle(
    { utterance: "remind me to drink coffee at 9am", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ store, router }),
  );

  assert.equal(result.speech, "Added: drink coffee at 9am.");
});

test("happy path: add, list, complete", async () => {
  const store = freshStore();
  await initialized(store);
  const router = fakeRouter({ completeReturns: "call the dentist" });

  const addResult = await skill.handle(
    { utterance: "remind me to call the dentist", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ store, router }),
  );
  assert.equal(addResult.speech, "Added: call the dentist.");

  const listResult = await skill.handle(
    { utterance: "what are my tasks", intent: "list_tasks", sessionId: "s1" },
    fakeSkillContext({ store, router }),
  );
  assert.match(listResult.speech, /call the dentist/);

  const completeRouter = fakeRouter({ completeReturns: "call the dentist" });
  const completeResult = await skill.handle(
    { utterance: "I called the dentist", intent: "complete_task", sessionId: "s1" },
    fakeSkillContext({ store, router: completeRouter }),
  );
  assert.match(completeResult.speech, /Marked "call the dentist" as done/);

  const afterResult = await skill.handle(
    { utterance: "what are my tasks", intent: "list_tasks", sessionId: "s1" },
    fakeSkillContext({ store, router }),
  );
  assert.equal(afterResult.speech, "You have no open tasks.");
});

test("extraction returning NONE falls back to asking", async () => {
  const store = freshStore();
  await initialized(store);
  const router = fakeRouter({ completeReturns: "NONE" });
  const conversation = fakeConversation(["buy a birthday present"]);

  const result = await skill.handle(
    { utterance: "add a task", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ store, router, conversation }),
  );

  assert.equal(result.speech, "Added: buy a birthday present.");
});

test("extraction throwing (model down) falls back to asking, does not crash", async () => {
  const store = freshStore();
  await initialized(store);
  const router = fakeRouter({ completeThrows: new Error("nim is down") });
  const conversation = fakeConversation(["water the plants"]);

  const result = await skill.handle(
    { utterance: "add a task", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ store, router, conversation }),
  );

  assert.equal(result.speech, "Added: water the plants.");
});

test("completing an unknown task reports honestly instead of guessing", async () => {
  const store = freshStore();
  await initialized(store);
  const router = fakeRouter({ completeReturns: "something that was never added" });

  const result = await skill.handle(
    { utterance: "mark the moon landing as done", intent: "complete_task", sessionId: "s1" },
    fakeSkillContext({ store, router }),
  );

  assert.match(result.speech, /couldn't find/i);
});

test("an ambiguous match lists the candidates and asks, doesn't guess one", async () => {
  const store = freshStore();
  await initialized(store);

  await skill.handle(
    { utterance: "add call the dentist", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "call the dentist" }) }),
  );
  await skill.handle(
    { utterance: "add call the plumber", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "call the plumber" }) }),
  );

  const result = await skill.handle(
    { utterance: "I made the call", intent: "complete_task", sessionId: "s1" },
    fakeSkillContext({ store, router: fakeRouter({ completeReturns: "call" }) }),
  );

  assert.match(result.speech, /more than one/i);
  assert.match(result.speech, /call the dentist/);
  assert.match(result.speech, /call the plumber/);
});
