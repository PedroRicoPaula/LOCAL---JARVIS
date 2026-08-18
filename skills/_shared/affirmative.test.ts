import assert from "node:assert/strict";
import { test } from "node:test";
import { readAffirmative } from "./affirmative.ts";

test("real spoken yes answers, both languages", () => {
  for (const a of ["yes", "Yes.", "yeah", "sure", "ok", "okay please", "go ahead do it",
                   "sim", "Sim!", "claro", "podes", "força", "isso mesmo", "confirmo"]) {
    assert.equal(readAffirmative(a), "yes", `expected yes: ${a}`);
  }
});

test("real spoken no answers, both languages", () => {
  for (const a of ["no", "No.", "nope", "nah", "cancel", "don't", "stop",
                   "não", "Não!", "nao", "cancela", "deixa", "esquece"]) {
    assert.equal(readAffirmative(a), "no", `expected no: ${a}`);
  }
});

test("an unreadable answer is 'unclear', never guessed as yes", () => {
  for (const a of ["", "   ", "hmm", "what", "maybe", "talvez", "o quê", "November"]) {
    assert.equal(readAffirmative(a), "unclear", `expected unclear: ${a}`);
  }
});

test("matching is by word, never substring -- 'November' is not 'no'", () => {
  assert.equal(readAffirmative("November"), "unclear");
  assert.equal(readAffirmative("nothing"), "unclear");
  assert.equal(readAffirmative("nãozinho"), "unclear");
  assert.equal(readAffirmative("okie"), "unclear");
});

test("a negation anywhere wins over an affirmation -- misreading a refusal as consent is the expensive direction", () => {
  assert.equal(readAffirmative("yes, no, cancel that"), "no");
  assert.equal(readAffirmative("sim, não, deixa"), "no");
  assert.equal(readAffirmative("ok no"), "no");
});
