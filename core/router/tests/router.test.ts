import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest, RouterTrace } from "../../../shared/types.ts";
import { AllProvidersFailedError, NoProvidersRegisteredError, routeChat } from "../router.ts";
import { Registry } from "../registry.ts";
import { FakeProvider, unavailable } from "./fakes.ts";

const REQ: ChatRequest = {
  lane: "converse",
  system: "sys",
  messages: [{ role: "user", content: "hi" }],
  timeoutMs: 1000,
};

async function drain(iter: AsyncIterable<{ delta: string; done: boolean }>): Promise<string> {
  let out = "";
  for await (const chunk of iter) out += chunk.delta;
  return out;
}

test("first provider in the chain serves the request", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "primary", lanes: ["converse"], text: "hello" }));
  const traces: RouterTrace[] = [];

  const text = await drain(routeChat(registry, REQ, (t) => traces.push(t)));

  assert.equal(text, "hello");
  assert.equal(traces.length, 1);
  assert.equal(traces[0]?.providerId, "primary");
  assert.equal(traces[0]?.fallbackDepth, 0);
  assert.equal(traces[0]?.ok, true);
});

test("falls through to the next provider when one is unavailable before any chunk", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "primary", lanes: ["converse"], failWith: unavailable("primary") }));
  registry.register(new FakeProvider({ id: "backup", lanes: ["converse"], text: "from backup" }));
  const traces: RouterTrace[] = [];

  const text = await drain(routeChat(registry, REQ, (t) => traces.push(t)));

  assert.equal(text, "from backup");
  assert.equal(traces.length, 2);
  assert.equal(traces[0]?.providerId, "primary");
  assert.equal(traces[0]?.ok, false);
  assert.equal(traces[0]?.fallbackDepth, 0);
  assert.equal(traces[1]?.providerId, "backup");
  assert.equal(traces[1]?.ok, true);
  assert.equal(traces[1]?.fallbackDepth, 1);
});

test("throws AllProvidersFailedError when every provider in the chain fails", async () => {
  const registry = new Registry();
  registry.register(new FakeProvider({ id: "a", lanes: ["converse"], failWith: unavailable("a") }));
  registry.register(new FakeProvider({ id: "b", lanes: ["converse"], failWith: unavailable("b") }));

  await assert.rejects(() => drain(routeChat(registry, REQ)), AllProvidersFailedError);
});

test("throws NoProvidersRegisteredError for a lane nothing is registered on", async () => {
  const registry = new Registry();
  await assert.rejects(() => drain(routeChat(registry, REQ)), NoProvidersRegisteredError);
});

test("a real bug (non-ProviderUnavailableError) propagates immediately, no fallback attempted", async () => {
  const registry = new Registry();
  const primary = new FakeProvider({ id: "primary", lanes: ["converse"], failWith: new TypeError("bug") });
  const backup = new FakeProvider({ id: "backup", lanes: ["converse"], text: "should not be reached" });
  registry.register(primary);
  registry.register(backup);

  await assert.rejects(() => drain(routeChat(registry, REQ)), TypeError);
  assert.equal(backup.callCount, 0);
});

test("does not fall back once a provider has already yielded a chunk", async () => {
  const registry = new Registry();
  const primary = new FakeProvider({
    id: "primary",
    lanes: ["converse"],
    chunks: [{ delta: "partial", done: false }],
    failWith: unavailable("primary"),
    failAfterChunks: 1,
  });
  const backup = new FakeProvider({ id: "backup", lanes: ["converse"], text: "should not be reached" });
  registry.register(primary);
  registry.register(backup);

  await assert.rejects(() => drain(routeChat(registry, REQ)));
  assert.equal(backup.callCount, 0);
});
