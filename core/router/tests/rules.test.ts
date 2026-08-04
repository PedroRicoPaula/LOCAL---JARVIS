import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { RulesProvider } from "../providers/rules.ts";

const provider = new RulesProvider();

async function ask(utterance: string): Promise<string> {
  const req: ChatRequest = {
    lane: "reflex",
    system: "",
    messages: [{ role: "user", content: utterance }],
    timeoutMs: 300,
  };
  let out = "";
  for await (const chunk of provider.chat(req)) out += chunk.delta;
  return out;
}

test("recognizes stop/cancel phrasing", async () => {
  assert.equal(await ask("stop"), "Stopped.");
  assert.equal(await ask("cancel that"), "Stopped.");
  assert.equal(await ask("never mind"), "Stopped.");
});

test("recognizes camera control phrases (DECISIONS.md ADR-001)", async () => {
  assert.equal(await ask("turn on the camera"), "Camera on.");
  assert.equal(await ask("open your eyes"), "Camera on.");
  assert.equal(await ask("close the camera"), "Camera off.");
});

test("what time is it produces an actual time, not a canned string", async () => {
  const reply = await ask("what time is it");
  assert.match(reply, /^It's \d{1,2}:\d{2}\s?[AP]M\.$/);
});

test("an utterance matching no rule still gets an honest, non-empty reply", async () => {
  const reply = await ask("completely unrelated gibberish xyz");
  assert.equal(reply, "Got it.");
});

test("health is always ok — no external dependency", async () => {
  assert.deepEqual(await provider.health(), { ok: true });
});
