import assert from "node:assert/strict";
import { test } from "node:test";
import { generalConversationReply } from "../converse.ts";
import { openDb } from "../memory/db.ts";
import { Memory } from "../memory/memory.ts";
import { FakeEmbedder } from "../memory/tests/fakes.ts";
import { FakeProvider } from "../router/tests/fakes.ts";
import { Registry } from "../router/registry.ts";

test("relays the model's reply, grounded through the router's converse lane", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: "Sure, here's the answer." }));

  const reply = await generalConversationReply(registry, memory, "what's the weather like", "s1", ["brief"]);

  assert.equal(reply, "Sure, here's the answer.");
  memory.close();
});

test("an empty model reply degrades to an honest fallback, not silence", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: "   " }));

  const reply = await generalConversationReply(registry, memory, "hello", "s1", []);

  assert.equal(reply, "I'm not sure how to help with that.");
  memory.close();
});

test("passes recalled memory into the system prompt the fake provider receives", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  memory.upsertFact({ key: "diet.avoids", value: "peanuts", confidence: 0.9 });
  const registry = new Registry();
  const provider = new FakeProvider({ id: "fake", lanes: ["converse"], text: "ok" });
  registry.register(provider);

  await generalConversationReply(registry, memory, "what do I avoid eating", "s1", ["brief"]);

  assert.equal(provider.receivedRequests.length, 1);
  assert.match(provider.receivedRequests[0]!.system, /diet\.avoids: peanuts/);
  memory.close();
});

test("tells the model exactly which skills are loaded, so it can't claim capabilities it doesn't have", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  const provider = new FakeProvider({ id: "fake", lanes: ["converse"], text: "ok" });
  registry.register(provider);

  await generalConversationReply(registry, memory, "can you create a skill", "s1", ["brief", "wardrobe"]);

  assert.match(provider.receivedRequests[0]!.system, /Skills actually loaded right now: brief, wardrobe\. Nothing else\./);
  memory.close();
});

test("an empty skill list says so plainly rather than omitting the section", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  const provider = new FakeProvider({ id: "fake", lanes: ["converse"], text: "ok" });
  registry.register(provider);

  await generalConversationReply(registry, memory, "hello", "s1", []);

  assert.match(provider.receivedRequests[0]!.system, /No skills are loaded right now\./);
  memory.close();
});

test("the persona's rule against claiming an unactioned change actually reaches the model -- found live, SOAK 1", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  const provider = new FakeProvider({ id: "fake", lanes: ["converse"], text: "ok" });
  registry.register(provider);

  await generalConversationReply(registry, memory, "delete milk from the shopping list", "s1", ["shopping_list"]);

  assert.match(provider.receivedRequests[0]!.system, /it never mutated anything itself/);
  memory.close();
});
