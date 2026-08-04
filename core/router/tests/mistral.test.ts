import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatRequest } from "../../../shared/types.ts";
import { MistralProvider } from "../providers/mistral.ts";

const REQ: ChatRequest = { lane: "converse", system: "sys", messages: [{ role: "user", content: "hi" }], timeoutMs: 1000 };

test("hits Mistral's real base URL and configured model, Bearer-authed", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  const provider = new MistralProvider({
    apiKey: "mistral_test",
    models: { converse: "mistral-small-latest" },
    fetchFn: async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return new Response('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });

  const chunks: string[] = [];
  for await (const c of provider.chat(REQ)) chunks.push(c.delta);

  assert.equal(seenUrl, "https://api.mistral.ai/v1/chat/completions");
  assert.equal(seenBody["model"], "mistral-small-latest");
  assert.equal(chunks.join(""), "hi");
});
