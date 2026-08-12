/**
 * shared/types/camera.ts -- SPEC.md SS6 / ADR-010: the camera is a
 * voice-controlled session, ARMED never means recording. Split out of
 * shared/types.ts, 2026-08-12.
 */

// ---------------------------------------------------------------------------
// Camera — see SPEC.md § 6 and ADR-010
// ---------------------------------------------------------------------------

/**
 * ARMED does not mean recording. Arming the camera captures nothing; a frame
 * is taken only when a request is made.
 */
export type CameraState = "idle" | "armed" | "capturing" | "analysing";

export interface CameraSession {
  readonly id: string;
  readonly openedAt: number;
  /** Absolute cap. Default 10 minutes. */
  readonly expiresAt: number;
  /** Rolling idle deadline. Default 120s, reset on each capture. */
  readonly idleUntil: number;
  readonly reason: string;

  /** Grabs a fresh frame. Follow-ups never reuse the previous one. */
  capture(): Promise<Frame>;
  /** Deletes every frame not referenced by an approved observation. */
  close(): Promise<void>;
  /** Starts/stops continuous hand tracking on this session's own device
   * (`senses/eyes/gestures.py`). Fire-and-forget on purpose: the result
   * is a continuous `hand.landmarks` stream to the dashboard, not a
   * single reply worth awaiting here. Stopping is idempotent, and
   * `close()` stops tracking too -- tracking can never outlive the
   * session that owns the camera. */
  startGestures(): void;
  stopGestures(): void;
  /** Real macOS cursor, driven by the index fingertip
   * (`senses/eyes/pointer.py`) -- requires gesture tracking to already
   * be running (there's no hand position without it). Fire-and-forget,
   * same reasoning as startGestures/stopGestures. Clicks never fire
   * from this alone: only a real, physical keypress fires a click, a
   * structural safety property of `senses/eyes/pointer.py`'s
   * `ClickTrigger`, not something this method or the Gate mediates --
   * see the `POINTER_CONTROL` capability's own comment above for why. */
  startPointerControl(): void;
  stopPointerControl(): void;
}

export interface CameraHandle {
  /** Throws if the calling skill did not declare CAMERA in its manifest. */
  open(reason: string): Promise<CameraSession>;
  readonly state: CameraState;
}

export interface Frame {
  path: string;       // data/frames/<sessionId>/<ulid>.jpg — local only
  capturedAt: number;
  sessionId: string;
  /** True once an approved observation references it; survives session close. */
  retained: boolean;
}

/** One detected hand: MediaPipe's own 21-point topology, normalized
 * 0..1. Index 4 is the thumb tip and index 8 the index-finger tip (the
 * two the dashboard's pinch detection uses) -- that ordering is
 * MediaPipe's fixed, documented convention, not something this project
 * chose. `handedness` is the model's own "Left"/"Right" label. */
export interface HandLandmarks {
  handedness: string;
  landmarks: { x: number; y: number; z: number }[];
}

export type CameraEvent =
  | { type: "camera.armed"; sessionId: string; reason: string; expiresAt: number }
  | { type: "camera.captured"; sessionId: string; frameId: string; path: string }
  | { type: "camera.closed"; sessionId: string; cause: "owner" | "idle" | "cap" | "error" };
