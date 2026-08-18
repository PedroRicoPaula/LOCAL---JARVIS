import assert from "node:assert/strict";
import { test } from "node:test";
import { AskCancelledError, isCancelUtterance } from "./cancel.ts";

test("real cancellations, both languages", () => {
  for (const t of ["stop", "Stop.", "cancel", "cancel that", "never mind", "nevermind",
                   "forget it", "no thanks",
                   "para", "Para!", "cancela", "esquece", "esquece isso", "deixa estar",
                   "já não", "não quero", "não interessa"]) {
    assert.equal(isCancelUtterance(t), true, `expected cancel: ${t}`);
  }
});

test("real ANSWERS that merely contain a cancel word are not cancellations", () => {
  // These are the expensive false positives: each is a plausible real
  // answer to a skill's own question, and treating it as a cancellation
  // would throw away what the owner just said.
  for (const t of [
    "stop the timer",
    "cancel my subscription reminder",
    "para de seguir as minhas mãos",   // a real look.stop_gestures utterance
    "parar o Spotify",
    "buy milk",
    "Cursor",
    "call the dentist",
    "esquecer a password do wifi",
    "",
    "   ",
  ]) {
    assert.equal(isCancelUtterance(t), false, `expected NOT cancel: ${t}`);
  }
});

test("accents and punctuation are optional -- real STT writes them, a typed line often doesn't", () => {
  assert.equal(isCancelUtterance("já não"), isCancelUtterance("ja nao"));
  assert.equal(isCancelUtterance("Esquece!"), true);
});

test("AskCancelledError is identifiable by class, so a cancellation is never reported as a failure", () => {
  const err = new AskCancelledError();
  assert.ok(err instanceof AskCancelledError);
  assert.ok(err instanceof Error);
  assert.equal(err.name, "AskCancelledError");
});
