import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { Gate } from "../../gate/gate.ts";
import { buildSkillContext } from "../context.ts";
import { fakeConversation } from "./fakes.ts";

const BASE_DEPS = () => ({
  db: new DatabaseSync(":memory:"),
  memory: undefined as never,
  routerRegistry: undefined as never,
  conversation: fakeConversation(),
});

test("without a gate, ctx.propose falls back to an honest stub refusal", async () => {
  const ctx = buildSkillContext(BASE_DEPS(), "some-skill", "s1");

  const outcome = await ctx.propose({ capability: "MEMORY_WRITE", humanSummary: "x", payload: {} });

  assert.equal(outcome.ok, false);
});

test("with a real gate, ctx.propose routes through it, bound to this skill's id", async () => {
  const db = new DatabaseSync(":memory:");
  const gate = new Gate(db, "test-key");
  const ctx = buildSkillContext({ ...BASE_DEPS(), db, gate }, "brief", "s1");

  const outcome = await ctx.propose({ capability: "MEMORY_READ", humanSummary: "x", payload: { y: 1 } });

  assert.deepEqual(outcome, { ok: true, result: { y: 1 } }); // green tier, resolves immediately
  const [audit] = db.prepare("SELECT detail FROM audit_log WHERE event = 'green_auto_run'").all() as { detail: string }[];
  assert.equal(JSON.parse(audit!.detail).skillId, "brief");
});

test("an explicit propose override takes precedence over a given gate", async () => {
  let called = false;
  const ctx = buildSkillContext(
    { ...BASE_DEPS(), propose: async () => { called = true; return { ok: true, result: null }; } },
    "some-skill",
    "s1",
  );

  await ctx.propose({ capability: "MEMORY_WRITE", humanSummary: "x", payload: {} });

  assert.equal(called, true);
});
