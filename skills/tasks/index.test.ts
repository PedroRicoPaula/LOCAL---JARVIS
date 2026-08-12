/**
 * skills/tasks/index.test.ts — docs/SKILLS.md § 7's cases that apply:
 *   1. Happy path — add, list, complete, covered below.
 *   2. Owner rejects at confirmation — N/A, REMINDERS is green
 *      (CLAUDE.md § 5), no approval wait to reject.
 *   3. The model returns garbage (extraction) — covered: falls back to
 *      ctx.ask() when extraction yields nothing usable.
 *   4. A proposal is rejected by the gate — N/A, green tier.
 *   5. cancel() mid-interaction — N/A, no multi-turn state, no cancel().
 *
 * `ctx.propose` is faked with a small in-memory reminders store
 * (`fakeReminders()` below) instead of a real `ctx.store` -- the skill
 * no longer touches `ctx.store` at all (real Reminders.app via
 * `REMINDERS`, `core/executors/reminders.ts`, not tested here -- that's
 * `core/executors/tests/reminders.test.ts`'s job). This fake mirrors
 * enough of a real Reminders.app's add/list/complete behavior for the
 * skill's own logic (extraction, fuzzy matching) to be tested against
 * evolving state, the same way the old private-table tests did.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { skill } from "./index.ts";

interface Item {
  id: string;
  name: string;
}

function fakeReminders(): { propose: (action: ProposedAction) => Promise<{ ok: true; result: unknown }>; items: Item[] } {
  const items: Item[] = [];
  let nextId = 1;
  return {
    items,
    propose: async (action) => {
      const p = action.payload as { action: string; text?: string; id?: string };
      if (p.action === "add") {
        const item = { id: `id-${nextId++}`, name: p.text! };
        items.push(item);
        return { ok: true, result: item };
      }
      if (p.action === "list") {
        return { ok: true, result: [...items] };
      }
      if (p.action === "complete") {
        const idx = items.findIndex((i) => i.id === p.id);
        const item = items[idx]!;
        items.splice(idx, 1);
        return { ok: true, result: item };
      }
      throw new Error(`fakeReminders: unhandled action ${JSON.stringify(p)}`);
    },
  };
}

test("strips trailing punctuation the model adds -- found live as 'Added: X..'", async () => {
  const reminders = fakeReminders();
  const router = fakeRouter({ completeReturns: "drink coffee at 9am." });

  const result = await skill.handle(
    { utterance: "remind me to drink coffee at 9am", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ router, propose: reminders.propose }),
  );

  assert.equal(result.speech, "Added: drink coffee at 9am.");
});

test("happy path: add, list, complete", async () => {
  const reminders = fakeReminders();
  const router = fakeRouter({ completeReturns: "call the dentist" });

  const addResult = await skill.handle(
    { utterance: "remind me to call the dentist", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ router, propose: reminders.propose }),
  );
  assert.equal(addResult.speech, "Added: call the dentist.");

  const listResult = await skill.handle(
    { utterance: "what are my tasks", intent: "list_tasks", sessionId: "s1" },
    fakeSkillContext({ router, propose: reminders.propose }),
  );
  assert.match(listResult.speech, /call the dentist/);

  const completeRouter = fakeRouter({ completeReturns: "call the dentist" });
  const completeResult = await skill.handle(
    { utterance: "I called the dentist", intent: "complete_task", sessionId: "s1" },
    fakeSkillContext({ router: completeRouter, propose: reminders.propose }),
  );
  assert.match(completeResult.speech, /Marked "call the dentist" as done/);

  const afterResult = await skill.handle(
    { utterance: "what are my tasks", intent: "list_tasks", sessionId: "s1" },
    fakeSkillContext({ router, propose: reminders.propose }),
  );
  assert.equal(afterResult.speech, "You have no open tasks.");
});

test("extraction returning NONE falls back to asking", async () => {
  const reminders = fakeReminders();
  const router = fakeRouter({ completeReturns: "NONE" });
  const conversation = fakeConversation(["buy a birthday present"]);

  const result = await skill.handle(
    { utterance: "add a task", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ router, conversation, propose: reminders.propose }),
  );

  assert.equal(result.speech, "Added: buy a birthday present.");
});

test("extraction throwing (model down) falls back to asking, does not crash", async () => {
  const reminders = fakeReminders();
  const router = fakeRouter({ completeThrows: new Error("nim is down") });
  const conversation = fakeConversation(["water the plants"]);

  const result = await skill.handle(
    { utterance: "add a task", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ router, conversation, propose: reminders.propose }),
  );

  assert.equal(result.speech, "Added: water the plants.");
});

test("completing an unknown task reports honestly instead of guessing", async () => {
  const reminders = fakeReminders();
  const router = fakeRouter({ completeReturns: "something that was never added" });

  const result = await skill.handle(
    { utterance: "mark the moon landing as done", intent: "complete_task", sessionId: "s1" },
    fakeSkillContext({ router, propose: reminders.propose }),
  );

  assert.match(result.speech, /couldn't find/i);
});

test("an ambiguous match lists the candidates and asks, doesn't guess one", async () => {
  const reminders = fakeReminders();

  await skill.handle(
    { utterance: "add call the dentist", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ router: fakeRouter({ completeReturns: "call the dentist" }), propose: reminders.propose }),
  );
  await skill.handle(
    { utterance: "add call the plumber", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ router: fakeRouter({ completeReturns: "call the plumber" }), propose: reminders.propose }),
  );

  const result = await skill.handle(
    { utterance: "I made the call", intent: "complete_task", sessionId: "s1" },
    fakeSkillContext({ router: fakeRouter({ completeReturns: "call" }), propose: reminders.propose }),
  );

  assert.match(result.speech, /more than one/i);
  assert.match(result.speech, /call the dentist/);
  assert.match(result.speech, /call the plumber/);
});

test("a list failure (e.g. the executor times out) is reported honestly, not thrown", async () => {
  const router = fakeRouter({ completeReturns: "call the dentist" });
  const propose = async (): Promise<{ ok: false; reason: "error"; detail: string }> => ({
    ok: false,
    reason: "error",
    detail: "command timed out",
  });

  const result = await skill.handle({ utterance: "what are my tasks", intent: "list_tasks", sessionId: "s1" }, fakeSkillContext({ router, propose }));

  assert.match(result.speech, /couldn't check your tasks/i);
  assert.match(result.speech, /timed out/);
});

test("an add failure (e.g. the executor times out) is reported honestly, not thrown", async () => {
  const router = fakeRouter({ completeReturns: "call the dentist" });
  const propose = async (): Promise<{ ok: false; reason: "error"; detail: string }> => ({
    ok: false,
    reason: "error",
    detail: "command timed out",
  });

  const result = await skill.handle(
    { utterance: "remind me to call the dentist", intent: "add_task", sessionId: "s1" },
    fakeSkillContext({ router, propose }),
  );

  assert.match(result.speech, /couldn't add that/i);
  assert.match(result.speech, /timed out/);
});
