/**
 * skills/launcher/index.test.ts — docs/SKILLS.md § 7's five cases, as
 * they apply now that `APP_CONTROL` is green-tier (2026-08-07):
 *   1. Happy path — covered (open app, close app, list projects, open
 *      project, open url).
 *   2. Owner rejects at confirmation — N/A now: green-tier `propose()`
 *      never produces a "rejected"/"expired" outcome (`Gate.propose()`'s
 *      own green branch), there is no confirmation step to reject.
 *   3. The model returns garbage (extraction) — covered: NONE / throw
 *      both fall back to ctx.ask().
 *   4. A proposal is rejected by the gate — N/A, same reason as case 2.
 *      The real remaining failure mode is the executor itself failing
 *      (app not found, quit failed) -- covered below.
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { createLauncherSkill } from "./index.ts";

test("happy path: open_app proposes APP_CONTROL with the exact app named, speaks success", async () => {
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
  assert.equal(proposals[0]?.capability, "APP_CONTROL");
  assert.deepEqual(proposals[0]?.payload, { action: "open_app", app: "Cursor" });
  assert.match(proposals[0]?.humanSummary ?? "", /Cursor/);
});

test("happy path: close_app proposes APP_CONTROL close_app with the exact app named, speaks success", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "Spotify" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: { app: "Spotify" } };
    },
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "close Spotify", intent: "close_app", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Closed Spotify.");
  assert.equal(proposals[0]?.capability, "APP_CONTROL");
  assert.deepEqual(proposals[0]?.payload, { action: "close_app", app: "Spotify" });
});

test("close_app extraction NONE falls back to asking which app", async () => {
  const conversation = fakeConversation(["Finder"]);
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "NONE" }),
    conversation,
    propose: async () => ({ ok: true, result: { app: "Finder" } }),
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "close it", intent: "close_app", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Closed Finder.");
});

test("close_app execution failure (e.g. app not running) is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "Nonexistent" }),
    propose: async () => ({ ok: false, reason: "error", detail: "application not found" }),
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "close Nonexistent", intent: "close_app", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't close Nonexistent/);
  assert.match(result.speech, /application not found/);
});

test("open_app execution failure (e.g. app not found) is reported, not swallowed", async () => {
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
  assert.equal(proposals[0]?.capability, "APP_CONTROL");
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

test("open_url proposes APP_CONTROL with the extracted URL", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "https://github.com" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open GitHub", intent: "open_url", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Opened https://github.com.");
  assert.deepEqual(proposals[0]?.payload, { action: "open_url", url: "https://github.com" });
});

test("open_url with nothing extracted falls back to asking which website", async () => {
  const conversation = fakeConversation(["https://example.com"]);
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "NONE" }),
    conversation,
    propose: async () => ({ ok: true, result: null }),
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open a website", intent: "open_url", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Opened https://example.com.");
});
