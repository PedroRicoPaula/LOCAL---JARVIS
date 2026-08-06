import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { extractAndRememberFacts, extractFacts } from "../factExtraction.ts";
import { createWriteFactExecutor } from "../executors/memory.ts";
import { Gate } from "../gate/gate.ts";
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

test("extractAndRememberFacts proposes each fact to the gate -- does not write memory directly", async () => {
  const registry = registryWith('{"facts": [{"key": "prefs.verbosity", "value": "terse", "confidence": 0.8}]}');
  const db = new DatabaseSync(":memory:");
  const gate = new Gate(db, "test-key"); // no executors registered -- proves this alone never writes anything

  const facts = await extractAndRememberFacts(registry, gate, "keep it terse", "event-1");

  assert.deepEqual(facts, [{ key: "prefs.verbosity", value: "terse", confidence: 0.8 }]);
  const [pending] = gate.listPendingRequests();
  assert.equal(pending?.capability, "MEMORY_WRITE");
  assert.equal(pending?.skillId, "fact-extraction");
  assert.match(pending?.humanSummary ?? "", /prefs\.verbosity/);
  assert.deepEqual(pending?.payload, { kind: "fact", key: "prefs.verbosity", value: "terse", confidence: 0.8, sourceEventId: "event-1" });

  // Settle the pending approval's own 5-minute timer before the test ends,
  // or node --test hangs waiting for it -- bit this exact class of bug
  // before, see core/gate/tests/gate.test.ts's own history.
  gate.decide({ requestId: pending!.id, nonce: pending!.nonce, decision: "reject", decidedAt: Date.now() });
});

test("a fact only actually lands in memory once the gate approval is granted -- the real bug this fixes", async () => {
  const registry = registryWith('{"facts": [{"key": "prefs.verbosity", "value": "terse", "confidence": 0.8}]}');
  const db = new DatabaseSync(":memory:");
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const gate = new Gate(db, "test-key", { MEMORY_WRITE: createWriteFactExecutor(memory) });
  // A real event, not a fabricated id -- facts.source_event REFERENCES
  // events(id); a fake id here throws a genuine FOREIGN KEY constraint
  // failure inside the executor (found running this exact test).
  const event = memory.appendEvent({ kind: "utterance", actor: "owner", content: "keep it terse" });

  await extractAndRememberFacts(registry, gate, "keep it terse", event.id);
  assert.equal(memory.getFact("prefs.verbosity"), null, "not written before approval");

  const [pending] = gate.listPendingRequests();
  await gate.decide({ requestId: pending!.id, nonce: pending!.nonce, decision: "approve", decidedAt: Date.now() });

  assert.equal(memory.getFact("prefs.verbosity")?.value, "terse");
  memory.close();
});

test("a rejected fact never reaches memory", async () => {
  const registry = registryWith('{"facts": [{"key": "abilities.musical", "value": "whistle", "confidence": 0.8}]}');
  const db = new DatabaseSync(":memory:");
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const gate = new Gate(db, "test-key", { MEMORY_WRITE: createWriteFactExecutor(memory) });

  await extractAndRememberFacts(registry, gate, "I can whistle", "event-1");
  const [pending] = gate.listPendingRequests();
  await gate.decide({ requestId: pending!.id, nonce: pending!.nonce, decision: "reject", decidedAt: Date.now() });

  assert.equal(memory.getFact("abilities.musical"), null);
  memory.close();
});
