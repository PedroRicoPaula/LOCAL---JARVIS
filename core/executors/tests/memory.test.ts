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

  const outcome = await executor({ key: "location.city", value: "Ponta Delgada" });

  assert.equal(outcome.ok, true);
  assert.equal(memory.getFact("location.city")?.value, "Ponta Delgada");
  memory.close();
});

test("defaults confidence to 0.9 when not given", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const executor = createWriteFactExecutor(memory);

  await executor({ key: "diet.avoids", value: "peanuts" });

  assert.equal(memory.getFact("diet.avoids")?.confidence, 0.9);
  memory.close();
});

test("rejects a malformed payload without touching memory", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const executor = createWriteFactExecutor(memory);

  const outcome = await executor({ key: "" });

  assert.equal(outcome.ok, false);
  assert.equal(memory.getFact("location.city"), null);
  memory.close();
});
