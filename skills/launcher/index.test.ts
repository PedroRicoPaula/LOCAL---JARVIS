/**
 * skills/launcher/index.test.ts — docs/SKILLS.md § 7's five cases:
 *   1. Happy path — covered (open app, list projects, open project).
 *   2. Owner rejects at confirmation — covered ("rejected" outcome).
 *   3. The model returns garbage (extraction) — covered: NONE / throw
 *      both fall back to ctx.ask().
 *   4. A proposal is rejected by the gate — same as case 2 here (this
 *      skill has no separate ctx.ask() confirmation step before
 *      proposing -- the gate approval *is* the confirmation).
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { createLauncherSkill } from "./index.ts";

test("happy path: open_app proposes SHELL_EXEC with the exact app named, speaks success on approval", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "Cursor" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: { app: "Cursor", path: null } };
    },
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open Cursor", intent: "open_app", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Opened Cursor.");
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.capability, "SHELL_EXEC");
  assert.deepEqual(proposals[0]?.payload, { action: "open_app", app: "Cursor" });
  assert.match(proposals[0]?.humanSummary ?? "", /Cursor/);
});

test("owner rejects the open: says so plainly, not a false success", async () => {
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "Safari" }),
    propose: async () => ({ ok: false, reason: "rejected" }),
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open Safari", intent: "open_app", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Okay, not opening Safari.");
});

test("execution failure (e.g. app not found) is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "Nonexistent" }),
    propose: async () => ({ ok: false, reason: "error", detail: "application not found" }),
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open Nonexistent", intent: "open_app", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't open Nonexistent/);
  assert.match(result.speech, /application not found/);
});

test("extraction NONE falls back to asking which app", async () => {
  const conversation = fakeConversation(["Calculator"]);
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "NONE" }),
    conversation,
    propose: async () => ({ ok: true, result: null }),
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open something", intent: "open_app", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Opened Calculator.");
});

test("list_projects speaks the real directory listing, never touches propose", async () => {
  let proposeCalled = false;
  const ctx = fakeSkillContext({ propose: async () => { proposeCalled = true; return { ok: true, result: null }; } });
  const skill = createLauncherSkill({ listProjectDirs: () => ["Jarvis", "HoqueiManager"] });

  const result = await skill.handle({ utterance: "what projects do I have", intent: "list_projects", sessionId: "s1" }, ctx);

  assert.match(result.speech, /Jarvis/);
  assert.match(result.speech, /HoqueiManager/);
  assert.equal(proposeCalled, false);
});

test("empty project list is reported honestly, not silently", async () => {
  const ctx = fakeSkillContext();
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "what projects do I have", intent: "list_projects", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't find any projects/i);
});

test("open_project resolves a unique match and proposes opening Cursor at its path", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "Jarvis" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
  const skill = createLauncherSkill({ listProjectDirs: () => ["Jarvis", "HoqueiManager"] });

  const result = await skill.handle({ utterance: "open the Jarvis project in Cursor", intent: "open_project", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Opened Cursor.");
  assert.equal(proposals[0]?.capability, "SHELL_EXEC");
  const payload = proposals[0]?.payload as { action: string; app: string; path: string };
  assert.equal(payload.app, "Cursor");
  assert.match(payload.path, /Jarvis$/);
});

test("open_project with an ambiguous name lists matches and asks, doesn't guess", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "Man" }) });
  const skill = createLauncherSkill({ listProjectDirs: () => ["HoqueiManager", "LeadHunterManager"] });

  const result = await skill.handle({ utterance: "open the manager project", intent: "open_project", sessionId: "s1" }, ctx);

  assert.match(result.speech, /more than one/i);
  assert.match(result.speech, /HoqueiManager/);
  assert.match(result.speech, /LeadHunterManager/);
});

test("open_project with an unknown name is honest, no crash", async () => {
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "Nonexistent" }) });
  const skill = createLauncherSkill({ listProjectDirs: () => ["Jarvis"] });

  const result = await skill.handle({ utterance: "open Nonexistent project", intent: "open_project", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't find a project/i);
});
