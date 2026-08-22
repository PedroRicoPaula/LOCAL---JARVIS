/**
 * skills/look/index.ts — camera control and vision (SPEC.md § 6/§ 7).
 * `describe` speaks what the camera saw immediately, never blocking on
 * approval; only the resulting `observation` write is gated
 * (`MEMORY_WRITE`, yellow). Opening/closing/capturing the camera itself
 * is `CAMERA` (green) -- no approval needed to look, only to remember.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ulid } from "ulid";
import type { CameraSession, Frame, SkillResult, VisionResult } from "../../shared/types.ts";
import type { Skill, SkillContext } from "../../core/skills/types.ts";
import { manifest } from "./manifest.ts";

// Internal prompt: English, per CLAUDE.md § 4 -- unrelated to which
// language the owner is speaking. Encodes SPEC.md § 7's own rule
// ("vision identifies, it never quantifies") directly in the prompt,
// since the model's reply is spoken close to verbatim (see `handle`
// below) rather than rephrased through a second model call. Includes
// the owner's actual utterance, not just a generic "describe this" --
// ROADMAP.md's Phase 8 DoD asks for describe/identify *and* "answer a
// question about what is visible" ("is this the right cable", "does
// this shirt match these trousers"); a fixed prompt ignoring what was
// actually asked can't do the third one. Found live, this phase's own
// verification pass -- the first version always asked the same generic
// question regardless of the owner's.
const DESCRIBE_RULES =
  "Answer in one or two plain sentences, based only on what is actually in the image. " +
  "Identify what you see, but do not state counts, weights, sizes, or any other precise quantity -- describe qualitatively only. " +
  "If any part of the image is unclear (small text, fine detail, something partially out of frame or at an angle), say so explicitly rather than guessing.";

function buildDescribePrompt(utterance: string): string {
  return `The owner just said: "${utterance}". Answer what they're asking, based on the attached image. ${DESCRIBE_RULES}`;
}

const OBSERVATIONS_DIR = process.env["JARVIS_OBSERVATIONS_DIR"] ?? "data/observations";

/** Copies the frame's bytes to a permanent location immediately, before
 * anything about the observation write is proposed or approved --
 * ephemeral session frames can be deleted by eyes's own idle/absolute
 * timeout at any point, including while a `MEMORY_WRITE` approval is
 * still pending (core/skills/camera.ts's own docstring has the full
 * reasoning, ADR-045). Real filesystem access, so it's injectable --
 * same "outside-world call, fake it in tests" shape `skills/weather`'s
 * own `WeatherDeps` already establishes. */
async function copyFrameForObservation(framePath: string): Promise<string> {
  await mkdir(OBSERVATIONS_DIR, { recursive: true });
  const durablePath = join(OBSERVATIONS_DIR, `${ulid()}.jpg`);
  await copyFile(framePath, durablePath);
  return durablePath;
}

export interface LookDeps {
  copyFrameForObservation: (framePath: string) => Promise<string>;
}

const DEFAULT_DEPS: LookDeps = { copyFrameForObservation };

/** Every camera-control intent is the same five lines: optionally refuse
 * when nothing is running, open the session (idempotent on `eyes`'s
 * side), call one or two methods on it, and report -- honestly on
 * failure, with the error logged. Only the strings and those one or two
 * calls differ, so they are data here rather than six copies of the
 * shape (2026-08-22). `describe` is genuinely different and stays as its
 * own case below.
 *
 * `idleMessage` is what to say when `ctx.camera.state === "idle"` and
 * that makes the request meaningless ("hand tracking isn't running").
 * Omitted for the intents that legitimately start from idle. */
async function cameraAction(
  ctx: SkillContext,
  utterance: string,
  spec: { idleMessage?: string; run: (session: CameraSession) => void | Promise<void>; ok: string; fail: string; tag: string },
): Promise<SkillResult> {
  if (spec.idleMessage !== undefined && ctx.camera.state === "idle") {
    ctx.say(spec.idleMessage);
    return { speech: spec.idleMessage };
  }
  try {
    await spec.run(await ctx.camera.open(utterance));
  } catch (err) {
    ctx.say(spec.fail);
    ctx.log.error(`look: ${spec.tag} failed`, { err: String(err) });
    return { speech: spec.fail };
  }
  ctx.say(spec.ok);
  return { speech: spec.ok };
}

export function createLookSkill(deps: LookDeps = DEFAULT_DEPS): Skill {
  return {
    manifest,

    async handle(input, ctx): Promise<SkillResult> {
      switch (input.intent) {
        case "open_camera":
          return cameraAction(ctx, input.utterance, {
            run: () => {},
            ok: "Camera's on.",
            fail: "I couldn't turn the camera on just now.",
            tag: "open_camera",
          });

        // Arms the camera if it isn't already (idempotent on eyes's side),
        // then starts tracking on that same session -- the owner shouldn't
        // have to say "open the camera" first.
        case "start_gestures":
          return cameraAction(ctx, input.utterance, {
            run: (s) => s.startGestures(),
            ok: "Hand tracking's on -- you should see yourself on the dashboard.",
            fail: "I couldn't start hand tracking just now.",
            tag: "start_gestures",
          });

        case "stop_gestures":
          return cameraAction(ctx, input.utterance, {
            idleMessage: "Hand tracking isn't running.",
            run: (s) => s.stopGestures(),
            ok: "Hand tracking's off.",
            fail: "I couldn't stop hand tracking just now.",
            tag: "stop_gestures",
          });

        // Pointer control needs real hand positions, which only exist
        // while gesture tracking is running -- start that first
        // (idempotent, same as start_gestures arming the camera) so the
        // owner doesn't need two commands, and so this can never silently
        // no-op because tracking wasn't already on.
        case "start_pointer_control":
          return cameraAction(ctx, input.utterance, {
            run: (s) => {
              s.startGestures();
              s.startPointerControl();
            },
            ok: "Pointer control's on -- hold Space to click where your finger's pointing.",
            fail: "I couldn't start pointer control just now.",
            tag: "start_pointer_control",
          });

        case "stop_pointer_control":
          return cameraAction(ctx, input.utterance, {
            idleMessage: "Pointer control isn't running.",
            run: (s) => s.stopPointerControl(),
            ok: "Pointer control's off.",
            fail: "I couldn't stop pointer control just now.",
            tag: "stop_pointer_control",
          });

        // Idempotent re-arm: since state isn't idle, `open()` returns the
        // already-live session rather than reopening the device
        // (senses/eyes/main.py's handle_message) -- the only way this
        // skill can get a CameraSession to call close() on, since
        // CameraHandle has no "current session" accessor.
        case "close_camera":
          return cameraAction(ctx, input.utterance, {
            idleMessage: "The camera's already off.",
            run: (s) => s.close(),
            ok: "Camera's off.",
            fail: "I couldn't turn the camera off just now.",
            tag: "close_camera",
          });

        case "describe": {
          let frame: Frame;
          try {
            const session = await ctx.camera.open(input.utterance);
            frame = await session.capture();
          } catch (err) {
            const speech = "I couldn't get a picture from the camera just now.";
            ctx.say(speech);
            ctx.log.error("look: describe failed to arm/capture", { err: String(err) });
            return { speech };
          }

          // Durability failure doesn't lose the answer -- the ephemeral
          // frame still exists right now, so describe from it directly.
          // No observation is proposed below in that case: there is
          // nothing durable to reference.
          let durablePath = "";
          try {
            durablePath = await deps.copyFrameForObservation(frame.path);
          } catch (err) {
            ctx.log.error("look: failed to copy frame for durability, continuing without one", { err: String(err) });
          }

          let seen: VisionResult & { provider: string };
          try {
            seen = await ctx.router.see({ imagePath: durablePath || frame.path, prompt: buildDescribePrompt(input.utterance), timeoutMs: 15_000 });
          } catch (err) {
            const speech = "I couldn't get a good look at that just now.";
            ctx.say(speech);
            ctx.log.error("look: vision call failed", { err: String(err) });
            return { speech };
          }

          ctx.say(seen.qualitative);

          if (durablePath) {
            // Fire-and-forget: a deliberate "look" request already got
            // its answer above -- whether it's *remembered* is a
            // separate decision the owner makes on their own time
            // (CLAUDE.md § 7, SPEC.md § 7's confirmation contract).
            ctx
              .propose({
                capability: "MEMORY_WRITE",
                humanSummary: `Remember what I saw: ${seen.qualitative}`,
                payload: {
                  kind: "observation",
                  imagePath: durablePath,
                  provider: seen.provider,
                  qualitative: seen.qualitative,
                  structured: seen.structured,
                  confidence: seen.confidence,
                },
              })
              .catch((err) => ctx.log.error("look: failed to propose observation", { err: String(err) }));
          }

          return { speech: seen.qualitative };
        }

        default: {
          const speech = "I'm not sure what you want me to do with the camera.";
          ctx.say(speech);
          return { speech };
        }
      }
    },
  };
}

export const skill: Skill = createLookSkill();
