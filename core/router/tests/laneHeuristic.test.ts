import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyLaneHeuristically } from "../laneHeuristic.ts";

test("unambiguous reflex phrases, English and PT-PT", () => {
  assert.equal(classifyLaneHeuristically("stop").lane, "reflex");
  assert.equal(classifyLaneHeuristically("what time is it").lane, "reflex");
  assert.equal(classifyLaneHeuristically("para").lane, "reflex");
  assert.equal(classifyLaneHeuristically("que horas são").lane, "reflex");
});

test("see phrases need a real physical thing in front of the owner", () => {
  assert.equal(classifyLaneHeuristically("check my wiring").lane, "see");
  assert.equal(classifyLaneHeuristically("does this shirt go with these trousers").lane, "see");
  assert.equal(classifyLaneHeuristically("lê-me este rótulo").lane, "see");
});

test("act phrases: commands, files, code", () => {
  assert.equal(classifyLaneHeuristically("run the tests").lane, "act");
  assert.equal(classifyLaneHeuristically("commit what we just changed").lane, "act");
  assert.equal(classifyLaneHeuristically("faz commit disto").lane, "act");
});

test("reason phrases: analysis, comparisons, judgment calls", () => {
  assert.equal(classifyLaneHeuristically("should I use SQLite or Postgres").lane, "reason");
  assert.equal(classifyLaneHeuristically("porque é que isto está lento").lane, "reason");
});

test("an ordinary skill-shaped request with no rule match defaults to converse, not a guess", () => {
  const result = classifyLaneHeuristically("add butter to the shopping list");
  assert.equal(result.lane, "converse");
  assert.equal(result.confidence, 0.5);
});

test("confidence is always the same honest, non-overconfident value", () => {
  assert.equal(classifyLaneHeuristically("stop").confidence, 0.5);
  assert.equal(classifyLaneHeuristically("something entirely unmatched").confidence, 0.5);
});
