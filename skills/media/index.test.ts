/**
 * skills/media/index.test.ts — docs/SKILLS.md § 7's cases that apply:
 *   1. Happy path — covered for every intent.
 *   2. Owner rejects at confirmation — covered ("rejected" outcome).
 *   3. The model returns garbage (extraction) — covered: level
 *      extraction NONE falls back to ctx.ask().
 *   4. A proposal is rejected by the gate — same as case 2 here.
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 *
 * `detectRunningApp` defaults to `"Music"` in most cases here to keep
 * assertions focused on what each test is actually about; Spotify
 * detection gets its own dedicated cases below.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeConversation, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { ProposedAction } from "../../shared/types.ts";
import { createMediaSkill } from "./index.ts";

const musicOnly = { getNowPlaying: async () => null, detectRunningApp: async () => "Music" as const };

function proposingCtx(proposals: ProposedAction[], routerReturns = "") {
  return fakeSkillContext({
    router: fakeRouter({ completeReturns: routerReturns }),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
}

test("play_music proposes media_control play against whichever app is running", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(musicOnly);

  const result = await skill.handle({ utterance: "play music", intent: "play_music", sessionId: "s1" }, proposingCtx(proposals));

  assert.equal(result.speech, "Done -- resumed playback.");
  assert.deepEqual(proposals[0]?.payload, { action: "media_control", app: "Music", command: "play" });
  assert.match(proposals[0]?.humanSummary ?? "", /\(Music\)/);
});

test("pause/next/previous each propose the right command", async () => {
  const skill = createMediaSkill(musicOnly);
  const cases: [string, string, string][] = [
    ["pause_music", "pause", "Done -- paused playback."],
    ["next_track", "next", "Done -- skipped to the next track."],
    ["previous_track", "previous", "Done -- went back a track."],
  ];
  for (const [intent, command, expectedSpeech] of cases) {
    const proposals: ProposedAction[] = [];
    const result = await skill.handle({ utterance: "x", intent, sessionId: "s1" }, proposingCtx(proposals));
    assert.equal(result.speech, expectedSpeech);
    assert.deepEqual(proposals[0]?.payload, { action: "media_control", app: "Music", command });
  }
});

test("commands target Spotify instead when Spotify is the one actually running -- found via the owner's own request, SOAK 1", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill({ getNowPlaying: async () => null, detectRunningApp: async () => "Spotify" });

  const result = await skill.handle({ utterance: "next song", intent: "next_track", sessionId: "s1" }, proposingCtx(proposals));

  assert.equal(result.speech, "Done -- skipped to the next track.");
  assert.deepEqual(proposals[0]?.payload, { action: "media_control", app: "Spotify", command: "next" });
  assert.match(proposals[0]?.humanSummary ?? "", /\(Spotify\)/);
});

test("owner rejects a media command: says so, not a false success", async () => {
  const ctx = fakeSkillContext({ propose: async () => ({ ok: false, reason: "rejected" }) });
  const skill = createMediaSkill(musicOnly);

  const result = await skill.handle({ utterance: "pause", intent: "pause_music", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Okay, didn't paused playback.");
});

test("now_playing reports the real track from whichever app is running, no propose involved", async () => {
  let proposeCalled = false;
  let queriedApp: string | null = null;
  const ctx = fakeSkillContext({ propose: async () => { proposeCalled = true; return { ok: true, result: null }; } });
  const skill = createMediaSkill({
    getNowPlaying: async (app) => {
      queriedApp = app;
      return { name: "Song Title", artist: "Some Artist" };
    },
    detectRunningApp: async () => "Spotify",
  });

  const result = await skill.handle({ utterance: "what's playing", intent: "now_playing", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Now playing: Song Title by Some Artist.");
  assert.equal(proposeCalled, false);
  assert.equal(queriedApp, "Spotify");
});

test("now_playing when nothing is playing is honest, not a guess", async () => {
  const ctx = fakeSkillContext();
  const skill = createMediaSkill(musicOnly);

  const result = await skill.handle({ utterance: "what's playing", intent: "now_playing", sessionId: "s1" }, ctx);

  assert.match(result.speech, /nothing seems to be playing/i);
});

test("set_volume extracts an explicit number and proposes it", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(musicOnly);

  const result = await skill.handle(
    { utterance: "set the volume to 35", intent: "set_volume", sessionId: "s1" },
    proposingCtx(proposals, "35"),
  );

  assert.equal(result.speech, "Done -- set volume to 35.");
  assert.deepEqual(proposals[0]?.payload, { action: "set_volume", level: 35 });
});

test("set_volume interprets mute as 0", async () => {
  const proposals: ProposedAction[] = [];
  const skill = createMediaSkill(musicOnly);

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
  const skill = createMediaSkill(musicOnly);

  const result = await skill.handle({ utterance: "brighten the screen", intent: "set_brightness", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Done -- set brightness to 60.");
  assert.deepEqual(proposals[0]?.payload, { action: "set_brightness", level: 60 });
});

test("set_brightness gives up honestly if the follow-up answer isn't a number either", async () => {
  const conversation = fakeConversation(["I don't know"]);
  const ctx = fakeSkillContext({ router: fakeRouter({ completeReturns: "NONE" }), conversation });
  const skill = createMediaSkill(musicOnly);

  const result = await skill.handle({ utterance: "brighten the screen", intent: "set_brightness", sessionId: "s1" }, ctx);

  assert.match(result.speech, /didn't get a valid/i);
});

test("execution failure (e.g. brightness CLI missing) is reported, not swallowed", async () => {
  const ctx = fakeSkillContext({
    router: fakeRouter({ completeReturns: "50" }),
    propose: async () => ({ ok: false, reason: "error", detail: "brightness control needs the \"brightness\" CLI" }),
  });
  const skill = createMediaSkill(musicOnly);

  const result = await skill.handle({ utterance: "set brightness to 50", intent: "set_brightness", sessionId: "s1" }, ctx);

  assert.match(result.speech, /Couldn't set brightness to 50/);
  assert.match(result.speech, /brightness.*CLI/);
});
