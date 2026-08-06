import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyLane, LaneClassificationError } from "../laneClassifier.ts";
import { Registry } from "../registry.ts";
import { FakeProvider } from "./fakes.ts";

test("parses a valid classification", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: '{"lane": "reflex", "confidence": 0.95}' }));

  const result = await classifyLane(registry, "stop");

  assert.equal(result.lane, "reflex");
  assert.equal(result.confidence, 0.95);
});

test("lane is case/whitespace normalized", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: '{"lane": " REASON "}' }));

  const result = await classifyLane(registry, "why is my app slow");

  assert.equal(result.lane, "reason");
});

test("missing confidence defaults to 0.5, not a crash", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: '{"lane": "act"}' }));

  const result = await classifyLane(registry, "fix the bug");

  assert.equal(result.confidence, 0.5);
});

test("invalid JSON raises LaneClassificationError, not a silent guess", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: "not json at all" }));

  await assert.rejects(() => classifyLane(registry, "hello"), LaneClassificationError);
});

test("an unknown lane value raises LaneClassificationError, not a silent guess", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: '{"lane": "banana"}' }));

  await assert.rejects(() => classifyLane(registry, "hello"), LaneClassificationError);
});

test("ADR-040: when the ollama fallback actually answers, its JSON is ignored in favor of the heuristic", async () => {
  const registry = new Registry();
  // A deliberately WRONG answer -- exactly the live-observed failure mode
  // (ADR-028/ADR-040): the weak fallback model answers within budget but
  // wrong. If this test used its JSON, the result would be "see".
  registry.register(new FakeProvider({ id: "ollama", lanes: ["converse"], text: '{"lane": "see", "confidence": 0.9}' }));

  const result = await classifyLane(registry, "add butter to the shopping list");

  // The heuristic has no rule for this utterance -> its safe default.
  assert.equal(result.lane, "converse");
  assert.equal(result.confidence, 0.5);
});

test("ADR-040: the heuristic fires for an unambiguous reflex phrase even from ollama", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "ollama", lanes: ["converse"], text: '{"lane": "converse"}' }));

  const result = await classifyLane(registry, "stop");

  assert.equal(result.lane, "reflex");
});

test("ADR-040: a non-ollama provider's answer is trusted as before, heuristic never consulted", async () => {
  const registry = new Registry();
  // "stop" would hit a reflex rule in the heuristic -- proving this test
  // exercises the real (non-fallback) provider's JSON, not the heuristic.
  registry.register(new FakeProvider({ id: "nim", lanes: ["converse"], text: '{"lane": "converse", "confidence": 0.8}' }));

  const result = await classifyLane(registry, "stop");

  assert.equal(result.lane, "converse");
  assert.equal(result.confidence, 0.8);
});
