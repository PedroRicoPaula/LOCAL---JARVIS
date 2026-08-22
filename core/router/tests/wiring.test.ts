/**
 * core/router/tests/wiring.test.ts — guards how providers are registered,
 * not what they do (each provider has its own test file for that).
 *
 * Added 2026-08-22 after a real defect: `wiring.ts` built a *separate*
 * provider instance per lane for each API key. Each instance constructs
 * its own `TokenBucket` and `ConcurrencyLimiter`, so one account key got
 * two independent budgets. Measured against the real `GroqProvider`
 * before the fix: 25 + 25 = 50 requests before throttling, against the
 * 25 rpm ADR-031 documents as the conservative default. Free-tier limits
 * are per account, not per lane.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { GroqProvider } from "../providers/groq.ts";
import { Registry } from "../registry.ts";

test("a provider registered for two lanes shares ONE rate-limit budget", () => {
  const provider = new GroqProvider({ apiKey: "k", models: { converse: "m", reason: "m" } });
  const registry = new Registry();
  registry.register(provider, ["converse", "reason"]);

  // The same object must serve both lanes -- two instances would mean two
  // buckets, which is exactly the defect this file exists for.
  assert.equal(registry.chainFor("converse")[0], registry.chainFor("reason")[0]);
});

test("two instances built from one key really do get independent budgets -- why the above matters", () => {
  // The failure mode, demonstrated rather than asserted about: this is
  // what wiring.ts used to do.
  const a = new GroqProvider({ apiKey: "k", models: { converse: "m" } });
  const b = new GroqProvider({ apiKey: "k", models: { reason: "m" } });
  const bucket = (p: GroqProvider) => (p as unknown as { bucket: { tryTake(): boolean } }).bucket;

  assert.notEqual(bucket(a), bucket(b), "separate instances -> separate buckets");

  let allowed = 0;
  while (bucket(a).tryTake()) allowed++;
  while (bucket(b).tryTake()) allowed++;
  assert.ok(allowed > 25, `two instances allowed ${allowed} requests on a 25 rpm key`);
});

test("wiring constructs at most one instance per API key", async () => {
  // Guards the shape, because the runtime consequence is invisible until
  // the real account starts returning 429.
  const src = await readFile(new URL("../wiring.ts", import.meta.url), "utf8");
  for (const provider of ["GroqProvider", "MistralProvider", "GoogleProvider", "OpenRouterProvider"]) {
    const constructions = src.split(`new ${provider}(`).length - 1;
    assert.equal(constructions, 1, `${provider} constructed ${constructions}x -- want one per key, registered for both lanes`);
  }
});
