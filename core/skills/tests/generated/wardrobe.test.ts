import assert from "node:assert/strict";
import { test } from "node:test";
import { skill } from "../../../../skills/wardrobe/index.ts";

test("happy path: handle() returns speech and calls ctx.say()", async () => {
  const said: string[] = [];
  const result = await skill.handle(
    { utterance: "test", intent: "wardrobe_default", sessionId: "s1" },
    // Minimal fake context -- expand as the skill grows real behavior.
    {
      router: { complete: async () => "", see: async () => { throw new Error("not used"); } },
      memory: undefined as never, // TODO: a real fake Memory once this skill reads/writes it
      camera: { state: "idle", open: async () => { throw new Error("not used"); } },
      propose: async () => ({ ok: false, reason: "rejected" }),
      say: (text: string) => said.push(text),
      ask: async () => "",
      store: { exec: () => {}, get: () => undefined, all: () => [], run: () => {} },
      sessionId: "s1",
      now: () => 0,
      log: { info: () => {}, warn: () => {}, error: () => {} },
    },
  );

  assert.equal(said.length, 1);
  assert.equal(result.speech, said[0]);
});
