/**
 * No real network — `fetchFn` is injected with a fake that returns a
 * canned SSE stream, per CLAUDE.md § 3. The error-embedded-in-a-200-status
 * SSE stream case is here because it shipped once already, undetected,
 * before `fetchFn` was injectable — see NimProvider's `NimStreamChunk`
 * docstring.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ChatRequest, VisionRequest } from "../../../shared/types.ts";
import { ProviderUnavailableError } from "../provider.ts";
import { NimProvider } from "../providers/nim.ts";

const REQ: ChatRequest = {
  lane: "converse",
  system: "sys",
  messages: [{ role: "user", content: "hi" }],
  timeoutMs: 1000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** `vision()` reads `req.imagePath` off the real filesystem (not
 * injectable, same as `ollama.ts`'s own vision()) -- a real temp file,
 * per CLAUDE.md § 3's "real component when a fake can't stand in." */
async function withTempImage(fn: (imagePath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-nim-vision-test-"));
  const imagePath = join(dir, "frame.jpg");
  await writeFile(imagePath, "fake-jpeg-bytes");
  try {
    await fn(imagePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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

test("refuses once maxConcurrent requests are in flight, then accepts again after one completes", async () => {
  // Two overlapping in-flight requests via a fetchFn that doesn't resolve
  // until we release it, so we can observe the limiter mid-flight.
  const releasers: (() => void)[] = [];
  const provider = new NimProvider({
    apiKey: "k",
    models: { converse: "m" },
    maxConcurrent: 1,
    fetchFn: () =>
      new Promise<Response>((resolve) => {
        releasers.push(() =>
          resolve(sseResponse('data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')),
        );
      }),
  });

  const first = drain(provider.chat(REQ)); // holds the one concurrency slot

  await assert.rejects(() => drain(provider.chat(REQ)), ProviderUnavailableError);

  releasers[0]!();
  await first; // slot freed once the first call completes

  const third = drain(provider.chat(REQ));
  releasers[1]!();
  await third; // slot available again
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

// --- vision() -----------------------------------------------------------

test("vision() sends the image as a base64 data URL and returns the reply as qualitative", async () => {
  await withTempImage(async (imagePath) => {
    let capturedBody: Record<string, unknown> | undefined;
    const provider = new NimProvider({
      apiKey: "k",
      models: {},
      visionModel: "meta/llama-3.2-11b-vision-instruct",
      fetchFn: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return jsonResponse({ choices: [{ message: { content: "A red mug on a desk." } }] });
      },
    });
    const req: VisionRequest = { imagePath, prompt: "What is this?", timeoutMs: 5000 };

    const result = await provider.vision!(req);

    assert.equal(result.qualitative, "A red mug on a desk.");
    assert.equal(result.structured, null);
    assert.equal(result.confidence, 0.5);
    assert.equal(capturedBody?.["model"], "meta/llama-3.2-11b-vision-instruct");
    const messages = capturedBody?.["messages"] as { content: { type: string; text?: string; image_url?: { url: string } }[] }[];
    const content = messages[0]!.content;
    assert.equal(content[0]!.type, "text");
    assert.equal(content[0]!.text, "What is this?");
    assert.equal(content[1]!.type, "image_url");
    assert.ok(content[1]!.image_url!.url.startsWith("data:image/jpeg;base64,"));
  });
});

test("vision() with no visionModel configured refuses without calling fetch", async () => {
  await withTempImage(async (imagePath) => {
    let called = false;
    const provider = new NimProvider({
      apiKey: "k",
      models: {},
      fetchFn: async () => {
        called = true;
        return jsonResponse({});
      },
    });
    const req: VisionRequest = { imagePath, prompt: "What is this?", timeoutMs: 5000 };

    await assert.rejects(() => provider.vision!(req), ProviderUnavailableError);
    assert.equal(called, false);
  });
});

test("vision() HTTP 429 maps to ProviderUnavailableError", async () => {
  await withTempImage(async (imagePath) => {
    const provider = new NimProvider({
      apiKey: "k",
      models: {},
      visionModel: "meta/llama-3.2-11b-vision-instruct",
      fetchFn: async () => jsonResponse({}, 429),
    });
    const req: VisionRequest = { imagePath, prompt: "What is this?", timeoutMs: 5000 };

    await assert.rejects(() => provider.vision!(req), ProviderUnavailableError);
  });
});

test("vision() non-2xx HTTP status maps to ProviderUnavailableError", async () => {
  await withTempImage(async (imagePath) => {
    const provider = new NimProvider({
      apiKey: "k",
      models: {},
      visionModel: "meta/llama-3.2-11b-vision-instruct",
      fetchFn: async () => jsonResponse({}, 500),
    });
    const req: VisionRequest = { imagePath, prompt: "What is this?", timeoutMs: 5000 };

    await assert.rejects(() => provider.vision!(req), ProviderUnavailableError);
  });
});

// --- rate-limit token accounting (2026-08-17) ------------------------
// The token was taken BEFORE the concurrency check and never refunded,
// so a burst spent real rpm budget on requests that never left the
// process -- exactly the "several skills firing at once" case
// concurrencyLimiter.ts exists for. Repeated bursts eroded the budget
// and caused earlier fallbacks than the real account limit required.

test("a request refused on concurrency does NOT spend a rate-limit token", async () => {
  let started = 0;
  const provider = new NimProvider({
    apiKey: "k",
    models: { converse: "m" },
    maxConcurrent: 1,
    rpm: 5,
    fetchFn: async () => {
      started++;
      // Hold the one concurrency slot open while the second call lands.
      await new Promise((r) => setTimeout(r, 30));
      return sseResponse('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n');
    },
  });

  const first = drain(provider.chat(REQ));
  // Second call: the slot is taken, so it must be refused -- without
  // costing a token.
  await assert.rejects(drain(provider.chat(REQ)), /too many requests in flight/);
  await first;

  // 5 rpm, one real request made, one refused on concurrency. If the
  // refusal had spent a token only 3 would remain; four more must fit.
  for (let i = 0; i < 4; i++) {
    await drain(provider.chat(REQ));
  }
  assert.equal(started, 5, "the concurrency refusal must not have consumed rpm budget");
});
