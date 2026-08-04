/**
 * No real network — `fetchFn` injected, same convention as `nim.test.ts`.
 * Covers what's actually different here from the OpenAI-compatible
 * providers: `systemInstruction` instead of a system-role message, the
 * `contents`/`parts` shape, `?key=` query-param auth, and Gemini's own
 * SSE payload (`candidates[].content.parts[].text`, `finishReason`).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { GoogleProvider } from "../providers/google.ts";

const REQ: ChatRequest = {
  lane: "converse",
  system: "You are terse.",
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

test("parses incremental text chunks across multiple SSE events", async () => {
  const body =
    'data: {"candidates":[{"content":{"parts":[{"text":"Hel"}]}}]}\n\n' +
    'data: {"candidates":[{"content":{"parts":[{"text":"lo"}]},"finishReason":"STOP"}]}\n\n';
  const provider = new GoogleProvider({
    apiKey: "k",
    models: { converse: "gemini-flash-latest" },
    fetchFn: async () => sseResponse(body),
  });

  assert.equal(await drain(provider.chat(REQ)), "Hello");
});

test("sends systemInstruction separately from contents, and the key as a query param", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  const provider = new GoogleProvider({
    apiKey: "the-key",
    models: { converse: "gemini-flash-latest" },
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return sseResponse('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n');
    },
  });

  await drain(provider.chat(REQ));

  assert.match(seenUrl, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-flash-latest:streamGenerateContent\?alt=sse&key=the-key$/);
  assert.deepEqual(seenBody["systemInstruction"], { parts: [{ text: "You are terse." }] });
  assert.deepEqual(seenBody["contents"], [{ role: "user", parts: [{ text: "hi" }] }]);
});

test("an error embedded in the SSE stream is a ProviderUnavailableError", async () => {
  const provider = new GoogleProvider({
    apiKey: "k",
    models: { converse: "gemini-flash-latest" },
    fetchFn: async () => sseResponse('data: {"error":{"message":"quota exceeded"}}\n\n'),
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("HTTP 429 maps to ProviderUnavailableError", async () => {
  const provider = new GoogleProvider({
    apiKey: "k",
    models: { converse: "gemini-flash-latest" },
    fetchFn: async () => sseResponse("", 429),
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("no model configured for the lane refuses without calling fetch", async () => {
  let called = false;
  const provider = new GoogleProvider({
    apiKey: "k",
    models: { reason: "gemini-pro-latest" }, // not converse
    fetchFn: async () => {
      called = true;
      return sseResponse("");
    },
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
  assert.equal(called, false);
});

test("assistant-role messages map to Gemini's 'model' role", async () => {
  let seenBody: Record<string, unknown> = {};
  const provider = new GoogleProvider({
    apiKey: "k",
    models: { converse: "gemini-flash-latest" },
    fetchFn: async (_url, init) => {
      seenBody = JSON.parse(String(init?.body));
      return sseResponse('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]},"finishReason":"STOP"}]}\n\n');
    },
  });

  await drain(
    provider.chat({
      ...REQ,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "how are you" },
      ],
    }),
  );

  assert.deepEqual(seenBody["contents"], [
    { role: "user", parts: [{ text: "hi" }] },
    { role: "model", parts: [{ text: "hello" }] },
    { role: "user", parts: [{ text: "how are you" }] },
  ]);
});
