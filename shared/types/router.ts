/**
 * shared/types/router.ts -- the `Lane`/provider contract, split out of
 * shared/types.ts (2026-08-12, same reasoning as DECISIONS.md/PROGRESS.md's
 * own split: the single file had grown past this project's own 300-line
 * guideline). Re-exported from shared/types.ts unchanged -- every existing
 * `from "shared/types.ts"` import keeps working.
 */

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export type Lane = "reflex" | "converse" | "reason" | "see" | "act";

export type CostTier = "free-local" | "free-remote" | "paid";

export interface ChatRequest {
  lane: Lane;
  system: string;
  messages: ChatMessage[];
  /** Ask the provider for strict JSON. Providers that cannot must reject. */
  jsonSchema?: object;
  maxTokens?: number;
  temperature?: number;
  /** Hard deadline. The router aborts and falls through on expiry. */
  timeoutMs: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatChunk {
  delta: string;
  done: boolean;
}

export interface VisionRequest {
  imagePath: string;
  prompt: string;
  /** When set, the provider must return JSON matching this shape. */
  jsonSchema?: object;
  timeoutMs: number;
}

export interface VisionResult {
  /** What was seen, in words. This is the durable record. Always present. */
  qualitative: string;
  /** Optional structured extraction. May be null if the model was unsure. */
  structured: object | null;
  /** Honest self-assessment, 0..1. Providers that cannot produce this return 0.5. */
  confidence: number;
}

/** Emitted for every router call. This is how we learn what to change. */
export interface RouterTrace {
  requestId: string;
  lane: Lane;
  providerId: string;
  costTier: CostTier;
  latencyMs: number;
  /** 0 = first choice served it. >0 = fallbacks were used. */
  fallbackDepth: number;
  ok: boolean;
  error?: string;
}
