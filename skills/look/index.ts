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
import type { Frame, SkillResult, VisionResult } from "../../shared/types.ts";
import type { Skill } from "../../core/skills/types.ts";
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

export function createLookSkill(deps: LookDeps = DEFAULT_DEPS): Skill {
  return {
    manifest,

    async handle(input, ctx): Promise<SkillResult> {
      switch (input.intent) {
        case "open_camera": {
          try {
            await ctx.camera.open(input.utterance);
          } catch (err) {
            const speech = "I couldn't turn the camera on just now.";
            ctx.say(speech);
            ctx.log.error("look: open_camera failed", { err: String(err) });
            return { speech };
          }
          const speech = "Camera's on.";
          ctx.say(speech);
          return { speech };
        }

        case "start_gestures": {
          try {
            // Arms the camera if it isn't already (idempotent on eyes's
            // side), then starts tracking on that same session -- the
            // owner shouldn't have to say "open the camera" first.
            const session = await ctx.camera.open(input.utterance);
            session.startGestures();
          } catch (err) {
            const speech = "I couldn't start hand tracking just now.";
            ctx.say(speech);
            ctx.log.error("look: start_gestures failed", { err: String(err) });
            return { speech };
          }
          const speech = "Hand tracking's on -- you should see yourself on the dashboard.";
          ctx.say(speech);
          return { speech };
        }

        case "stop_gestures": {
          if (ctx.camera.state === "idle") {
            const speech = "Hand tracking isn't running.";
            ctx.say(speech);
            return { speech };
          }
          try {
            const session = await ctx.camera.open(input.utterance);
            session.stopGestures();
          } catch (err) {
            const speech = "I couldn't stop hand tracking just now.";
            ctx.say(speech);
            ctx.log.error("look: stop_gestures failed", { err: String(err) });
            return { speech };
          }
          const speech = "Hand tracking's off.";
          ctx.say(speech);
          return { speech };
        }

        case "close_camera": {
          if (ctx.camera.state === "idle") {
            const speech = "The camera's already off.";
            ctx.say(speech);
            return { speech };
          }
          try {
            // Idempotent re-arm: since state isn't idle, this returns
            // the already-live session rather than opening the device
            // again (senses/eyes/main.py's own handle_message()) -- the
            // only way this skill can get a CameraSession object to
            // call close() on, since CameraHandle has no "current
            // session" accessor of its own.
            const session = await ctx.camera.open(input.utterance);
            await session.close();
          } catch (err) {
            const speech = "I couldn't turn the camera off just now.";
            ctx.say(speech);
            ctx.log.error("look: close_camera failed", { err: String(err) });
            return { speech };
          }
          const speech = "Camera's off.";
          ctx.say(speech);
          return { speech };
        }

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
