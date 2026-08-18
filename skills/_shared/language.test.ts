import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLanguage } from "./language.ts";

test("real PT-PT utterances the owner actually says are detected as Portuguese", () => {
  // The exact live miss that prompted this module (2026-08-17).
  assert.equal(detectLanguage("o que consegues fazer?"), "pt");
  assert.equal(detectLanguage("o que é que tu consegues fazer por mim"), "pt");
  assert.equal(detectLanguage("que funcionalidades tens"), "pt");
  assert.equal(detectLanguage("dá-me uma lista das tuas funcionalidades"), "pt");
  assert.equal(detectLanguage("como está o tempo lá fora"), "pt");
  assert.equal(detectLanguage("abre o Spotify por favor"), "pt");
});

test("real English utterances are detected as English", () => {
  assert.equal(detectLanguage("what can you do"), "en");
  assert.equal(detectLanguage("what are you able to do for me"), "en");
  assert.equal(detectLanguage("what's the weather like"), "en");
  assert.equal(detectLanguage("open Spotify please"), "en");
});

test("one incidental Portuguese proper noun does not flip an English sentence", () => {
  // Ponta Delgada / Açores is the real place name this system's own STT
  // vocabulary hint exists for -- it appears inside English sentences.
  assert.equal(detectLanguage("what's the weather in Ponta Delgada"), "en");
  assert.equal(detectLanguage("is it raining in Açores today"), "en");
});

test("ambiguous or empty input defaults to English, never throws", () => {
  assert.equal(detectLanguage(""), "en");
  assert.equal(detectLanguage("   "), "en");
  assert.equal(detectLanguage("Spotify"), "en");
  assert.equal(detectLanguage("12345"), "en");
});
