/** No real network — `fetchFn` injected, per CLAUDE.md § 3. */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { OllamaProvider } from "../providers/ollama.ts";

const REQ: ChatRequest = {
  lane: "converse",
  system: "sys",
  messages: [{ role: "user", content: "hi" }],
  timeoutMs: 1000,
};

function ndjsonResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

async function drain(iter: AsyncIterable<{ delta: string; done: boolean }>): Promise<string> {
  let out = "";
  for await (const chunk of iter) out += chunk.delta;
  return out;
}

test("parses a normal streamed reply", async () => {
  const body = '{"message":{"content":"Hel"},"done":false}\n{"message":{"content":"lo"},"done":true}\n';
  const provider = new OllamaProvider({
    models: { converse: "m" },
    fetchFn: async () => ndjsonResponse(body),
  });

  assert.equal(await drain(provider.chat(REQ)), "Hello");
});

test("an error line in the NDJSON stream is a ProviderUnavailableError", async () => {
  const body = '{"error":"model not found"}\n';
  const provider = new OllamaProvider({
    models: { converse: "m" },
    fetchFn: async () => ndjsonResponse(body),
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("connection failure (fetch throws) maps to ProviderUnavailableError", async () => {
  const provider = new OllamaProvider({
    models: { converse: "m" },
    fetchFn: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("non-2xx HTTP status maps to ProviderUnavailableError", async () => {
  const provider = new OllamaProvider({
    models: { converse: "m" },
    fetchFn: async () => ndjsonResponse("", 500),
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
});

test("no model configured for the lane refuses without calling fetch", async () => {
  let called = false;
  const provider = new OllamaProvider({
    models: { reason: "m" },
    fetchFn: async () => {
      called = true;
      return ndjsonResponse("");
    },
  });

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);
  assert.equal(called, false);
});

test("embed returns the embeddings array", async () => {
  const provider = new OllamaProvider({
    models: {},
    embedModel: "embed-model",
    fetchFn: async () => new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] })),
  });

  const result = await provider.embed(["hello"]);
  assert.deepEqual(result, [[0.1, 0.2]]);
});
