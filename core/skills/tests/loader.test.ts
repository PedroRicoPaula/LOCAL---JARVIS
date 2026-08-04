import assert from "node:assert/strict";
import { test } from "node:test";
import { loadSkill, validateManifest } from "../loader.ts";

const buildCtx = () => ({ memory: undefined as never, store: undefined as never, log: { info() {}, warn() {}, error() {} } });

test("validateManifest accepts a well-formed manifest", () => {
  const result = validateManifest({
    id: "x",
    version: "1.0.0",
    description: "desc",
    intents: [{ id: "i", description: "d", examples: ["a"], lanes: ["converse"] }],
    capabilities: ["MEMORY_READ"],
  });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test("validateManifest rejects a missing description", () => {
  const result = validateManifest({
    id: "x",
    version: "1.0.0",
    intents: [{ id: "i", description: "d", examples: ["a"], lanes: ["converse"] }],
    capabilities: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("description")));
});

test("validateManifest rejects an intent with no examples", () => {
  const result = validateManifest({
    id: "x",
    version: "1.0.0",
    description: "desc",
    intents: [{ id: "i", description: "d", examples: [], lanes: ["converse"] }],
    capabilities: [],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("examples")));
});

test("validateManifest rejects an unknown lane", () => {
  const result = validateManifest({
    id: "x",
    version: "1.0.0",
    description: "desc",
    intents: [{ id: "i", description: "d", examples: ["a"], lanes: ["not-a-real-lane"] }],
    capabilities: [],
  });
  assert.equal(result.ok, false);
});

test("loadSkill loads a valid skill and runs its init()", async () => {
  const result = await loadSkill("./tests/fixtures/goodSkill.ts", buildCtx);
  assert.equal(result.status, "loaded");
  if (result.status === "loaded") {
    assert.equal(result.skill.manifest.id, "fixture_good");
  }
});

test("loadSkill disables (not throws) a skill with an invalid manifest", async () => {
  const result = await loadSkill("./tests/fixtures/badManifestSkill.ts", buildCtx);
  assert.equal(result.status, "disabled");
  if (result.status === "disabled") {
    assert.match(result.error, /invalid manifest/);
  }
});

test("loadSkill disables (not throws) a skill whose init() throws -- docs/SKILLS.md SS1", async () => {
  const result = await loadSkill("./tests/fixtures/throwingInitSkill.ts", buildCtx);
  assert.equal(result.status, "disabled");
  if (result.status === "disabled") {
    assert.match(result.error, /deliberate init failure/);
    // The real skill id, not the module path -- found live: this used to
    // report the file path instead, exactly when knowing "which skill
    // failed" matters most.
    assert.equal(result.id, "fixture_throwing_init");
  }
});

test("loadSkill disables a module with no skill export", async () => {
  const result = await loadSkill("./tests/fixtures/noExportSkill.ts", buildCtx);
  assert.equal(result.status, "disabled");
  if (result.status === "disabled") {
    assert.match(result.error, /no "skill" export/);
  }
});

test("loadSkill disables a module that throws at import time", async () => {
  const result = await loadSkill("./tests/fixtures/throwingImportSkill.ts", buildCtx);
  assert.equal(result.status, "disabled");
  if (result.status === "disabled") {
    assert.match(result.error, /deliberate module-level failure/);
  }
});
