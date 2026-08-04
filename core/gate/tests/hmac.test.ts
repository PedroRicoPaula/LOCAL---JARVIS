import assert from "node:assert/strict";
import { test } from "node:test";
import { sign, verify } from "../hmac.ts";

const KEY = "test-signing-key";

test("a correctly signed execution verifies", () => {
  const signed = sign(KEY, "req-1", "nonce-1", { action: "do_thing" }, 1000);
  assert.equal(verify(KEY, signed), true);
});

test("tampering with the payload after signing fails verification", () => {
  const signed = sign(KEY, "req-1", "nonce-1", { action: "do_thing" }, 1000);
  const tampered = { ...signed, payload: { action: "do_something_else" } };
  assert.equal(verify(KEY, tampered), false);
});

test("tampering with the nonce after signing fails verification", () => {
  const signed = sign(KEY, "req-1", "nonce-1", { action: "do_thing" }, 1000);
  const tampered = { ...signed, nonce: "nonce-2" };
  assert.equal(verify(KEY, tampered), false);
});

test("verifying with the wrong key fails", () => {
  const signed = sign(KEY, "req-1", "nonce-1", { action: "do_thing" }, 1000);
  assert.equal(verify("wrong-key", signed), false);
});

test("signing is deterministic for identical inputs", () => {
  const a = sign(KEY, "req-1", "nonce-1", { x: 1 }, 1000);
  const b = sign(KEY, "req-1", "nonce-1", { x: 1 }, 1000);
  assert.equal(a.signature, b.signature);
});

test("different requestIds produce different signatures for the same payload", () => {
  const a = sign(KEY, "req-1", "nonce-1", { x: 1 }, 1000);
  const b = sign(KEY, "req-2", "nonce-1", { x: 1 }, 1000);
  assert.notEqual(a.signature, b.signature);
});
