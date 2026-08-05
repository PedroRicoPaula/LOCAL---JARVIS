import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { indexText } from "../embeddings.ts";
import { appendEvent } from "../events.ts";
import { upsertFact } from "../facts.ts";
import { indexKeywords } from "../keywordSearch.ts";
import { assembleContext } from "../recall.ts";
import { FakeEmbedder, orthogonalVector, ScriptedEmbedder } from "./fakes.ts";

test("recent turns are always included, regardless of the query", async () => {
  const db = openDb(":memory:");
  const embedder = new FakeEmbedder();
  appendEvent(db, { kind: "utterance", actor: "owner", content: "what time is it", sessionId: "s1", ts: 1 });
  appendEvent(db, { kind: "response", actor: "jarvis", content: "it's 5pm", sessionId: "s1", ts: 2 });

  const ctx = await assembleContext(db, embedder, { sessionId: "s1", queryText: "completely unrelated query" });

  assert.equal(ctx.recentTurns.length, 2);
  assert.match(ctx.text, /what time is it/);
  assert.match(ctx.text, /it's 5pm/);
});

test("a semantic match already among the recent turns is not duplicated", async () => {
  const db = openDb(":memory:");
  const embedder = new ScriptedEmbedder(
    new Map([
      ["shared content", orthogonalVector(0)],
      ["query about shared content", orthogonalVector(0)],
    ]),
  );
  const event = appendEvent(db, { kind: "utterance", actor: "owner", content: "shared content", sessionId: "s1" });
  await indexText(db, embedder, event.id, "shared content");

  const ctx = await assembleContext(db, embedder, { sessionId: "s1", queryText: "query about shared content" });

  assert.equal(ctx.recentTurns.length, 1);
  assert.equal(ctx.recallMatches.length, 0);
  assert.equal(ctx.text.match(/shared content/g)?.length, 1);
});

test("a semantic match from a different session is included and not duplicated", async () => {
  const db = openDb(":memory:");
  const embedder = new ScriptedEmbedder(
    new Map([
      ["about resistors", orthogonalVector(0)],
      ["query", orthogonalVector(0)],
    ]),
  );
  const event = appendEvent(db, { kind: "utterance", actor: "owner", content: "about resistors", sessionId: "old-session" });
  await indexText(db, embedder, event.id, "about resistors");

  const ctx = await assembleContext(db, embedder, { sessionId: "current-session", queryText: "query" });

  assert.equal(ctx.recentTurns.length, 0);
  assert.equal(ctx.recallMatches.length, 1);
  assert.equal(ctx.recallMatches[0]?.content, "about resistors");
});

test("a keyword-only match is still surfaced by hybrid recall, even when its embedding is nowhere near the query -- the actual point of adding keyword search", async () => {
  const db = openDb(":memory:");
  // Deliberately orthogonal vectors -- semanticSearch alone would never
  // surface this (cosine distance ~1, well past the default 0.5 floor).
  // Only the literal shared token "R47" should bring it back.
  const embedder = new ScriptedEmbedder(
    new Map([
      ["the resistor is R47", orthogonalVector(0)],
      ["what value is R47", orthogonalVector(1)],
    ]),
  );
  const event = appendEvent(db, { kind: "utterance", actor: "owner", content: "the resistor is R47", sessionId: "old-session" });
  await indexText(db, embedder, event.id, "the resistor is R47");
  indexKeywords(db, event.id, "the resistor is R47");

  const ctx = await assembleContext(db, embedder, { sessionId: "current-session", queryText: "what value is R47" });

  assert.equal(ctx.recallMatches.length, 1);
  assert.equal(ctx.recallMatches[0]?.content, "the resistor is R47");
});

test("keyword matches still come through when the embedder times out -- the two search paths are independent", async () => {
  const db = openDb(":memory:");
  const event = appendEvent(db, { kind: "utterance", actor: "owner", content: "the resistor is R47", sessionId: "old-session" });
  indexKeywords(db, event.id, "the resistor is R47");

  const neverResolvingEmbedder = { embed: () => new Promise<number[][]>(() => {}) };
  const ctx = await assembleContext(db, neverResolvingEmbedder, {
    sessionId: "current-session",
    queryText: "R47",
    semanticTimeoutMs: 30,
  });

  assert.equal(ctx.semanticTimedOut, true);
  assert.equal(ctx.recallMatches.length, 1);
  assert.equal(ctx.recallMatches[0]?.content, "the resistor is R47");
});

test("facts above the confidence floor are included, low-confidence ones are not", async () => {
  const db = openDb(":memory:");
  const embedder = new FakeEmbedder();
  upsertFact(db, { key: "diet.avoids", value: "peanuts", confidence: 0.9 });
  upsertFact(db, { key: "guess.maybe", value: "something", confidence: 0.2 });

  const ctx = await assembleContext(db, embedder, { sessionId: "s1", queryText: "q" });

  assert.equal(ctx.facts.length, 1);
  assert.match(ctx.text, /diet\.avoids: peanuts/);
});

test("assembled context never exceeds maxChars, even with plenty of qualifying content", async () => {
  const db = openDb(":memory:");
  const embedder = new FakeEmbedder();
  for (let i = 0; i < 50; i++) {
    appendEvent(db, {
      kind: "utterance",
      actor: "owner",
      content: `this is turn number ${i} with some extra padding text to take up space`,
      sessionId: "s1",
      ts: i,
    });
  }

  const ctx = await assembleContext(db, embedder, { sessionId: "s1", queryText: "q", recentTurnsLimit: 50, maxChars: 500 });

  assert.ok(ctx.text.length <= 500, `text.length=${ctx.text.length} exceeds cap`);
  assert.equal(ctx.truncated, true);
});

test("under the cap, nothing is marked truncated", async () => {
  const db = openDb(":memory:");
  const embedder = new FakeEmbedder();
  appendEvent(db, { kind: "utterance", actor: "owner", content: "short", sessionId: "s1" });

  const ctx = await assembleContext(db, embedder, { sessionId: "s1", queryText: "q", maxChars: 8000 });

  assert.equal(ctx.truncated, false);
});

test("a slow embedder degrades to empty semantic matches instead of blocking the response -- found live post Phase 5", async () => {
  const db = openDb(":memory:");
  appendEvent(db, { kind: "utterance", actor: "owner", content: "recent turn", sessionId: "s1" });
  upsertFact(db, { key: "diet.avoids", value: "peanuts", confidence: 0.9 });

  const neverResolvingEmbedder = { embed: () => new Promise<number[][]>(() => {}) };

  const start = performance.now();
  const ctx = await assembleContext(db, neverResolvingEmbedder, {
    sessionId: "s1",
    queryText: "q",
    semanticTimeoutMs: 30,
  });
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 500, `took ${elapsed}ms, should have bailed out around 30ms`);
  assert.equal(ctx.semanticTimedOut, true);
  assert.deepEqual(ctx.recallMatches, []);
  // Everything that doesn't need the embedder still comes through.
  assert.equal(ctx.recentTurns.length, 1);
  assert.equal(ctx.facts.length, 1);
});

test("a fast embedder does not report a timeout", async () => {
  const db = openDb(":memory:");
  const ctx = await assembleContext(db, new FakeEmbedder(), { sessionId: "s1", queryText: "q" });
  assert.equal(ctx.semanticTimedOut, false);
});
