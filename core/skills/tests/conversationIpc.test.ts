import assert from "node:assert/strict";
import { test } from "node:test";
import { AskCancelledError } from "../conversation/cancel.ts";
import { createIpcConversation } from "../conversation/ipc.ts";

test("say() sends the text to voice", () => {
  const sent: string[] = [];
  const conversation = createIpcConversation((t) => sent.push(t));

  conversation.say("hello there");

  assert.deepEqual(sent, ["hello there"]);
});

test("ask() sends the question, then resolves with the next offered utterance", async () => {
  const sent: string[] = [];
  const conversation = createIpcConversation((t) => sent.push(t));

  const answerPromise = conversation.ask("how many?");
  assert.deepEqual(sent, ["how many?"]);

  const consumed = conversation.offerUtterance("three");
  assert.equal(consumed, true);
  assert.equal(await answerPromise, "three");
});

test("ask() with an empty question sends nothing but still waits for an answer", async () => {
  const sent: string[] = [];
  const conversation = createIpcConversation((t) => sent.push(t));

  const answerPromise = conversation.ask("");
  assert.deepEqual(sent, []);
  conversation.offerUtterance("yes");

  assert.equal(await answerPromise, "yes");
});

test("offerUtterance returns false (not consumed) when nothing is waiting", () => {
  const conversation = createIpcConversation(() => {});
  assert.equal(conversation.offerUtterance("good morning"), false);
});

test("ask() rejects on timeout, and a later utterance is not wrongly consumed by it", async () => {
  const conversation = createIpcConversation(() => {});

  await assert.rejects(() => conversation.ask("q?", { timeoutMs: 5 }), /timed out/);

  // The timed-out ask() must not still be listening.
  assert.equal(conversation.offerUtterance("unrelated later utterance"), false);
});

test("a second ask() before the first resolves replaces it, not queues behind it", async () => {
  const conversation = createIpcConversation(() => {});

  const first = conversation.ask("first?");
  const second = conversation.ask("second?");

  conversation.offerUtterance("answer");
  assert.equal(await second, "answer");

  // The first promise never resolves -- it was abandoned, not fulfilled.
  await assert.doesNotReject(Promise.race([first, new Promise((resolve) => setTimeout(resolve, 20))]));
});

// --- cancellation (2026-08-17) ---------------------------------------
// Before this, offerUtterance resolved the pending ask() with WHATEVER
// came next. So saying "stop" during skills/tasks' own "What's the
// task?" created a real Reminders.app item titled "stop" -- REMINDERS is
// green tier, so nothing prompted the owner to catch it. Same shape in
// skills/launcher (`open -a stop`). This is docs/SKILLS.md § 7's case 5,
// which every affected skill's test file wrongly declared "N/A,
// single-turn" while calling ctx.ask.

test("saying 'stop' while a question is pending cancels it -- it never becomes the answer", async () => {
  const spoken: string[] = [];
  const conversation = createIpcConversation((t) => spoken.push(t));
  const answer = conversation.ask("What's the task?");

  // Still consumed: core/main.ts must not also dispatch it as a fresh
  // utterance.
  assert.equal(conversation.offerUtterance("stop"), true);

  await assert.rejects(answer, (err: unknown) => err instanceof AskCancelledError);
});

test("a PT-PT cancellation cancels the same way", async () => {
  const conversation = createIpcConversation(() => {});
  const answer = conversation.ask("Qual é a tarefa?");
  assert.equal(conversation.offerUtterance("esquece"), true);
  await assert.rejects(answer, (err: unknown) => err instanceof AskCancelledError);
});

test("a real answer that merely contains a cancel word is still the answer", async () => {
  const conversation = createIpcConversation(() => {});
  const answer = conversation.ask("What's the task?");
  conversation.offerUtterance("stop the timer at six");
  assert.equal(await answer, "stop the timer at six");
});

test("after a cancellation nothing is left pending -- the next utterance is a fresh one", async () => {
  const conversation = createIpcConversation(() => {});
  const first = conversation.ask("What's the task?");
  conversation.offerUtterance("cancel");
  await assert.rejects(first, (err: unknown) => err instanceof AskCancelledError);

  assert.equal(conversation.offerUtterance("open Spotify"), false);
});
