/** No real network — `fetchFn` injected, per CLAUDE.md § 3. */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { ChatRequest, VisionRequest } from "../../../shared/types.ts";
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

test("embed retries once on a transient failure, then succeeds", async () => {
  let calls = 0;
  const provider = new OllamaProvider({
    models: {},
    embedModel: "embed-model",
    fetchFn: async () => {
      calls += 1;
      if (calls === 1) return new Response(JSON.stringify({ error: "connection reset by peer" }), { status: 400 });
      return new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }));
    },
  });

  const result = await provider.embed(["hello"]);

  assert.deepEqual(result, [[0.1, 0.2]]);
  assert.equal(calls, 2);
});

test("embed fails after two consecutive failures, doesn't retry forever", async () => {
  let calls = 0;
  const provider = new OllamaProvider({
    models: {},
    embedModel: "embed-model",
    fetchFn: async () => {
      calls += 1;
      return new Response("", { status: 400 });
    },
  });

  await assert.rejects(() => provider.embed(["hello"]), ProviderUnavailableError);
  assert.equal(calls, 2);
});

// --- vision() -----------------------------------------------------------

/** `vision()` reads `req.imagePath` off the real filesystem (not
 * injectable) -- a real temp file, per CLAUDE.md § 3's "real component
 * when a fake can't stand in." */
async function withTempImage(fn: (imagePath: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "jarvis-ollama-vision-test-"));
  const imagePath = join(dir, "frame.jpg");
  await writeFile(imagePath, "fake-jpeg-bytes");
  try {
    await fn(imagePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("vision() sends the image as base64 in the images field and returns the reply as qualitative", async () => {
  await withTempImage(async (imagePath) => {
    let capturedBody: Record<string, unknown> | undefined;
    const provider = new OllamaProvider({
      models: {},
      visionModel: "moondream",
      fetchFn: async (_url, init) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ message: { content: "A red mug on a desk." } }));
      },
    });
    const req: VisionRequest = { imagePath, prompt: "What is this?", timeoutMs: 5000 };

    const result = await provider.vision(req);

    assert.equal(result.qualitative, "A red mug on a desk.");
    assert.equal(result.structured, null);
    assert.equal(result.confidence, 0.5);
    assert.equal(capturedBody?.["model"], "moondream");
    const messages = capturedBody?.["messages"] as { content: string; images: string[] }[];
    assert.equal(messages[0]!.content, "What is this?");
    assert.equal(messages[0]!.images[0], Buffer.from("fake-jpeg-bytes").toString("base64"));
  });
});

test("vision() with no visionModel configured refuses without calling fetch", async () => {
  await withTempImage(async (imagePath) => {
    let called = false;
    const provider = new OllamaProvider({
      models: {},
      fetchFn: async () => {
        called = true;
        return new Response("{}");
      },
    });
    const req: VisionRequest = { imagePath, prompt: "What is this?", timeoutMs: 5000 };

    await assert.rejects(() => provider.vision(req), ProviderUnavailableError);
    assert.equal(called, false);
  });
});

test("vision() non-2xx HTTP status maps to ProviderUnavailableError", async () => {
  await withTempImage(async (imagePath) => {
    const provider = new OllamaProvider({
      models: {},
      visionModel: "moondream",
      fetchFn: async () => new Response("{}", { status: 500 }),
    });
    const req: VisionRequest = { imagePath, prompt: "What is this?", timeoutMs: 5000 };

    await assert.rejects(() => provider.vision(req), ProviderUnavailableError);
  });
});
