/**
 * skills/brief/index.test.ts — docs/SKILLS.md § 7's five required cases,
 * as many as actually apply to a MEMORY_READ-only skill with no
 * confirmation loop:
 *   1. Happy path — covered below.
 *   2. Owner rejects at confirmation — N/A, `brief` never calls ctx.ask().
 *   3. Model returns garbage — covered below (router throws/empties).
 *   4. Gate rejects a proposal — N/A, `brief` never calls ctx.propose().
 *   5. cancel() mid-interaction — N/A, `brief` has no multi-turn state and
 *      defines no cancel().
 * Noted explicitly rather than silently skipped — an inapplicable test
 * hidden looks the same as a forgotten one from the outside.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../../core/memory/db.ts";
import { Memory } from "../../core/memory/memory.ts";
import { fakeConversation, fakeRouter } from "../../core/skills/tests/fakes.ts";
import type { SkillContext } from "../../core/skills/types.ts";

class FakeEmbedder {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [1, 0, 0]);
  }
}

function buildCtx(memory: Memory, router: SkillContext["router"], conversation: ReturnType<typeof fakeConversation>): SkillContext {
  return {
    router,
    memory,
    camera: {
      state: "idle",
      async open() {
        throw new Error("not used");
      },
    },
    propose: async () => ({ ok: false, reason: "rejected" }),
    say: conversation.say,
    ask: conversation.ask,
    store: { exec: () => {}, get: () => undefined, all: () => [], run: () => {} },
    sessionId: "s1",
    now: () => 0,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    mcp: { hasServer: () => false, listTools: () => [] },
  };
}

test("happy path: known facts produce a spoken brief drawn from memory", async () => {
  const { skill } = await import("./index.ts");
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  memory.upsertFact({ key: "diet.avoids", value: "peanuts", confidence: 0.9 });
  const router = fakeRouter({ completeReturns: "You avoid peanuts." });
  const conversation = fakeConversation();

  const result = await skill.handle({ utterance: "good morning", intent: "morning_brief", sessionId: "s1" }, buildCtx(memory, router, conversation));

  assert.equal(result.speech, "You avoid peanuts.");
  assert.deepEqual(conversation.said, ["You avoid peanuts."]);
  memory.close();
});

test("empty memory produces an honest 'nothing new' brief, not a fabricated one", async () => {
  const { skill } = await import("./index.ts");
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const router = fakeRouter({ completeReturns: "Nothing new since we last spoke." });
  const conversation = fakeConversation();

  const result = await skill.handle({ utterance: "good morning", intent: "morning_brief", sessionId: "s1" }, buildCtx(memory, router, conversation));

  assert.match(result.speech, /nothing new/i);
  memory.close();
});

test("router failure degrades to the plain template instead of throwing", async () => {
  const { skill } = await import("./index.ts");
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  memory.upsertFact({ key: "diet.avoids", value: "peanuts", confidence: 0.9 });
  const router = fakeRouter({ completeThrows: new Error("nim is down") });
  const conversation = fakeConversation();

  const result = await skill.handle({ utterance: "good morning", intent: "morning_brief", sessionId: "s1" }, buildCtx(memory, router, conversation));

  assert.match(result.speech, /diet\.avoids|avoids/); // falls back to the templated line, not a crash
  memory.close();
});

test("router returning an empty string also degrades to the plain template", async () => {
  const { skill } = await import("./index.ts");
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  memory.upsertFact({ key: "diet.avoids", value: "peanuts", confidence: 0.9 });
  const router = fakeRouter({ completeReturns: "   " });
  const conversation = fakeConversation();

  const result = await skill.handle({ utterance: "good morning", intent: "morning_brief", sessionId: "s1" }, buildCtx(memory, router, conversation));

  assert.match(result.speech, /avoids/);
  memory.close();
});

test("low-confidence facts are not included in the brief", async () => {
  const { skill } = await import("./index.ts");
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  memory.upsertFact({ key: "guess.maybe", value: "something", confidence: 0.2 });
  const router = fakeRouter({ completeReturns: (_l, _s, userText) => userText }); // echo what the skill sent, to inspect it
  const conversation = fakeConversation();

  const result = await skill.handle({ utterance: "good morning", intent: "morning_brief", sessionId: "s1" }, buildCtx(memory, router, conversation));

  assert.doesNotMatch(result.speech, /guess\.maybe|something/);
  memory.close();
});
