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
