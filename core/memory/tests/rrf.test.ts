import assert from "node:assert/strict";
import { test } from "node:test";
import { reciprocalRankFusion } from "../rrf.ts";

test("an id ranked first in every list wins the fused ranking", () => {
  const fused = reciprocalRankFusion([
    ["a", "b", "c"],
    ["a", "c", "b"],
  ]);
  assert.equal(fused[0], "a");
});

test("an id present in both lists outranks one present in only one", () => {
  const fused = reciprocalRankFusion([
    ["a", "b"],
    ["b", "c"],
  ]);
  // "b" appears in both (rank 2 + rank 1), "a" and "c" each appear once.
  assert.equal(fused[0], "b");
});

test("an id absent from a list contributes nothing from that list, not a penalty beyond simply not being ranked there", () => {
  const fused = reciprocalRankFusion([["only-here"], []]);
  assert.deepEqual(fused, ["only-here"]);
});

test("empty input degrades to an empty ranking, not a throw", () => {
  assert.deepEqual(reciprocalRankFusion([]), []);
  assert.deepEqual(reciprocalRankFusion([[], []]), []);
});

test("defaults to k=60 when not given explicitly", () => {
  const lists = [
    ["a", "b"],
    ["b", "c"],
  ];
  assert.deepEqual(reciprocalRankFusion(lists), reciprocalRankFusion(lists, 60));
});
