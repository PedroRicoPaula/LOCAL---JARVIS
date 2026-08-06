import assert from "node:assert/strict";
import { test } from "node:test";
import { openDb } from "../../memory/db.ts";
import { Memory } from "../../memory/memory.ts";
import { createWriteFactExecutor } from "../memory.ts";

class FakeEmbedder {
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [1, 0, 0]);
  }
}

test("writes a real fact, retrievable afterward -- the gap this executor closes", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const executor = createWriteFactExecutor(memory);

  const outcome = await executor({ kind: "fact", key: "location.city", value: "Ponta Delgada" });

  assert.equal(outcome.ok, true);
  assert.equal(memory.getFact("location.city")?.value, "Ponta Delgada");
  memory.close();
});

test("defaults confidence to 0.9 when not given", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const executor = createWriteFactExecutor(memory);

  await executor({ kind: "fact", key: "diet.avoids", value: "peanuts" });

  assert.equal(memory.getFact("diet.avoids")?.confidence, 0.9);
  memory.close();
});

test("rejects a malformed fact payload without touching memory", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const executor = createWriteFactExecutor(memory);

  const outcome = await executor({ kind: "fact", key: "" });

  assert.equal(outcome.ok, false);
  assert.equal(memory.getFact("location.city"), null);
  memory.close();
});

test("writes a real observation, retrievable afterward (Phase 8: skills/look)", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const executor = createWriteFactExecutor(memory);

  const outcome = await executor({
    kind: "observation",
    imagePath: "data/observations/abc123.jpg",
    provider: "nim",
    qualitative: "A red mug on a wooden desk.",
    structured: null,
    confidence: 0.8,
  });

  assert.equal(outcome.ok, true);
  const result = outcome.result as { id: string };
  assert.equal(memory.getObservation(result.id)?.qualitative, "A red mug on a wooden desk.");
  memory.close();
});

test("rejects a malformed observation payload without touching memory", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const executor = createWriteFactExecutor(memory);

  const outcome = await executor({ kind: "observation", imagePath: "" });

  assert.equal(outcome.ok, false);
  memory.close();
});

test("rejects an unknown kind", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const executor = createWriteFactExecutor(memory);

  const outcome = await executor({ kind: "something_else" });

  assert.equal(outcome.ok, false);
  memory.close();
});
