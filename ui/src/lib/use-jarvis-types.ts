/**
 * ui/src/lib/use-jarvis-types.ts -- the dashboard state shapes `useJarvis`
 * returns, split out of use-jarvis.ts (2026-08-12, same 300-line
 * guideline as shared/types.ts's own split). Pure declarations, no
 * hook logic -- `useJarvis` itself stays in use-jarvis.ts.
 */

import type {
  ApprovalRequest,
  DashboardMetrics,
  FeedbackRating,
  HandLandmarks,
  JarvisState,
  MemoryEvent,
  ShoppingItem,
  SkillHealth,
  SystemMetrics,
  TaskItem,
} from "./types";

export type ConnectionState = "connecting" | "open" | "closed";

/** `speaking` is layered on top of `state` (a separate, real signal from
 * `senses/voice`, not a guess) -- when active it takes visual priority
 * over whatever `state` says, since it's the more specific fact. */
export type OrbState = JarvisState | "speaking";

export interface Thought {
  text: string;
  lane: string;
  ts: number;
}

export interface TranscriptLine {
  text: string;
  speaker: "owner" | "jarvis";
  ts: number;
  /** Absent for lines with no backing `events` row (the fallback line
   * spoken when a turn errors out) -- feedback needs a real event to
   * attach to. */
  eventId?: string;
}

export interface JarvisError {
  message: string;
  detail?: string;
  ts: number;
}

/** Real detail from `eyes` (via `core`'s relay), not a guess -- SPEC.md
 * § 6: ARMED never means recording, so this is the whole live picture a
 * dashboard needs: is it on, why, when it expires, and why it last
 * closed. */
export interface CameraDashboardState {
  state: "idle" | "armed";
  reason: string | null;
  expiresAt: number | null;
  lastCaptureAt: number | null;
  lastClosedCause: "owner" | "idle" | "cap" | "error" | null;
}

export const INITIAL_CAMERA_STATE: CameraDashboardState = {
  state: "idle",
  reason: null,
  expiresAt: null,
  lastCaptureAt: null,
  lastClosedCause: null,
};

/** Live hand-tracking state (`senses/eyes/gestures.py`). `hands` is the
 * *current* position, replaced every frame -- not a log. `previewImage`
 * arrives at a lower rate than landmarks on purpose (it's the expensive
 * part), so the two are stored separately rather than as one frame
 * object. */
export interface GestureDashboardState {
  active: boolean;
  hands: HandLandmarks[];
  previewImage: string | null;
  lastLandmarkAt: number | null;
  lastStoppedCause: "owner" | "idle" | "error" | null;
  /** Real macOS cursor control (`senses/eyes/pointer.py`) -- purely a
   * status echo for display; the click safety itself lives entirely in
   * `pointer.py`'s `ClickTrigger`, not here. */
  pointerControlActive: boolean;
}

export const INITIAL_GESTURE_STATE: GestureDashboardState = {
  active: false,
  hands: [],
  previewImage: null,
  lastLandmarkAt: null,
  lastStoppedCause: null,
  pointerControlActive: false,
};

export interface JarvisDashboardState {
  connection: ConnectionState;
  connectedSince: number | null;
  orbState: OrbState;
  approvals: ApprovalRequest[];
  transcript: TranscriptLine[];
  thoughts: Thought[];
  events: MemoryEvent[];
  skills: SkillHealth[];
  errors: JarvisError[];
  system: SystemMetrics | null;
  tasks: TaskItem[];
  shoppingItems: ShoppingItem[];
  metrics: DashboardMetrics | null;
  feedback: Record<string, FeedbackRating>;
  camera: CameraDashboardState;
  gestures: GestureDashboardState;
  audioLevels: number[];
  decide(request: ApprovalRequest, decision: "approve" | "reject"): void;
  refreshSkills(): void;
  injectUtterance(text: string): void;
  setGestureBlur(enabled: boolean): void;
  sendFeedback(eventId: string, rating: FeedbackRating): void;
  toggleTask(id: string): void;
  deleteTask(id: string): void;
  deleteShoppingItem(id: string): void;
}
