/**
 * skills/clipboard/index.test.ts — docs/SKILLS.md § 7's five cases:
 *   1. Happy path — covered (read, write).
 *   2. Owner rejects at confirmation — covered.
 *   3. The model returns garbage (extraction) — covered: NONE falls back
 *      to ctx.ask().
 *   4. A proposal is rejected by the gate — same as case 2 here.
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { skill } from "./index.ts";

test("read_clipboard: proposes SHELL_EXEC, speaks back real content on approval", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: { text: "hello world" } };
    },
  });

  const result = await skill.handle({ utterance: "what's on my clipboard", intent: "read_clipboard", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Your clipboard has: hello world");
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.capability, "SHELL_EXEC");
  assert.deepEqual(proposals[0]?.payload, { action: "read_clipboard" });
});

test("read_clipboard: an empty clipboard is reported plainly, not a guess", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: true, result: { text: "" } }) });

  const result = await skill.handle({ utterance: "read my clipboard", intent: "read_clipboard", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Your clipboard is empty.");
});

test("read_clipboard: a very long clipboard is summarized by length, not read in full", async () => {
  const longText = "x".repeat(1000);
  const ctx = fakeSkillContext({ propose: async () => ({ ok: true, result: { text: longText } }) });

  const result = await skill.handle({ utterance: "read my clipboard", intent: "read_clipboard", sessionId: "s1" }, ctx);

  assert.match(result.speech, /1000 characters/);
  assert.ok(result.speech.length < longText.length);
});

test("read_clipboard: owner rejects, says so plainly", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "rejected" }) });

  const result = await skill.handle({ utterance: "what's on my clipboard", intent: "read_clipboard", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Okay, not reading it out.");
});

test("write_clipboard: extracts the literal text, proposes it verbatim, speaks success", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "buy milk" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: { text: "buy milk" } };
    },
  });

  const result = await skill.handle(
    { utterance: "copy this for me: buy milk", intent: "write_clipboard", sessionId: "s1" },
    ctx,
  );

  assert.equal(result.speech, "Copied.");
  assert.deepEqual(proposals[0]?.payload, { action: "write_clipboard", text: "buy milk" });
  assert.match(proposals[0]?.humanSummary ?? "", /buy milk/);
});

test("write_clipboard: no text extracted falls back to ctx.ask()", async () => {
  const conversation = fakeConversation(["see you at 5"]);
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "NONE" }),
    conversation,
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: { text: "see you at 5" } };
    },
  });

  const result = await skill.handle({ utterance: "copy this for me", intent: "write_clipboard", sessionId: "s1" }, ctx);

  assert.deepEqual(proposals[0]?.payload, { action: "write_clipboard", text: "see you at 5" });
  assert.equal(result.speech, "Copied.");
});

test("write_clipboard: owner rejects, says so with the exact text quoted", async () => {
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "buy milk" }),
    propose: async () => ({ ok: false, reason: "rejected" }),
  });

  const result = await skill.handle(
    { utterance: "copy this for me: buy milk", intent: "write_clipboard", sessionId: "s1" },
    ctx,
  );

  assert.equal(result.speech, 'Okay, not copying "buy milk".');
});

test("write_clipboard: execution failure is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "buy milk" }),
    propose: async () => ({ ok: false, reason: "error", detail: "pbcopy exited with code 1" }),
  });

  const result = await skill.handle(
    { utterance: "copy this for me: buy milk", intent: "write_clipboard", sessionId: "s1" },
    ctx,
  );

  assert.match(result.speech, /couldn't copy/);
});

test("capture_screenshot: proposes SHELL_EXEC, speaks a non-overclaiming success", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: {} };
    },
  });

  const result = await skill.handle({ utterance: "take a screenshot", intent: "capture_screenshot", sessionId: "s1" }, ctx);

  assert.deepEqual(proposals[0]?.payload, { action: "capture_screenshot" });
  assert.equal(proposals[0]?.capability, "SHELL_EXEC");
  assert.match(result.speech, /clipboard/);
});

test("capture_screenshot: owner rejects, says so plainly", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "rejected" }) });

  const result = await skill.handle({ utterance: "take a screenshot", intent: "capture_screenshot", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Okay, not taking a screenshot.");
});

test("capture_screenshot: execution failure is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "error", detail: "timed out" }) });

  const result = await skill.handle({ utterance: "take a screenshot", intent: "capture_screenshot", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't take that screenshot/);
});

test("an unknown intent is refused honestly, never silently no-ops", async () => {
  const ctx = fakeSkillContext({});

  const result = await skill.handle({ utterance: "???", intent: "not_a_real_intent", sessionId: "s1" }, ctx);

  assert.match(result.speech, /not sure/);
});
