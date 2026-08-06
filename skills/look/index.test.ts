/**
 * skills/look/index.test.ts — docs/SKILLS.md § 7's cases that apply:
 *   1. Happy path (describe) — covered.
 *   2. Owner rejects at confirmation — N/A directly (describe never
 *      blocks on approval, SPEC.md § 6); the analogous case here is "a
 *      gate rejection doesn't change the already-spoken answer" —
 *      covered.
 *   3. The model returns garbage / fails — covered (vision throws,
 *      capture throws, camera open throws all degrade honestly).
 *   4. A proposal is rejected by the gate — covered (same test as #2).
 *   5. cancel() mid-interaction — N/A, single-turn, no cancel().
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeCamera, fakeConversation, fakeRouter, fakeSkillContext } from "../../core/skills/tests/fakes.ts";
import type { Frame, ProposedAction } from "../../shared/types.ts";
import { createLookSkill } from "./index.ts";

const FRAME: Frame = { path: "/fake/frames/session/frame.jpg", capturedAt: 0, sessionId: "fake-session", retained: false };
const DURABLE_PATH = "/fake/observations/abc.jpg";

function fakeDeps(copyFrameForObservation = async (_framePath: string): Promise<string> => DURABLE_PATH) {
  return { copyFrameForObservation };
}

// --- describe -------------------------------------------------------------

test("describe: happy path speaks the qualitative description and proposes an observation", async () => {
  const camera = fakeCamera([FRAME]);
  const router = fakeRouter({
    seeReturns: { qualitative: "A red mug on a wooden desk.", structured: null, confidence: 0.8 },
    seeProvider: "nim",
  });
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    camera,
    router,
    conversation: fakeConversation(),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "what is this", intent: "describe", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "A red mug on a wooden desk.");
  await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget propose() settle
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0]?.capability, "MEMORY_WRITE");
  assert.deepEqual(proposals[0]?.payload, {
    kind: "observation",
    imagePath: DURABLE_PATH,
    provider: "nim",
    qualitative: "A red mug on a wooden desk.",
    structured: null,
    confidence: 0.8,
  });
});

test("describe: a gate rejection of the observation doesn't change the already-spoken answer", async () => {
  const camera = fakeCamera([FRAME]);
  const router = fakeRouter({ seeReturns: { qualitative: "A laptop.", structured: null, confidence: 0.7 } });
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    camera,
    router,
    conversation: fakeConversation(),
    propose: async (action) => {
      proposals.push(action);
      return { ok: false, reason: "rejected" };
    },
  });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "what is this", intent: "describe", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "A laptop.");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(proposals.length, 1);
});

test("describe: the vision call fails -- honest fallback, does not throw, nothing proposed", async () => {
  const camera = fakeCamera([FRAME]);
  const router = fakeRouter({ seeThrows: new Error("provider unavailable") });
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    camera,
    router,
    conversation: fakeConversation(),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "what is this", intent: "describe", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't get a good look/i);
  assert.equal(proposals.length, 0);
});

test("describe: capture fails -- honest fallback, does not throw", async () => {
  const camera = fakeCamera([]); // no scripted frames -- capture() throws
  const ctx = fakeSkillContext({ camera, conversation: fakeConversation() });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "what is this", intent: "describe", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't get a picture/i);
});

test("describe: durable copy fails -- still describes from the ephemeral frame, nothing proposed", async () => {
  const camera = fakeCamera([FRAME]);
  const seenImagePaths: string[] = [];
  const router = {
    async complete(): Promise<string> {
      throw new Error("not used by this test");
    },
    async see(req: { imagePath: string }) {
      seenImagePaths.push(req.imagePath);
      return { qualitative: "A plant.", structured: null, confidence: 0.6, provider: "fake" };
    },
  };
  const proposals: ProposedAction[] = [];
  const ctx = fakeSkillContext({
    camera,
    router,
    conversation: fakeConversation(),
    propose: async (action) => {
      proposals.push(action);
      return { ok: true, result: null };
    },
  });
  const skill = createLookSkill(
    fakeDeps(async () => {
      throw new Error("disk full");
    }),
  );

  const result = await skill.handle({ utterance: "what is this", intent: "describe", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "A plant.");
  assert.deepEqual(seenImagePaths, [FRAME.path]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(proposals.length, 0);
});

// --- open_camera / close_camera --------------------------------------------

test("open_camera: happy path arms the camera and says so", async () => {
  const camera = fakeCamera([FRAME]);
  const ctx = fakeSkillContext({ camera, conversation: fakeConversation() });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "turn on the camera", intent: "open_camera", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Camera's on.");
  assert.equal(camera.state, "armed");
});

test("open_camera: camera fails to open -- honest fallback, does not throw", async () => {
  const camera = {
    state: "idle" as const,
    async open(): Promise<never> {
      throw new Error("camera permission denied");
    },
  };
  const ctx = fakeSkillContext({ camera, conversation: fakeConversation() });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "turn on the camera", intent: "open_camera", sessionId: "s1" }, ctx);

  assert.match(result.speech, /couldn't turn the camera on/i);
});

test("close_camera: already idle -- says so, never calls open()", async () => {
  const camera = fakeCamera([FRAME]); // starts idle
  const ctx = fakeSkillContext({ camera, conversation: fakeConversation() });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "turn off the camera", intent: "close_camera", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "The camera's already off.");
});

test("close_camera: armed -- re-arms to get the live session, then closes it", async () => {
  const camera = fakeCamera([FRAME]);
  await camera.open("already armed by an earlier turn");
  const ctx = fakeSkillContext({ camera, conversation: fakeConversation() });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "turn off the camera", intent: "close_camera", sessionId: "s1" }, ctx);

  assert.equal(result.speech, "Camera's off.");
  assert.equal(camera.state, "idle");
  assert.equal(camera.closedSessionIds.length, 1);
});

test("unknown intent: honest fallback, does not throw", async () => {
  const ctx = fakeSkillContext({ conversation: fakeConversation() });
  const skill = createLookSkill(fakeDeps());

  const result = await skill.handle({ utterance: "???", intent: "something_else", sessionId: "s1" }, ctx);

  assert.match(result.speech, /not sure what you want/i);
});
