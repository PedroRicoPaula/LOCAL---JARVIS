import assert from "node:assert/strict";
import { test } from "node:test";
import { SentenceAccumulator } from "../sentenceStream.ts";

test("emits a sentence as soon as it completes, not when the stream ends", () => {
  const a = new SentenceAccumulator();
  assert.deepEqual(a.push("Estou "), []);
  assert.deepEqual(a.push("bem"), []);
  // The boundary needs the whitespace *after* the punctuation to be sure
  // the sentence really ended.
  assert.deepEqual(a.push("."), []);
  assert.deepEqual(a.push(" Obrigado"), ["Estou bem."]);
  assert.equal(a.flush(), "Obrigado");
});

test("a single chunk carrying several sentences yields all of them, in order", () => {
  const a = new SentenceAccumulator();
  assert.deepEqual(a.push("One. Two! Three? Four"), ["One.", "Two!", "Three?"]);
  assert.equal(a.flush(), "Four");
});

test("flush returns a final sentence that had no trailing whitespace", () => {
  const a = new SentenceAccumulator();
  assert.deepEqual(a.push("Only one sentence."), []);
  assert.equal(a.flush(), "Only one sentence.");
});

test("nothing is ever lost or duplicated across a whole stream", () => {
  const source = "First sentence here. Second one follows! And a third? Trailing fragment";
  for (const size of [1, 3, 7, 100]) {
    const a = new SentenceAccumulator();
    const out: string[] = [];
    for (let i = 0; i < source.length; i += size) {
      out.push(...a.push(source.slice(i, i + size)));
    }
    const tail = a.flush();
    if (tail) out.push(tail);
    // Every word survives exactly once, in order, regardless of how the
    // stream happened to be chunked.
    assert.equal(out.join(" ").replace(/\s+/g, " "), source.replace(/\s+/g, " "), `chunk size ${size}`);
  }
});

test("flush is idempotent -- calling it twice never repeats the tail", () => {
  const a = new SentenceAccumulator();
  a.push("Half a thought");
  assert.equal(a.flush(), "Half a thought");
  assert.equal(a.flush(), "");
});

test("an empty stream produces nothing at all, never an empty utterance", () => {
  const a = new SentenceAccumulator();
  assert.deepEqual(a.push(""), []);
  assert.equal(a.flush(), "");
});
