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

// --- streaming (CLAUDE.md § 7, 2026-08-17) ---------------------------
// This path used to await the entire model response before speaking a
// word. Measured cost before the change (bench/bench_latency.ts, real
// providers): first chunk p50 424ms vs full response p50 2343ms, i.e.
// ~1.9s per turn of avoidable silence on the most common path.

test("each sentence is spoken as it completes, not after the whole reply", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(
    new FakeProvider({ id: "fake", lanes: ["converse"], text: "First part. Second part. Third part." }),
  );

  const spoken: string[] = [];
  const reply = await generalConversationReply(registry, memory, "tell me something", "s1", [], (s) => spoken.push(s));

  assert.equal(reply, "First part. Second part. Third part.");
  assert.deepEqual(spoken, ["First part.", "Second part.", "Third part."]);
  memory.close();
});

test("the spoken sentences reassemble to exactly the returned text -- nothing lost, nothing duplicated", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  const text = "Estou bem, obrigado. Precisas de mais alguma coisa? Diz-me";
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text }));

  const spoken: string[] = [];
  const reply = await generalConversationReply(registry, memory, "como estás", "s1", [], (s) => spoken.push(s));

  assert.equal(spoken.join(" "), reply);
  memory.close();
});

test("a single-sentence reply with no trailing space is still spoken exactly once", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: "Just one sentence." }));

  const spoken: string[] = [];
  await generalConversationReply(registry, memory, "hi there friend", "s1", [], (s) => spoken.push(s));

  assert.deepEqual(spoken, ["Just one sentence."], "must not speak it twice, and must not stay silent");
  memory.close();
});

test("a reply with no sentence punctuation at all is still spoken, not swallowed", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: "no punctuation here" }));

  const spoken: string[] = [];
  const reply = await generalConversationReply(registry, memory, "say something", "s1", [], (s) => spoken.push(s));

  assert.deepEqual(spoken, ["no punctuation here"]);
  assert.equal(reply, "no punctuation here");
  memory.close();
});

test("the empty-reply fallback is spoken too -- an empty stream must not leave the owner in silence", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: "   " }));

  const spoken: string[] = [];
  const reply = await generalConversationReply(registry, memory, "hello there", "s1", [], (s) => spoken.push(s));

  assert.equal(reply, "I'm not sure how to help with that.");
  assert.deepEqual(spoken, ["I'm not sure how to help with that."]);
  memory.close();
});

test("omitting onSentence keeps the old non-speaking shape exactly", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: "One. Two." }));

  const reply = await generalConversationReply(registry, memory, "anything", "s1", []);

  assert.equal(reply, "One. Two.");
  memory.close();
});

// --- mid-stream failure (review finding, 2026-08-17) -----------------
// routeChat deliberately rethrows rather than failing over once it has
// already yielded output, so a provider dying mid-reply is a real path --
// and by then the owner may already have HEARD part of a real answer.

class MidStreamFailProvider {
  readonly id = "failing";
  readonly lanes = ["converse"] as const;
  supports(lane: string): boolean {
    return lane === "converse";
  }
  async *chat(): AsyncGenerator<{ delta: string }> {
    yield { delta: "Here is the first part. " };
    yield { delta: "And the second part. " };
    throw new Error("provider died mid-stream");
  }
}

test("a mid-stream failure keeps what was actually spoken, and says so", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(new MidStreamFailProvider() as never);

  const spoken: string[] = [];
  const reply = await generalConversationReply(registry, memory, "tell me something", "s1", [], (s) => spoken.push(s));

  // The owner heard real content -- it must be in the returned text too,
  // or the transcript and events would show only an error for a turn in
  // which JARVIS genuinely said something.
  assert.match(reply, /Here is the first part/);
  assert.match(reply, /lost the rest/i);
  assert.ok(spoken.some((s) => /Here is the first part/.test(s)));
  assert.ok(spoken.some((s) => /lost the rest/i.test(s)));
  // Everything spoken is accounted for in what gets recorded.
  assert.equal(spoken.join(" ").replace(/\s+/g, " "), reply.replace(/\s+/g, " "));
  memory.close();
});

class ImmediateFailProvider {
  readonly id = "failing-now";
  readonly lanes = ["converse"] as const;
  supports(lane: string): boolean {
    return lane === "converse";
  }
  async *chat(): AsyncGenerator<{ delta: string }> {
    throw new Error("provider died before any output");
  }
}

test("a failure BEFORE anything is spoken still propagates -- the honest error path is unchanged", async () => {
  const memory = new Memory(openDb(":memory:"), new FakeEmbedder());
  const registry = new Registry();
  registry.register(new ImmediateFailProvider() as never);

  const spoken: string[] = [];
  await assert.rejects(
    generalConversationReply(registry, memory, "tell me something", "s1", [], (s) => spoken.push(s)),
  );
  assert.deepEqual(spoken, [], "must not speak an apology for something it never started saying");
  memory.close();
});
