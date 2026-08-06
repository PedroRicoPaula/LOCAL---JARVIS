import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import { extractLines, extractOrNull } from "./extract.ts";

test("extractOrNull: returns the model's trimmed text", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "  Cursor  " }) });
  assert.equal(await extractOrNull(ctx, "system", "open cursor"), "Cursor");
});

test("extractOrNull: NONE (any case) means nothing extracted", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "none" }) });
  assert.equal(await extractOrNull(ctx, "system", "hello"), null);
});

test("extractOrNull: empty response means nothing extracted", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "" }) });
  assert.equal(await extractOrNull(ctx, "system", "hello"), null);
});

test("extractOrNull: stripTrailingPunctuation removes a trailing period, off by default", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "buy milk." }) });
  assert.equal(await extractOrNull(ctx, "system", "x"), "buy milk.");
  assert.equal(await extractOrNull(ctx, "system", "x", { stripTrailingPunctuation: true }), "buy milk");
});

test("extractOrNull: catchErrors turns a thrown model call into null instead of propagating", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeThrows: new Error("model down") }) });
  await assert.rejects(() => extractOrNull(ctx, "system", "x"));
  assert.equal(await extractOrNull(ctx, "system", "x", { catchErrors: true }), null);
});

test("extractLines: splits multiple lines, drops empty/NONE lines, cleans each", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "milk.\n\nbread.\nNONE" }) });
  assert.deepEqual(await extractLines(ctx, "system", "x", { stripTrailingPunctuation: true }), ["milk", "bread"]);
});

test("extractLines: a bare NONE response is an empty list, not [\"NONE\"]", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "NONE" }) });
  assert.deepEqual(await extractLines(ctx, "system", "x"), []);
});

test("extractLines: a single item is a one-element list", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "eggs" }) });
  assert.deepEqual(await extractLines(ctx, "system", "x"), ["eggs"]);
});
