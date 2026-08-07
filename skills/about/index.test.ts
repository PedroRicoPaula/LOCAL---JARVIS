/**
 * skills/about/index.test.ts — docs/SKILLS.md § 7's five cases, as many
 * as apply to a fixed-text, no-capability, single-turn skill:
 *   1. Happy path — covered below.
 *   2. Owner rejects at confirmation — N/A, no ctx.ask().
 *   3. Model returns garbage — N/A, no model call at all (CLAUDE.md § 7:
 *      fixed text, not a completion).
 *   4. Gate rejects a proposal — N/A, no ctx.propose().
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import { skill } from "./index.ts";

test("happy path: speaks a real, non-empty capabilities summary", async () => {
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ conversation });

  const result = await skill.handle({ utterance: "what can you do", intent: "list_capabilities", sessionId: "s1" }, ctx);

  assert.ok(result.speech.length > 0);
  assert.deepEqual(conversation.said, [result.speech]);
  // Never mentions the placeholder skill -- honesty rule (CLAUDE.md § 6),
  // pinned in a test so this can't silently regress if someone tweaks
  // the wording later.
  assert.doesNotMatch(result.speech.toLowerCase(), /wardrobe/);
});
