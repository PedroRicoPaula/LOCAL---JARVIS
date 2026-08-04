/**
 * No real network — `fetchFn` is injected with a fake that returns a
 * canned SSE stream, per CLAUDE.md § 3. The error-embedded-in-a-200-status
 * SSE stream case is here because it shipped once already, undetected,
 * before `fetchFn` was injectable — see NimProvider's `NimStreamChunk`
 * docstring.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { NimProvider } from "../providers/nim.ts";

const REQ: ChatRequest = {
  lane: "converse",
  system: "sys",
  messages: [{ role: "user", content: "hi" }],
  timeoutMs: 1000,
};

function sseResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

async function drain(iter: AsyncIterable<{ delta: string; done: boolean }>): Promise<string> {
  let out = "";
  for await (const chunk of iter) out += chunk.delta;
  return out;
}

test("parses a normal streamed reply", async () => {
  const body =
    'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n' +
    "data: [DONE]\n\n";
  const provider = new NimProvider({
    apiKey: "k",
    models: { converse: "m" },
    fetchFn: async () => sseResponse(body),
  });

  assert.equal(await drain(provider.chat(REQ)), "Hello");
});

test("an error embedded in an HTTP-200 SSE stream is a ProviderUnavailableError, not silently swallowed", async () => {
  const body = 'data: {"error":{"message":"ResourceExhausted: Worker local total request limit reached (19/16)"}}\n\ndata: [DONE]\n\n';
  const provider = new NimProvider({
    apiKey: "k",
    models: { converse: "m" },
    fetchFn: async () => sseResponse(body),
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("HTTP 429 maps to ProviderUnavailableError", async () => {
  const provider = new NimProvider({
    apiKey: "k",
    models: { converse: "m" },
    fetchFn: async () => sseResponse("", 429),
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("client-side bucket exhaustion refuses before any request is sent", async () => {
  let fetchCalls = 0;
  const provider = new NimProvider(
    {
      apiKey: "k",
      models: { converse: "m" },
      rpm: 1,
      fetchFn: async () => {
        fetchCalls += 1;
        return sseResponse('data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
      },
    },
    () => 0, // frozen clock: no refill between calls
  );

  await drain(provider.chat(REQ));
  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
  assert.equal(fetchCalls, 1);
});

test("no model configured for the lane refuses without calling fetch", async () => {
  let called = false;
  const provider = new NimProvider({
    apiKey: "k",
    models: { reason: "m" }, // not converse
    fetchFn: async () => {
      called = true;
      return sseResponse("");
    },
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
  assert.equal(called, false);
});
