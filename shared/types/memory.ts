/**
 * shared/types/memory.ts -- events, facts, observations. Split out of
 * shared/types.ts, 2026-08-12.
 */

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export type EventKind =
  | "utterance"    // the owner spoke
  | "response"     // jarvis spoke
  | "observation"  // the camera saw
  | "action"       // something was executed
  | "approval"
  | "rejection"
  | "note";        // system or manual

export interface MemoryEvent {
  id: string;
  ts: number;
  kind: EventKind;
  actor: "owner" | "jarvis" | "system";
  content: string;
  meta?: Record<string, unknown>;
  sessionId?: string;
}

export interface Fact {
  id: string;
  /** Dotted namespace, e.g. "diet.avoids", "project.hoqueimanager.stack". */
  key: string;
  value: string;
  /** Honest. Do not round up to look confident. */
  confidence: number;
  sourceEventId?: string;
  updatedAt: number;
}

export interface Observation {
  id: string;
  ts: number;
  /** Local path. Never leaves the machine unless the `see` lane fell through
   *  to a remote provider, which is logged. */
  imagePath: string;
  provider: string;
  qualitative: string;
  structured: object | null;
  confidence: number;
}
