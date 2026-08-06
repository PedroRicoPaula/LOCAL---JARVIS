/**
 * skills/media/index.test.ts — docs/SKILLS.md § 7's cases that apply:
 *   1. Happy path — covered for every intent.
 *   2. Owner rejects at confirmation — covered ("rejected" outcome).
 *   3. The model returns garbage (extraction) — covered: level
 *      extraction NONE falls back to ctx.ask().
 *   4. A proposal is rejected by the gate — same as case 2 here.
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 *
 * `getNowPlaying` is the only fake deps needs -- app selection
 * (`resolveTargetApp`) is pure text matching over the utterance, no OS
 * call, no fake required.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { createMediaSkill } from "./index.ts";

const deps = { getNowPlaying: async () => null };

function proposingCtx(proposals: ProposedAction[], routerReturns = "") {
  return fakeSkillContext({
    router: fakeRouter({ completeReturns: routerReturns }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
}

test("play_music defaults to Spotify -- the owner uses nothing else, 2026-08-06", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "play music", intent: "play_music", sessionId: "s1" }, proposingCtx(proposals));

  assert.equal(result.speech, "Done -- resumed playback.");
  assert.deepEqual(proposals[0]?.payload, { action: "media_control", app: "Spotify", command: "play" });
  assert.match(proposals[0]?.humanSummary ?? "", /\(Spotify\)/);
});

test("pause/next/previous each propose the right command, defaulting to Spotify", async () => {
  const skill = createMediaSkill(deps);
  const cases: [string, string, string][] = [
    ["pause_music", "pause", "Done -- paused playback."],
    ["next_track", "next", "Done -- skipped to the next track."],
    ["previous_track", "previous", "Done -- went back a track."],
  ];
  for (const [intent, command, expectedSpeech] of cases) {
    const proposals: ProposedAction[] = [];
    const result = await skill.handle({ utterance: "x", intent, sessionId: "s1" }, proposingCtx(proposals));
    assert.equal(result.speech, expectedSpeech);
    assert.deepEqual(proposals[0]?.payload, { action: "media_control", app: "Spotify", command });
  }
});

test("an explicit 'apple music' or 'music app' mention switches the target to Music.app", async () => {
  for (const utterance of ["play it in apple music", "use the music app instead", "next song in Apple Music please"]) {
    const proposals: ProposedAction[] = [];
    const skill = createMediaSkill(deps);
    await skill.handle({ utterance, intent: "play_music", sessionId: "s1" }, proposingCtx(proposals));
    const payload = proposals[0]?.payload as { app?: string };
    assert.equal(payload.app, "Music", `expected Music for utterance: ${JSON.stringify(utterance)}`);
  }
});

test("plain 'play some music' does not false-positive to Music.app -- the word alone isn't the app name", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(deps);

  await skill.handle({ utterance: "play some music", intent: "play_music", sessionId: "s1" }, proposingCtx(proposals));

  const payload = proposals[0]?.payload as { app?: string };
  assert.equal(payload.app, "Spotify");
});

test("owner rejects a media command: says so, not a false success", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "rejected" }) });
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "pause", intent: "pause_music", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Okay, didn't pause playback.");
});

test("now_playing reads Spotify by default, no propose involved", async () => {
  let proposeCalled = false;
  let queriedApp: string | null = null;
  const ctx = fakeSkillContext({ propose: async () => { proposeCalled = true; return { ok: true, result: null }; } });
  const skill = createMediaSkill({
    getNowPlaying: async (app) => {
      queriedApp = app;
      return { name: "Song Title", artist: "Some Artist" };
    },
  });

  const result = await skill.handle({ utterance: "what's playing", intent: "now_playing", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Now playing: Song Title by Some Artist.");
  assert.equal(proposeCalled, false);
  assert.equal(queriedApp, "Spotify");
});

test("now_playing reads Music.app when explicitly named", async () => {
  let queriedApp: string | null = null;
  const ctx = fakeSkillContext();
  const skill = createMediaSkill({
    getNowPlaying: async (app) => {
      queriedApp = app;
      return null;
    },
  });

  await skill.handle({ utterance: "what's playing in apple music", intent: "now_playing", sessionId: "s1" }, ctx);

  assert.equal(queriedApp, "Music");
});

test("now_playing when nothing is playing is honest, not a guess", async () => {
  const ctx = fakeSkillContext();
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "what's playing", intent: "now_playing", sessionId: "s1" }, ctx);

  assert.match(result.speech, /nothing seems to be playing/i);
});

test("set_volume extracts an explicit number and proposes it", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(deps);

  const result = await skill.handle(
    { utterance: "set the volume to 35", intent: "set_volume", sessionId: "s1" },
    proposingCtx(proposals, "35"),
  );

  assert.equal(result.speech, "Done -- set volume to 35.");
  assert.deepEqual(proposals[0]?.payload, { action: "set_volume", level: 35 });
});

test("set_volume interprets mute as 0", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "mute", intent: "set_volume", sessionId: "s1" }, proposingCtx(proposals, "0"));

  assert.deepEqual(proposals[0]?.payload, { action: "set_volume", level: 0 });
  assert.equal(result.speech, "Done -- set volume to 0.");
});

test("set_brightness with no extractable level falls back to asking", async () => {
  const proposals: ProposedAction[] = [];
  const conversation = fakeConversation(["60"]);
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "NONE" }),
    conversation,
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "brighten the screen", intent: "set_brightness", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Done -- set brightness to 60.");
  assert.deepEqual(proposals[0]?.payload, { action: "set_brightness", level: 60 });
});

test("set_brightness gives up honestly if the follow-up answer isn't a number either", async () => {
  const conversation = fakeConversation(["I don't know"]);
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "NONE" }), conversation });
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "brighten the screen", intent: "set_brightness", sessionId: "s1" }, ctx);

  assert.match(result.speech, /didn't get a valid/i);
});

test("execution failure (e.g. brightness CLI missing) is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "50" }),
    propose: async () => ({ ok: false, reason: "error", detail: "brightness control needs the \"brightness\" CLI" }),
  });
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "set brightness to 50", intent: "set_brightness", sessionId: "s1" }, ctx);

  assert.match(result.speech, /Couldn't set brightness to 50/);
  assert.match(result.speech, /brightness.*CLI/);
});

test("set_focus_mode: 'turn on do not disturb' proposes enabled true", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(deps);

  const result = await skill.handle(
    { utterance: "turn on do not disturb", intent: "set_focus_mode", sessionId: "s1" },
    proposingCtx(proposals),
  );

  assert.deepEqual(proposals[0]?.payload, { action: "set_focus_mode", enabled: true });
  assert.match(result.speech, /turned Do Not Disturb on/i);
});

test("set_focus_mode: 'turn off do not disturb' proposes enabled false", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(deps);

  const result = await skill.handle(
    { utterance: "turn off do not disturb", intent: "set_focus_mode", sessionId: "s1" },
    proposingCtx(proposals),
  );

  assert.deepEqual(proposals[0]?.payload, { action: "set_focus_mode", enabled: false });
});

test("set_focus_mode: PT-PT 'desativa o não incomodar' resolves to off, not a false positive on 'ativa'", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(deps);

  await skill.handle({ utterance: "desativa o não incomodar", intent: "set_focus_mode", sessionId: "s1" }, proposingCtx(proposals));

  assert.deepEqual(proposals[0]?.payload, { action: "set_focus_mode", enabled: false });
});

test("set_focus_mode: ambiguous phrasing falls back to ctx.ask()", async () => {
  const proposals: ProposedAction[] = [];
  const conversation = fakeConversation(["on"]);
  const ctx = fakeSkillContext({
    conversation,
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "do not disturb", intent: "set_focus_mode", sessionId: "s1" }, ctx);

  assert.deepEqual(proposals[0]?.payload, { action: "set_focus_mode", enabled: true });
  assert.equal(result.speech, "Done -- turned Do Not Disturb on.");
});

test("set_focus_mode: still ambiguous after asking gives up honestly", async () => {
  const conversation = fakeConversation(["sure"]);
  const ctx = fakeSkillContext({ conversation });
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "do not disturb", intent: "set_focus_mode", sessionId: "s1" }, ctx);

  assert.match(result.speech, /didn't catch whether/);
});

test("set_focus_mode: owner rejects, says so plainly", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "rejected" }) });
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "turn on do not disturb", intent: "set_focus_mode", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Okay, didn't turn Do Not Disturb on.");
});

test("set_focus_mode: execution failure (shortcut not set up yet) is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({
    propose: async () => ({ ok: false, reason: "error", detail: "couldn't find the shortcut" }),
  });
  const skill = createMediaSkill(deps);

  const result = await skill.handle({ utterance: "turn on do not disturb", intent: "set_focus_mode", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't find the shortcut/);
});
