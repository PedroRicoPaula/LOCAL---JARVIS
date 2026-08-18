/**
 * skills/about/index.test.ts — docs/SKILLS.md § 7's five cases, as many
 * as apply to a fixed-text, no-capability, single-turn skill:
 *   1. Happy path — covered below.
 *   2. Owner rejects at confirmation — N/A, no ctx.ask().
 *   3. Model returns garbage — N/A, no model call at all (CLAUDE.md § 7:
 *      fixed text, not a completion).
 *   4. Gate rejects a proposal — N/A, no ctx.propose().
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import { skill } from "./index.ts";

test("happy path: speaks a real, non-empty capabilities summary", async () => {
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ conversation });

  const result = await skill.handle({ utterance: "what can you do", intent: "list_capabilities", sessionId: "s1" }, ctx);

  assert.ok(result.speech.length > 0);
  assert.deepEqual(conversation.said, [result.speech]);
  // Never mentions the placeholder skill -- honesty rule (CLAUDE.md § 6),
  // pinned in a test so this can't silently regress if someone tweaks
  // the wording later.
  assert.doesNotMatch(result.speech.toLowerCase(), /wardrobe/);
});

// --- bilingual (2026-08-17) -----------------------------------------
// Found live: "o que consegues fazer?" returned the entire English
// capability list, contradicting ADR-033's bilingual spoken deliverable.

test("asked in Portuguese, answers in European Portuguese -- not English, not Brazilian", async () => {
  const conversation = fakeConversation();
  const ctx = fakeSkillContext({ conversation });

  const result = await skill.handle(
    { utterance: "o que consegues fazer?", intent: "list_capabilities", sessionId: "s1" },
    ctx,
  );

  assert.match(result.speech, /Consigo/, "expected the Portuguese template");
  // European forms, per core/persona.md's own language section.
  assert.match(result.speech, /aplicações/);
  assert.match(result.speech, /câmara/);
  assert.match(result.speech, /área de transferência/);
  // The Brazilian equivalents must not appear.
  assert.doesNotMatch(result.speech, /aplicativos/);
  assert.doesNotMatch(result.speech, /câmera/);
  assert.doesNotMatch(result.speech, /gerenciar/);
  assert.doesNotMatch(result.speech, /\bvocê\b/);
  assert.equal(conversation.said[0], result.speech);
});

test("asked in English, still answers in English", async () => {
  const ctx = fakeSkillContext({ conversation: fakeConversation() });

  const result = await skill.handle(
    { utterance: "what can you do", intent: "list_capabilities", sessionId: "s1" },
    ctx,
  );

  assert.match(result.speech, /I can check the weather/);
});

test("both language templates describe the same capability set", async () => {
  const en = await skill.handle({ utterance: "what can you do", intent: "list_capabilities", sessionId: "s1" }, fakeSkillContext({ conversation: fakeConversation() }));
  const pt = await skill.handle({ utterance: "o que consegues fazer", intent: "list_capabilities", sessionId: "s1" }, fakeSkillContext({ conversation: fakeConversation() }));

  // A cheap structural guard against one being updated and the other
  // silently drifting -- this file's own docstring says update both.
  const topics: [RegExp, RegExp][] = [
    [/weather/i, /tempo/i],
    [/shopping list/i, /lista de compras/i],
    [/camera/i, /câmara/i],
    [/CPU/i, /CPU/i],
  ];
  for (const [enPattern, ptPattern] of topics) {
    assert.match(en.speech, enPattern);
    assert.match(pt.speech, ptPattern);
  }
});

// --- honest capability claims (2026-08-17) ---------------------------
// Found live: the Gmail OAuth refresh token had expired, core booted with
// the server unregistered, and this skill kept telling the owner it could
// "check your Gmail". CLAUDE.md § 6 -- a capability claim is exactly as
// serious as a factual claim.

function ctxWithServers(servers: string[]) {
  return fakeSkillContext({
    conversation: fakeConversation(),
    mcp: { hasServer: (id: string) => servers.includes(id), listTools: () => [] },
  });
}

test("an MCP capability is only claimed when its server is actually registered", async () => {
  const result = await skill.handle(
    { utterance: "what can you do", intent: "list_capabilities", sessionId: "s1" },
    ctxWithServers([]),
  );

  assert.doesNotMatch(result.speech, /Gmail/i, "must not claim Gmail with no server registered");
  assert.doesNotMatch(result.speech, /GitHub/i);
  // The always-real capabilities are still there.
  assert.match(result.speech, /weather/i);
  assert.match(result.speech, /clipboard/i);
});

test("a registered MCP server IS claimed, in the language asked", async () => {
  const en = await skill.handle(
    { utterance: "what can you do", intent: "list_capabilities", sessionId: "s1" },
    ctxWithServers(["gmail"]),
  );
  assert.match(en.speech, /check your Gmail/i);
  assert.doesNotMatch(en.speech, /GitHub/i);

  const pt = await skill.handle(
    { utterance: "o que consegues fazer", intent: "list_capabilities", sessionId: "s1" },
    ctxWithServers(["gmail", "github"]),
  );
  assert.match(pt.speech, /ver o teu Gmail/i);
  assert.match(pt.speech, /repositórios do GitHub/i);
});

test("the sentence stays grammatical whether zero, one or two servers are up", async () => {
  for (const servers of [[], ["gmail"], ["gmail", "github"]]) {
    for (const utterance of ["what can you do", "o que consegues fazer"]) {
      const r = await skill.handle({ utterance, intent: "list_capabilities", sessionId: "s1" }, ctxWithServers(servers));
      assert.match(r.speech, /\.$/, `should end in a period: ${r.speech}`);
      assert.doesNotMatch(r.speech, /,\s*,|\band and\b|\be e\b/, `malformed list: ${r.speech}`);
    }
  }
});
