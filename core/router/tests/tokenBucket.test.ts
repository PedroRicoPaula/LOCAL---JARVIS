import assert from "node:assert/strict";
import { test } from "node:test";
import { TokenBucket } from "../tokenBucket.ts";

test("allows up to capacity, then refuses", () => {
  const bucket = new TokenBucket(3, () => 0);
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), false);
});

test("refills proportionally to elapsed time", () => {
  let now = 0;
  const bucket = new TokenBucket(60, () => now); // 1 token/second
  for (let i = 0; i < 60; i++) assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), false);

  now += 1000; // 1s elapsed -> 1 token back
  assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), false);
});

test("never exceeds capacity even after a long idle period", () => {
  let now = 0;
  const bucket = new TokenBucket(10, () => now);
  now += 10 * 60_000; // 10 minutes idle
  for (let i = 0; i < 10; i++) assert.equal(bucket.tryTake(), true);
  assert.equal(bucket.tryTake(), false);
});
