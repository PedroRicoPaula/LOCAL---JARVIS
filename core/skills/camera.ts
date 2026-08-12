/**
 * core/skills/camera.ts — the real `CameraHandle` (shared/types.ts,
 * SPEC.md § 6). Owns the `eyes` connection: sends `{"type":
 * "arm"|"capture"|"close"}` and awaits the matching reply from eyes's
 * async event stream -- same "send a message, await the next matching
 * event" shape as `core/skills/conversation/ipc.ts`'s `ask()`/
 * `offerUtterance()`, reused rather than inventing a second one. One
 * request in flight at a time: only one skill dispatch ever holds the
 * camera at once, and `senses/eyes/main.py`'s own `SessionHolder`
 * enforces the same "one session" invariant on the daemon side.
 *
 * `createStubCameraHandle()` (below) is still what a skill gets if its
 * manifest doesn't declare `CAMERA`, or if `eyes` isn't connected --
 * capability enforcement happens at the handle, not the call site
 * (`docs/SKILLS.md` § 4): the handle itself needs no per-call check
 * because the *wrong* handle is simply never handed to it.
 *
 * Frames are ephemeral by default (SPEC.md § 6): `close()` always tells
 * eyes to delete everything captured in the session, no exceptions.
 * Durability isn't done here -- a skill that wants to keep a frame
 * copies its bytes to a permanent location itself, immediately after
 * capture, before proposing the `MEMORY_WRITE`. That sidesteps a real
 * race this design considered and rejected: passing "frames to keep"
 * through `close()` can't work in general, because eyes's own
 * idle/absolute-timeout self-close (`senses/eyes/main.py`'s
 * `check_timeouts_forever`, a background thread) can fire with no
 * request from `core` at all, at any point after capture, before an
 * owner ever approves the write -- there is no reliable moment for
 * `core` to tell eyes "wait, keep this one" before it may already be
 * gone. Copying immediately removes the race instead of trying to win
 * it. See `skills/look/index.ts` for the copy.
 */

import type { CameraEvent, CameraHandle, CameraSession, CameraState, Frame } from "../../shared/types.ts";

// Mirrors senses/eyes/config.py's own IDLE_TIMEOUT_S default and env var
// name exactly -- eyes doesn't report the rolling idle deadline back on
// the wire (only the absolute `expiresAt`), so this side reconstructs it
// from the same default/override rather than guessing a different one.
const IDLE_TIMEOUT_S = Number(process.env["JARVIS_CAMERA_IDLE_TIMEOUT_S"] ?? "120");

export function createStubCameraHandle(): CameraHandle {
  return {
    state: "idle",
    async open(): Promise<never> {
      throw new Error("camera is not available -- this skill's manifest doesn't declare CAMERA, or eyes isn't connected");
    },
  };
}

/** `core/main.ts`'s eyes-read-loop calls `offerEvent` for every message
 * `eyes` sends. Returns true if the event was consumed as the reply to a
 * pending request, false if it was a spontaneous event (e.g. a
 * self-triggered timeout close) with nothing to correlate it to --
 * either way, `core/main.ts` still relays the raw event to the dashboard
 * itself; this handle only cares about resolving its own pending
 * request and keeping `state` honest. */
export interface EyesEventSource {
  offerEvent(event: Record<string, unknown>): boolean;
}

type EyesReply = CameraEvent | { type: "error"; message: string };

function isEyesReply(event: Record<string, unknown>): event is EyesReply {
  const type = event["type"];
  return type === "camera.armed" || type === "camera.captured" || type === "camera.closed" || type === "error";
}

export function createIpcCameraHandle(sendToEyes: (message: Record<string, unknown>) => void): CameraHandle & EyesEventSource {
  let state: CameraState = "idle";
  let pending: { resolve: (event: EyesReply) => void } | null = null;

  function request(message: Record<string, unknown>): Promise<EyesReply> {
    if (pending) {
      // Shouldn't happen given single-in-flight use -- fail the stale
      // request clearly rather than silently resolving it with a later,
      // unrelated reply.
      const stale = pending;
      pending = null;
      stale.resolve({ type: "error", message: "superseded by a newer camera request" });
    }
    return new Promise<EyesReply>((resolve) => {
      pending = { resolve };
      sendToEyes(message);
    });
  }

  function offerEvent(event: Record<string, unknown>): boolean {
    if (!isEyesReply(event)) return false;
    // Updated regardless of whether a request is pending -- eyes can
    // self-close on its own idle/absolute timeout with no request from
    // core at all (SPEC.md § 6: "both timeouts, both announced").
    if (event.type === "camera.armed") state = "armed";
    if (event.type === "camera.closed") state = "idle";

    if (!pending) return false;
    const { resolve } = pending;
    pending = null;
    resolve(event);
    return true;
  }

  function makeSession(sessionId: string, reason: string, expiresAt: number): CameraSession {
    return {
      id: sessionId,
      openedAt: Date.now(),
      expiresAt,
      idleUntil: Date.now() + IDLE_TIMEOUT_S * 1000,
      reason,

      async capture(): Promise<Frame> {
        const reply = await request({ type: "capture" });
        if (reply.type === "error") throw new Error(reply.message);
        if (reply.type !== "camera.captured") {
          throw new Error(`eyes: unexpected reply to capture(): ${reply.type}`);
        }
        return {
          path: reply.path,
          capturedAt: Date.now(),
          sessionId: reply.sessionId,
          retained: false,
        };
      },

      async close(): Promise<void> {
        if (state === "idle") return; // already closed (e.g. a timeout beat us to it) -- eyes won't reply to this
        const reply = await request({ type: "close", cause: "owner" });
        if (reply.type === "error") throw new Error(reply.message);
      },

      // Fire-and-forget, unlike capture()/close(): the whole point of
      // gesture mode is a continuous stream of `hand.landmarks` events
      // going to the dashboard, not one reply to await here. `eyes` does
      // send a `gesture.started` confirmation, but it's relayed straight
      // to the dashboard by `core/main.ts` -- correlating it into this
      // handle's single-pending-request slot would mean a *skill* waiting
      // on something it has no use for, and would collide with the real
      // capture/close requests that slot exists for.
      startGestures(): void {
        sendToEyes({ type: "gesture.start" });
      },

      stopGestures(): void {
        sendToEyes({ type: "gesture.stop" });
      },

      startPointerControl(): void {
        sendToEyes({ type: "pointer.control", enabled: true });
      },

      stopPointerControl(): void {
        sendToEyes({ type: "pointer.control", enabled: false });
      },
    };
  }

  return {
    get state(): CameraState {
      return state;
    },

    async open(reason: string): Promise<CameraSession> {
      const reply = await request({ type: "arm", reason });
      if (reply.type === "error") throw new Error(reply.message);
      if (reply.type !== "camera.armed") {
        throw new Error(`eyes: unexpected reply to open(): ${reply.type}`);
      }
      return makeSession(reply.sessionId, reply.reason, reply.expiresAt);
    },

    offerEvent,
  };
}
