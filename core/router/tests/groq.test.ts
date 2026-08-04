import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { GroqProvider } from "../providers/groq.ts";

const REQ: ChatRequest = { lane: "converse", system: "sys", messages: [{ role: "user", content: "hi" }], timeoutMs: 1000 };

test("hits Groq's real base URL and configured model, Bearer-authed", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  let seenAuth = "";
  const provider = new GroqProvider({
    apiKey: "gsk_test",
    models: { converse: "llama-3.1-8b-instant" },
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      seenAuth = (init?.headers as Record<string, string>)["Authorization"] ?? "";
      return new Response('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });

  const chunks: string[] = [];
  for await (const c of provider.chat(REQ)) chunks.push(c.delta);

  assert.equal(seenUrl, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(seenBody["model"], "llama-3.1-8b-instant");
  assert.equal(seenAuth, "Bearer gsk_test");
  assert.equal(chunks.join(""), "hi");
});
