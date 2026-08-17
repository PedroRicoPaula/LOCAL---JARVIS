/**
 * core/senseRelays.ts — relays real status messages from `senses/voice`
 * and `senses/eyes` onto the dashboard's WebSocket, and (for eyes) into
 * durable memory where a message has a lasting side effect. Split out of
 * `core/main.ts` 2026-08-17 (CLAUDE.md § 3's ~300-line guideline) --
 * both functions were already self-contained, taking their dependencies
 * as explicit parameters rather than closing over `main()`'s own scope.
 */

import type { HandLandmarks } from "../shared/types.ts";
import type { SenseConnection } from "./senseConnection.ts";
import type { EyesEventSource } from "./skills/camera.ts";
import type { Memory } from "./memory/memory.ts";
import type { createWsHub } from "./ws.ts";

/** Relays `voice`'s real `{"type": "speaking", "active": bool}` reports
 * to the dashboard -- runs concurrently with the ears loop, same pattern
 * as `watchApprovalCommands`. */
export async function relayVoiceStatus(voiceConn: SenseConnection, wsHub: ReturnType<typeof createWsHub>): Promise<void> {
  for await (const message of voiceConn.messages()) {
    if (message["type"] !== "speaking") continue;
    wsHub.broadcast({ type: "speaking", active: Boolean(message["active"]) });
  }
}

const CAMERA_TIMEOUT_ANNOUNCEMENT: Record<"idle" | "cap", string> = {
  idle: "The camera timed out from being idle and closed.",
  cap: "The camera hit its maximum session length and closed.",
};

/** Every message `eyes` sends goes through both jobs, in this order:
 * first `cameraHandle.offerEvent()` (resolves a pending arm/capture/close
 * request if this reply matches one), then an unconditional relay to the
 * dashboard -- a self-triggered idle/absolute timeout close has nothing
 * pending to resolve, but the dashboard still needs to know about it
 * (SPEC.md § 6: "both timeouts, both announced"). `CameraEvent`'s three
 * variants are exactly `ServerEvent`'s folded-in camera.* variants
 * (shared/types.ts), so the raw message is broadcast as-is once its
 * shape is confirmed.
 *
 * "Both timeouts, both announced" (SPEC.md § 6, ROADMAP.md's Phase 8
 * DoD: "idle timeout fires, is announced, and closes") means *spoken*,
 * not just shown on the dashboard -- a self-triggered close with
 * `cause !== "owner"` is the one `camera.closed` case nothing else in
 * this turn already narrates, so it gets its own `say()` here. Found
 * live, Phase 8's own verification pass: this was silently
 * dashboard-only until now. */
export async function relayCameraStatus(
  eyesConn: SenseConnection,
  wsHub: ReturnType<typeof createWsHub>,
  cameraHandle: EyesEventSource,
  say: (text: string) => void,
  memory: Memory,
  sessionId: string,
): Promise<void> {
  for await (const message of eyesConn.messages()) {
    cameraHandle.offerEvent(message);
    const type = message["type"];
    if (type === "camera.armed") {
      wsHub.broadcast({
        type: "camera.armed",
        sessionId: String(message["sessionId"]),
        reason: String(message["reason"]),
        expiresAt: Number(message["expiresAt"]),
      });
    } else if (type === "camera.captured") {
      wsHub.broadcast({
        type: "camera.captured",
        sessionId: String(message["sessionId"]),
        frameId: String(message["frameId"]),
        path: String(message["path"]),
      });
    } else if (type === "camera.closed") {
      const rawCause = message["cause"];
      const cause = rawCause === "owner" || rawCause === "idle" || rawCause === "cap" || rawCause === "error" ? rawCause : "error";
      wsHub.broadcast({ type: "camera.closed", sessionId: String(message["sessionId"]), cause });
      if (cause === "idle" || cause === "cap") {
        const announcement = CAMERA_TIMEOUT_ANNOUNCEMENT[cause];
        say(announcement);
        wsHub.broadcast({ type: "transcript", text: announcement, final: true, speaker: "jarvis" });
      }
    } else if (type === "gesture.started") {
      wsHub.broadcast({ type: "gesture.started" });
    } else if (type === "gesture.stopped") {
      const rawCause = message["cause"];
      const cause = rawCause === "idle" || rawCause === "error" ? rawCause : "owner";
      wsHub.broadcast({ type: "gesture.stopped", cause });
      // A self-triggered stop (nobody's hand seen for a while, or the
      // camera failed) is the one case nothing else in the turn narrates
      // -- same reasoning as the camera's own timeout announcements above.
      if (cause !== "owner") {
        const announcement =
          cause === "idle" ? "Hand tracking timed out and stopped." : "Hand tracking stopped -- something went wrong with the camera.";
        say(announcement);
        wsHub.broadcast({ type: "transcript", text: announcement, final: true, speaker: "jarvis" });
      }
    } else if (type === "hand.landmarks") {
      wsHub.broadcast({
        type: "hand.landmarks",
        hands: message["hands"] as HandLandmarks[],
        ts: Number(message["ts"]),
      });
    } else if (type === "hand.preview") {
      wsHub.broadcast({ type: "hand.preview", image: String(message["image"]) });
    } else if (type === "pointer.control") {
      wsHub.broadcast({ type: "pointer.control", enabled: Boolean(message["enabled"]) });
    } else if (type === "pointer.click") {
      // Durable record, not just the ephemeral WS broadcast above --
      // security review, 2026-08-13: this is the one green-tier action
      // with a real, potentially-irreversible external side effect, so
      // it gets a real `events` row the way nothing else in the green
      // tier currently does.
      memory.appendEvent({ kind: "action", actor: "jarvis", content: "Pointer control clicked", sessionId });
    }
  }
}
