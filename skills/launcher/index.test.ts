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
import { createLauncherSkill, friendlyUrlName, isAppNotFoundError, websiteGuessFor } from "./index.ts";

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

  // Spoken: a friendly name, not the raw URL read out loud (found live).
  assert.equal(result.speech, "Opened Github.");
  // Audit log: still the full, exact URL -- only speech changed.
  assert.equal(proposals[0]?.humanSummary, "Open https://github.com");
  assert.deepEqual(proposals[0]?.payload, { action: "open_url", url: "https://github.com" });
});

test("friendlyUrlName strips scheme/www/path, leaving a speakable name", () => {
  assert.equal(friendlyUrlName("https://www.instagram.com/somepath"), "Instagram");
  assert.equal(friendlyUrlName("https://github.com"), "Github");
  assert.equal(friendlyUrlName("http://news.ycombinator.com/news"), "News");
  assert.equal(friendlyUrlName("https://www.bbc.co.uk"), "Bbc");
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

  assert.equal(result.speech, "Opened Example.");
});

// --- app-not-found -> website fallback (2026-08-17) -----------------
// Reproduces a real miss from the owner's own production history:
// "in a new tab, open Instagram." routed to open_app, and
// `open -a INSTAGRAM` dead-ended instead of opening Instagram.

const APP_NOT_FOUND = "Command failed: open -a Instagram\nUnable to find application named 'Instagram'\n";

function fallbackSetup(answer: string) {
  const proposals: ProposedAction[] = [];
  const conversation = fakeConversation([answer]);
  const ctx = fakeSkillContext({
    conversation,
    router: fakeRouter({ completeReturns: "Instagram" }),
    propose: async (action) => {
      proposals.push(action);
      const payload = action.payload as { action: string };
      if (payload.action === "open_app") return { ok: false, reason: "error", detail: APP_NOT_FOUND };
      return { ok: true, result: { url: "https://instagram.com" } };
    },
  });
  return { ctx, proposals, conversation };
}

test("open_app: a name macOS says isn't an installed app offers that name's website, and opens it once confirmed", async () => {
  const { ctx, proposals, conversation } = fallbackSetup("yes");
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle(
    { utterance: "in a new tab, open Instagram.", intent: "open_app", sessionId: "s1" },
    ctx,
  );

  // It asked before navigating -- the security review's own requirement.
  assert.equal(conversation.asked.length, 1);
  assert.match(conversation.asked[0] ?? "", /no app called Instagram/i);
  assert.equal(proposals.length, 2);
  assert.deepEqual(proposals[1]?.payload, { action: "open_url", url: "https://instagram.com" });
  assert.match(result.speech, /Opened Instagram's website/i);
});

test("open_app: the website fallback is NOT opened when the owner says no", async () => {
  const { ctx, proposals, conversation } = fallbackSetup("no");
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open Instagram", intent: "open_app", sessionId: "s1" }, ctx);

  assert.equal(conversation.asked.length, 1);
  assert.equal(proposals.length, 1, "must not propose the URL after a refusal");
  assert.match(result.speech, /didn't open anything/i);
});

test("open_app: an answer that can't be read is treated as no, never as consent", async () => {
  const { ctx, proposals } = fallbackSetup("hmm what");
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open Instagram", intent: "open_app", sessionId: "s1" }, ctx);

  assert.equal(proposals.length, 1, "an unreadable answer must not navigate anywhere");
  assert.match(result.speech, /didn't open anything/i);
});

test("open_app: any OTHER failure is still reported honestly, never silently turned into a website", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "Photoshop" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: false, reason: "error", detail: "The application could not be launched. (-10810)" };
    },
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open Photoshop", intent: "open_app", sessionId: "s1" }, ctx);

  assert.equal(proposals.length, 1, "must not attempt a website fallback for an unrelated failure");
  assert.match(result.speech, /couldn't open Photoshop/i);
});

test("open_project: a missing editor stays an honest error and never becomes a trip to a website", async () => {
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "Jarvis" }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: false, reason: "error", detail: "Unable to find application named 'Cursor'" };
    },
  });
  const skill = createLauncherSkill({ listProjectDirs: () => ["Jarvis"] });

  const result = await skill.handle({ utterance: "open my Jarvis project", intent: "open_project", sessionId: "s1" }, ctx);

  assert.equal(proposals.length, 1, "a path-carrying open must never fall back to a website");
  assert.match(result.speech, /couldn't open Cursor/i);
});

test("open_app: the website fallback failing too is reported as the original app failure, not a second error", async () => {
  const ctx = fakeSkillContext({
    conversation: fakeConversation(["yes"]),
    router: fakeRouter({ completeReturns: "Instagram" }),
    propose: async (action) => {
      const payload = action.payload as { action: string };
      if (payload.action === "open_app") return { ok: false, reason: "error", detail: APP_NOT_FOUND };
      return { ok: false, reason: "error", detail: "no browser" };
    },
  });
  const skill = createLauncherSkill({ listProjectDirs: () => [] });

  const result = await skill.handle({ utterance: "open Instagram", intent: "open_app", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't open Instagram/i);
});

test("websiteGuessFor slugifies a real spoken app name, and refuses one with nothing usable in it", () => {
  assert.equal(websiteGuessFor("Instagram"), "https://instagram.com");
  assert.equal(websiteGuessFor("INSTAGRAM"), "https://instagram.com");
  assert.equal(websiteGuessFor("  You Tube "), "https://youtube.com");
  assert.equal(websiteGuessFor("Notícias"), "https://noticias.com");
  assert.equal(websiteGuessFor("!!!"), null);
  assert.equal(websiteGuessFor(""), null);
});

test("isAppNotFoundError matches only the real macOS not-installed message", () => {
  assert.equal(isAppNotFoundError(APP_NOT_FOUND), true);
  assert.equal(isAppNotFoundError("Unable to find application named 'X'"), true);
  assert.equal(isAppNotFoundError("The application could not be launched. (-10810)"), false);
  assert.equal(isAppNotFoundError(undefined), false);
});
