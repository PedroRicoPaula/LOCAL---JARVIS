/**
 * shared/types/dashboard.ts -- the live core <-> ui channel
 * (ServerEvent/ClientEvent) plus the states they carry. Split out of
 * shared/types.ts, 2026-08-12.
 */

import type { Lane, RouterTrace } from "./router.ts";
import type { ApprovalRequest, ApprovalResponse, ApprovalState } from "./capability.ts";
import type { HandLandmarks } from "./camera.ts";

// ---------------------------------------------------------------------------
// Live channel: core -> ui
// ---------------------------------------------------------------------------

/** What JARVIS is doing right now, independent of `speaking` -- so the
 * owner can watch a request actually move (listening -> thinking ->
 * speaking) instead of taking "it's working on it" on faith. Each value
 * traces to a real signal, not a guess: `listening` from `senses/ears`
 * arming the mic, `thinking` from an utterance landing in `core`'s
 * dispatch loop, back to `idle` once that turn is fully handled. */
export type JarvisState = "idle" | "listening" | "thinking";

export type FeedbackRating = "up" | "down";

export type ServerEvent =
  | { type: "thought"; text: string; lane: Lane; ts: number }
  | { type: "trace"; trace: RouterTrace }
  | { type: "approval.new"; request: ApprovalRequest }
  | { type: "approval.resolved"; requestId: string; state: ApprovalState }
  /** `eventId` is absent for the owner's own line (nothing to rate) and
   * present for `jarvis` lines backed by a real `events` row, so the
   * dashboard can attach a thumbs up/down without a second round trip. */
  | { type: "transcript"; text: string; final: boolean; speaker: "owner" | "jarvis"; eventId?: string }
  | { type: "state"; value: JarvisState }
  | { type: "speaking"; active: boolean }
  /** Folded in from `CameraEvent` (below) -- the dashboard needs the same
   * real detail (expiry, close cause) `core` gets from `eyes`, not just
   * an on/off boolean. */
  | { type: "camera.armed"; sessionId: string; reason: string; expiresAt: number }
  | { type: "camera.captured"; sessionId: string; frameId: string; path: string }
  | { type: "camera.closed"; sessionId: string; cause: "owner" | "idle" | "cap" | "error" }
  /** Continuous hand tracking (2026-08-12, `senses/eyes/gestures.py`).
   * A distinct mode from the camera's single-shot `capture()`, not a
   * loosening of SPEC.md § 6: frames are analyzed in memory by a local
   * model and dropped -- nothing written to disk, nothing sent to a
   * remote model. Landmarks are normalized 0..1, already mirrored to
   * match the preview image so the overlay lines up. */
  | { type: "gesture.started" }
  | { type: "gesture.stopped"; cause: "owner" | "idle" | "error" }
  | { type: "hand.landmarks"; hands: HandLandmarks[]; ts: number }
  /** Base64 JPEG, deliberately rate-limited below the landmark rate --
   * the skeleton overlay is drawn browser-side from the landmarks above,
   * so only this (the expensive part) is throttled. */
  | { type: "hand.preview"; image: string }
  /** Real macOS cursor control (2026-08-12, `senses/eyes/pointer.py`,
   * `POINTER_CONTROL` capability). Purely a status echo -- the click
   * safety itself lives entirely in `pointer.py`'s `ClickTrigger`, not
   * in anything this event or the dashboard does. */
  | { type: "pointer.control"; enabled: boolean }
  /** Live microphone level, 0..1, log-scaled (`senses/ears/audio_level.py`).
   * Throttled to ~10/s at the source -- decorative, and nobody perceives
   * a level meter faster than that. */
  | { type: "audio.level"; level: number }
  | { type: "health"; providers: Record<string, boolean> }
  /** `ears`/`voice`/`eyes` connection state, per sense -- distinct from
   * `health` (LLM router providers, above). Found live, 2026-08-07: a
   * dropped sense connection had no dashboard-visible signal at all,
   * only a real bug in `core/main.ts`'s reconnect handling (fixed the
   * same day, `core/senseConnection.ts`) made this observable in the
   * first place -- see PROGRESS.md's dated entry. */
  | { type: "sense.connection"; sense: "ears" | "voice" | "eyes"; connected: boolean }
  /** A turn failed. Spoken to the owner too (persona.md) -- this is the
   * dashboard-visible half of the same honesty rule, not a replacement
   * for it. `detail` is a plain message, never a raw stack trace. */
  | { type: "error"; message: string; detail?: string; ts: number }
  /** Relayed to every tab after a rating lands, same "two tabs stay in
   * sync" reasoning as approvals -- state lives in `core`, not the tab
   * that clicked. */
  | { type: "feedback"; eventId: string; rating: FeedbackRating };

export type ClientEvent =
  | { type: "approval.decide"; response: ApprovalResponse }
  | { type: "mute"; category: string; muted: boolean }
  /** Dashboard "test console" (SOAK 1): feeds a typed line into the exact
   * same handling path a real transcribed utterance goes through --
   * `core` cannot tell the difference, which is the point: real usage
   * data without needing a working mic every time. */
  | { type: "utterance.inject"; text: string }
  /** Rates a `jarvis` response, owner-only judgement (CLAUDE.md § 0.5:
   * never model-generated). Purely diagnostic -- never gated, never fed
   * back into `Memory.recall()`. */
  | { type: "feedback"; eventId: string; rating: FeedbackRating }
  /** Toggles background blur on the gesture-mode preview only -- landmark
   * detection always runs on the real, unblurred frame
   * (`senses/eyes/gestures.py`). A no-op if gesture tracking isn't
   * currently running. Sent directly, not through a skill/capability:
   * purely cosmetic, no side effect beyond what the owner already made
   * visible by turning hand tracking on. */
  | { type: "gesture.blur"; enabled: boolean };
