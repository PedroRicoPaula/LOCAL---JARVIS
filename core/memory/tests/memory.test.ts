import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../db.ts";
import { Memory } from "../memory.ts";
import { FakeEmbedder, ScriptedEmbedder, orthogonalVector } from "./fakes.ts";

test("appendEvent + indexEvent -- recall() can find it semantically later", async () => {
  const embedder = new ScriptedEmbedder(
    new Map([
      ["I avoid peanuts", orthogonalVector(0)],
      ["what do I avoid eating", orthogonalVector(0)],
    ]),
  );
  const memory = new Memory(openDb(":memory:"), embedder);

  // The pair production actually runs (ADR-034: core/main.ts appends
  // synchronously and indexes fire-and-forget, so recall never blocks on
  // an embedding call). A `remember()` convenience that did both existed
  // until 2026-08-22 and was only ever called by this test.
  const event = memory.appendEvent({ kind: "utterance", actor: "owner", content: "I avoid peanuts", sessionId: "session-1" });
  await memory.indexEvent(event);

  const ctx = await memory.recall({ sessionId: "session-2", queryText: "what do I avoid eating" });

  assert.equal(ctx.recallMatches.length, 1);
  assert.equal(ctx.recallMatches[0]?.content, "I avoid peanuts");
  memory.close();
});

test("ROADMAP Phase 4 DoD: three facts told across three sessions, all recalled correctly in a fourth", () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());

  // Session 1: owner mentions a dietary restriction.
  const e1 = memory.appendEvent({ kind: "utterance", actor: "owner", content: "I don't eat peanuts", sessionId: "session-1" });
  memory.upsertFact({ key: "diet.avoids", value: "peanuts", confidence: 0.95, sourceEventId: e1.id });

  // Session 2: owner mentions a project detail.
  const e2 = memory.appendEvent({
    kind: "utterance",
    actor: "owner",
    content: "HoqueiManager is built with Next.js",
    sessionId: "session-2",
  });
  memory.upsertFact({ key: "project.hoqueimanager.stack", value: "Next.js", confidence: 0.9, sourceEventId: e2.id });

  // Session 3: owner mentions a preference.
  const e3 = memory.appendEvent({ kind: "utterance", actor: "owner", content: "I prefer terse answers", sessionId: "session-3" });
  memory.upsertFact({ key: "prefs.verbosity", value: "terse", confidence: 0.8, sourceEventId: e3.id });

  // Session 4: nothing said yet this session -- recall must surface all three.
  const ctx0 = memory.factsAboveConfidence();

  assert.equal(ctx0.length, 3);
  const byKey = Object.fromEntries(ctx0.map((f) => [f.key, f.value]));
  assert.deepEqual(byKey, {
    "diet.avoids": "peanuts",
    "project.hoqueimanager.stack": "Next.js",
    "prefs.verbosity": "terse",
  });

  memory.close();
});

test("close() releases the underlying database handle", () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  memory.appendEvent({ kind: "note", actor: "system", content: "x" });
  memory.close();

  assert.throws(() => memory.appendEvent({ kind: "note", actor: "system", content: "y" }));
});
