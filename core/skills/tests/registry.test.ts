/**
 * core/skills/tests/registry.test.ts — `SkillRegistry.loadAll()`'s own
 * aggregation logic (found untested in a code review, 2026-08-06: the
 * pieces it composes -- loadSkill, embedManifestExamples/matchUtterance,
 * dispatch -- are each covered elsewhere, but building the loaded/
 * disabled/health maps themselves never had a fast, offline test, only
 * live wiring or a network-dependent bench script). Real fixture skill
 * modules (`tests/fixtures/*.ts`), a `FakeEmbedder` -- no network, no
 * models (CLAUDE.md § 3).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeEmbedder } from "../../memory/tests/fakes.ts";
import { fakeStore } from "./fakes.ts";
import { SkillRegistry } from "../registry.ts";

const GOOD = "./tests/fixtures/goodSkill.ts";
const GOOD_DUPLICATE_ID = "./tests/fixtures/goodSkillDuplicateId.ts";
const BAD_MANIFEST = "./tests/fixtures/badManifestSkill.ts";

function buildInitCtx() {
  return { memory: undefined as never, store: fakeStore(), log: { info() {}, warn() {}, error() {} } };
}

test("loadAll(): a single valid skill is loaded and reported healthy", async () => {
  const registry = new SkillRegistry();
  const report = await registry.loadAll(buildInitCtx, new FakeEmbedder(), [GOOD]);

  assert.deepEqual(report, { loaded: ["fixture_good"], disabled: [] });
  assert.ok(registry.get("fixture_good"));
  assert.equal(registry.list().length, 1);
  const health = registry.listHealth();
  assert.equal(health.length, 1);
  assert.equal(health[0]?.status, "loaded");
});

test("loadAll(): a valid and an invalid skill are reported separately, one doesn't block the other", async () => {
  const registry = new SkillRegistry();
  const report = await registry.loadAll(buildInitCtx, new FakeEmbedder(), [GOOD, BAD_MANIFEST]);

  assert.deepEqual(report.loaded, ["fixture_good"]);
  assert.equal(report.disabled.length, 1);
  assert.equal(report.disabled[0]?.id, "fixture_bad");
  assert.ok(registry.get("fixture_good"));
  assert.equal(registry.get("fixture_bad"), undefined);
});

test("loadAll(): a duplicate manifest id is disabled, not a silent overwrite", async () => {
  const registry = new SkillRegistry();
  const report = await registry.loadAll(buildInitCtx, new FakeEmbedder(), [GOOD, GOOD_DUPLICATE_ID]);

  // The first one to declare "fixture_good" wins and stays reachable.
  assert.deepEqual(report.loaded, ["fixture_good"]);
  assert.equal(registry.list().length, 1);

  // The second is reported disabled, honestly, not silently dropped.
  assert.equal(report.disabled.length, 1);
  assert.equal(report.disabled[0]?.id, "fixture_good");
  assert.match(report.disabled[0]?.error ?? "", /duplicate skill id/);

  // Both load attempts still show up in health -- the dashboard sees
  // the real duplicate-id problem instead of one attempt vanishing.
  const health = registry.listHealth();
  assert.equal(health.length, 2);
  assert.equal(health.filter((h) => h.status === "loaded").length, 1);
  assert.equal(health.filter((h) => h.status === "disabled").length, 1);
});

test("loadAll() called a second time replaces the first, not accumulates", async () => {
  const registry = new SkillRegistry();
  await registry.loadAll(buildInitCtx, new FakeEmbedder(), [GOOD]);
  assert.equal(registry.list().length, 1);

  const report = await registry.loadAll(buildInitCtx, new FakeEmbedder(), [BAD_MANIFEST]);

  assert.deepEqual(report, { loaded: [], disabled: [{ id: "fixture_bad", error: report.disabled[0]?.error ?? "" }] });
  // The skill from the first loadAll() call is gone, not still reachable.
  assert.equal(registry.get("fixture_good"), undefined);
  assert.equal(registry.list().length, 0);
});

test("dispatch() delegates to the real dispatch pipeline built from loadAll()'s own skills/index", async () => {
  const registry = new SkillRegistry();
  const embedder = new FakeEmbedder();
  await registry.loadAll(buildInitCtx, embedder, [GOOD]);

  const { Registry } = await import("../../router/registry.ts");
  const { FakeProvider } = await import("../../router/tests/fakes.ts");
  const routerRegistry = new Registry();
  routerRegistry.register(new FakeProvider({ id: "fake", lanes: ["converse"], text: '{"lane":"converse"}' }));

  // The exact text of one of fixture_good's own manifest examples --
  // FakeEmbedder is a real (if simple) bag-of-words embedder, so this
  // scores a near-perfect match against itself, well clear of
  // DISPATCH_SCORE with no other candidate to disambiguate against.
  const { outcome } = await registry.dispatch(embedder, routerRegistry, "hello", "s1", () => ({
    router: { complete: async () => "", see: async () => { throw new Error("not used"); } },
    memory: undefined as never,
    camera: { state: "idle", async open() { throw new Error("not used"); } },
    propose: async () => ({ ok: false, reason: "rejected" }),
    say: () => {},
    ask: async () => "",
    store: fakeStore(),
    sessionId: "s1",
    now: () => 0,
    log: { info() {}, warn() {}, error() {} },
    mcp: { hasServer: () => false, listTools: () => [] },
  }));

  assert.equal(outcome.outcome, "dispatched");
  if (outcome.outcome === "dispatched") assert.equal(outcome.result.speech, "ok");
});
