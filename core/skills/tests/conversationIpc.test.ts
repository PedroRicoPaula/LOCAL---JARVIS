import assert from "node:assert/strict";
import { test } from "node:test";
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
