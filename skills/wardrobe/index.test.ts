/**
 * skills/wardrobe/index.test.ts — docs/SKILLS.md § 7's five cases, as
 * they apply to a deliberate placeholder skill:
 *   1. Happy path — covered below (the honest "not built" answer IS this
 *      skill's only real behaviour today).
 *   2. Owner rejects at confirmation — N/A, no ctx.ask().
 *   3. Model returns garbage — N/A, no model call at all.
 *   4. Gate rejects a proposal — N/A, no ctx.propose(); the manifest
 *      declares only MEMORY_READ (green, read-only).
 *   5. cancel() mid-interaction — N/A, single-turn and genuinely so
 *      (this skill never calls ctx.ask, unlike the six that wrongly
 *      claimed this — see ADR-065).
 *
 * This file exists because until 2026-08-17 `wardrobe` was the only
 * registered skill with *no test file at all*, and `make check`'s
 * `skills/**\/*.test.ts` glob passes silently for a skill that has none.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import { skill } from "./index.ts";

test("answers honestly that it isn't built, without reading an internal skill id aloud", async () => {
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ conversation });

  const result = await skill.handle(
    { utterance: "what should I wear today", intent: "wardrobe_default", sessionId: "s1" },
    ctx,
  );

  assert.match(result.speech, /isn't something I can do yet|can't do/i);
  // A person asking what to wear should not hear a codebase noun.
  assert.doesNotMatch(result.speech, /\bskill\b.*\bwardrobe\b|wardrobe is not implemented/i);
  assert.equal(conversation.said[0], result.speech);
});

test("answers in European Portuguese when asked in Portuguese", async () => {
  const ctx = fakeSkillContext({ conversation: fakeConversation() });

  const result = await skill.handle(
    { utterance: "o que é que eu visto hoje", intent: "wardrobe_default", sessionId: "s1" },
    ctx,
  );

  assert.match(result.speech, /Escolher roupa/);
  assert.match(result.speech, /câmara/);
  // Brazilian forms must not appear (core/persona.md's language section).
  assert.doesNotMatch(result.speech, /câmera|você/);
});

test("never proposes anything -- a placeholder must not act, and declares only a read capability", async () => {
  let proposed = false;
  const ctx = fakeSkillContext({
    conversation: fakeConversation(),
    propose: async () => {
      proposed = true;
      return { ok: true, result: null };
    },
  });

  await skill.handle({ utterance: "check my outfit", intent: "wardrobe_default", sessionId: "s1" }, ctx);

  assert.equal(proposed, false);
  // MEMORY_READ only: green tier, read-only, nothing that changes state.
  // A placeholder acquiring a write capability would be a real defect.
  assert.deepEqual(skill.manifest.capabilities, ["MEMORY_READ"]);
});

test("never claims the feature is coming -- CLAUDE.md § 6 forbids implying work in progress", async () => {
  const ctx = fakeSkillContext({ conversation: fakeConversation() });
  const result = await skill.handle(
    { utterance: "help me pick an outfit", intent: "wardrobe_default", sessionId: "s1" },
    ctx,
  );

  assert.doesNotMatch(result.speech, /soon|coming|working on|I'll build|em breve|estou a construir/i);
});
