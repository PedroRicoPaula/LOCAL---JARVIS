import assert from "node:assert/strict";
import { test } from "node:test";
import { extractAndRememberFacts, extractFacts } from "../factExtraction.ts";
import { openDb } from "../memory/db.ts";
import { Memory } from "../memory/memory.ts";
import { FakeEmbedder } from "../memory/tests/fakes.ts";
import { Registry } from "../router/registry.ts";
import { FakeProvider } from "../router/tests/fakes.ts";

function registryWith(text: string): Registry {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text }));
  return registry;
}

test("extracts a well-formed fact", async () => {
  const registry = registryWith('{"facts": [{"key": "diet.avoids", "value": "peanuts", "confidence": 0.95}]}');

  const facts = await extractFacts(registry, "I don't eat peanuts, I'm allergic");

  assert.deepEqual(facts, [{ key: "diet.avoids", value: "peanuts", confidence: 0.95 }]);
});

test("an utterance with nothing durable extracts no facts", async () => {
  const registry = registryWith('{"facts": []}');

  const facts = await extractFacts(registry, "what time is it");

  assert.deepEqual(facts, []);
});

test("low-confidence extractions are dropped, never stored shaky", async () => {
  const registry = registryWith('{"facts": [{"key": "guess.maybe", "value": "something", "confidence": 0.3}]}');

  const facts = await extractFacts(registry, "hmm, I guess maybe something");

  assert.deepEqual(facts, []);
});

test("malformed JSON from the model degrades to no facts, not a throw", async () => {
  const registry = registryWith("not json at all");

  await assert.doesNotReject(async () => {
    const facts = await extractFacts(registry, "anything");
    assert.deepEqual(facts, []);
  });
});

test("a model failure degrades to no facts, not a throw", async () => {
  const registry = new Registry();
  registry.register(
    new FakeProvider({ id: "fake", lanes: ["converse"], failWith: new (class extends Error {})("nim down") }),
  );

  const facts = await extractFacts(registry, "anything");
  assert.deepEqual(facts, []);
});

test("a malformed individual fact entry (missing fields) is filtered out, not the whole batch", async () => {
  const registry = registryWith(
    '{"facts": [{"key": "diet.avoids", "value": "peanuts", "confidence": 0.9}, {"key": "bad"}]}',
  );

  const facts = await extractFacts(registry, "I avoid peanuts");

  assert.deepEqual(facts, [{ key: "diet.avoids", value: "peanuts", confidence: 0.9 }]);
});

test("extractAndRememberFacts stores what was extracted, linked to the source event", async () => {
  const registry = registryWith('{"facts": [{"key": "prefs.verbosity", "value": "terse", "confidence": 0.8}]}');
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const event = memory.appendEvent({ kind: "utterance", actor: "owner", content: "keep it terse" });

  const facts = await extractAndRememberFacts(registry, memory, "keep it terse", event.id);

  assert.deepEqual(facts, [{ key: "prefs.verbosity", value: "terse", confidence: 0.8 }]);
  const stored = memory.getFact("prefs.verbosity");
  assert.equal(stored?.value, "terse");
  assert.equal(stored?.sourceEventId, event.id);
  memory.close();
});
