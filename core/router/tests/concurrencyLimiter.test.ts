import assert from "node:assert/strict";
import { test } from "node:test";
import { ConcurrencyLimiter } from "../concurrencyLimiter.ts";

test("allows up to max in flight, then refuses", () => {
  const limiter = new ConcurrencyLimiter(2);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
});

test("release frees a slot for the next acquire", () => {
  const limiter = new ConcurrencyLimiter(1);
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);

  limiter.release();
  assert.equal(limiter.tryAcquire(), true);
});

test("release never goes negative on an extra call", () => {
  const limiter = new ConcurrencyLimiter(1);
  limiter.release();
  limiter.release();
  assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
});
