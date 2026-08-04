/**
 * No real network — `fetchFn` is injected, same convention as
 * `nim.test.ts`. This exercises the shared base `groq.ts`/`mistral.ts`/
 * `openrouter.ts` all build on; each concrete provider gets its own
 * lighter test confirming it wires the right id/baseUrl/model, not a
 * full duplicate of this suite.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { OpenAiCompatibleProvider } from "../providers/openaiCompatible.ts";

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
  const provider = new OpenAiCompatibleProvider({
    id: "test",
    baseUrl: "https://example.invalid/v1",
    apiKey: "k",
    models: { converse: "m" },
    costTier: "free-remote",
    fetchFn: async () => sseResponse(body),
  });

  assert.equal(await drain(provider.chat(REQ)), "Hello");
});

test("an error embedded in an HTTP-200 SSE stream is a ProviderUnavailableError, not silently swallowed", async () => {
  const body = 'data: {"error":{"message":"rate limited upstream"}}\n\ndata: [DONE]\n\n';
  const provider = new OpenAiCompatibleProvider({
    id: "test",
    baseUrl: "https://example.invalid/v1",
    apiKey: "k",
    models: { converse: "m" },
    costTier: "free-remote",
    fetchFn: async () => sseResponse(body),
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("HTTP 429 maps to ProviderUnavailableError", async () => {
  const provider = new OpenAiCompatibleProvider({
    id: "test",
    baseUrl: "https://example.invalid/v1",
    apiKey: "k",
    models: { converse: "m" },
    costTier: "free-remote",
    fetchFn: async () => sseResponse("", 429),
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("client-side bucket exhaustion refuses before any request is sent", async () => {
  let fetchCalls = 0;
  const provider = new OpenAiCompatibleProvider(
    {
      id: "test",
      baseUrl: "https://example.invalid/v1",
      apiKey: "k",
      models: { converse: "m" },
      costTier: "free-remote",
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
  const provider = new OpenAiCompatibleProvider({
    id: "test",
    baseUrl: "https://example.invalid/v1",
    apiKey: "k",
    models: { reason: "m" }, // not converse
    costTier: "free-remote",
    fetchFn: async () => {
      called = true;
      return sseResponse("");
    },
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
  assert.equal(called, false);
});

test("sends extraHeaders and Bearer auth", async () => {
  let seenHeaders: Record<string, string> | undefined;
  const provider = new OpenAiCompatibleProvider({
    id: "test",
    baseUrl: "https://example.invalid/v1",
    apiKey: "the-key",
    models: { converse: "m" },
    costTier: "free-remote",
    extraHeaders: { "X-Title": "JARVIS" },
    fetchFn: async (_url, init) => {
      seenHeaders = init?.headers as Record<string, string> | undefined;
      return sseResponse('data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    },
  });

  await drain(provider.chat(REQ));
  const headers = seenHeaders as Record<string, string>;
  assert.equal(headers["Authorization"], "Bearer the-key");
  assert.equal(headers["X-Title"], "JARVIS");
});
