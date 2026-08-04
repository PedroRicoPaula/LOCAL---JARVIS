import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { OpenRouterProvider } from "../providers/openrouter.ts";

const REQ: ChatRequest = { lane: "converse", system: "sys", messages: [{ role: "user", content: "hi" }], timeoutMs: 1000 };

test("hits OpenRouter's real base URL, configured model, and sends the X-Title header", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  let seenHeaders: Record<string, string> = {};
  const provider = new OpenRouterProvider({
    apiKey: "sk-or-test",
    models: { converse: "openai/gpt-oss-20b:free" },
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      seenHeaders = init?.headers as Record<string, string>;
      return new Response('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });

  const chunks: string[] = [];
  for await (const c of provider.chat(REQ)) chunks.push(c.delta);

  assert.equal(seenUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(seenBody["model"], "openai/gpt-oss-20b:free");
  assert.equal(seenHeaders["X-Title"], "JARVIS");
  assert.equal(chunks.join(""), "hi");
});
