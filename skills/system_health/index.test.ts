/**
 * skills/system_health/index.test.ts — docs/SKILLS.md § 7's five cases,
 * as many as apply to a read-only, no-capability, single-turn skill:
 *   1. Happy path — covered below (real OS call, sane-range assertions).
 *   2. Owner rejects at confirmation — N/A, no ctx.ask().
 *   3. Model returns garbage — N/A, no model call at all.
 *   4. Gate rejects a proposal — N/A, no ctx.propose().
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeSkillContext } from "../../core/skills/tests/fakes.ts";

test("happy path: speaks real CPU/memory/disk numbers", async () => {
  const { skill } = await import("./index.ts");
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ conversation });

  const result = await skill.handle({ utterance: "how's my computer doing", intent: "check_system", sessionId: "s1" }, ctx);

  assert.match(result.speech, /CPU load is \d+ percent/);
  assert.match(result.speech, /memory is at \d+ percent/);
  assert.match(result.speech, /disk has \d+ percent free/);
  assert.deepEqual(conversation.said, [result.speech]);
  assert.ok(result.display, "returns the raw metrics as display data too");
});
