/**
 * shared/types/skill.ts -- the skill contract (SkillInput/SkillResult) and
 * the manifest/routing shapes (docs/SKILLS.md). Split out of
 * shared/types.ts, 2026-08-12 -- these were two separate sections in the
 * original file (the runtime contract and the manifest), combined here
 * since both are "skill" types and neither is large enough alone to
 * justify its own file.
 */

import type { Capability } from "./capability.ts";
import type { Lane } from "./router.ts";
import type { MemoryEvent } from "./memory.ts";

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface SkillInput {
  utterance: string;
  intent: string;
  sessionId: string;
  /** Populated only when the intent requires an image. */
  imagePath?: string;
}

export interface SkillResult {
  /** Spoken to the owner. Streamed sentence by sentence. */
  speech: string;
  /** Optional richer payload for the dashboard. */
  display?: unknown;
  /** Events the skill wants written. Subject to MEMORY_WRITE approval. */
  remember?: Omit<MemoryEvent, "id" | "ts">[];
}

// ---------------------------------------------------------------------------
// Skills -- see docs/SKILLS.md
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Skills — see docs/SKILLS.md
// ---------------------------------------------------------------------------

export interface SkillIntent {
  id: string;
  description: string;
  /**
   * Embedded at load time and used for routing. Not documentation.
   * Write them the way you actually speak, including terse and sloppy forms.
   * Five to eight per intent.
   */
  examples: string[];
  lanes: Lane[];
  requiresCamera?: boolean;
}

export interface SkillManifest {
  id: string;
  version: string;
  description: string;
  intents: SkillIntent[];
  capabilities: Capability[];
  /** Labels the skill in the dashboard and tightens gate defaults. */
  sensitivity?: "normal" | "personal";
}

export type SkillStatus = "loaded" | "disabled";

export interface SkillHealth {
  id: string;
  version: string;
  status: SkillStatus;
  lastError?: string;
  loadedAt?: number;
}

/** Logged for every dispatch. When the wrong skill fires, this says why. */
export interface SkillRoutingTrace {
  utterance: string;
  lane: Lane;
  candidates: { skillId: string; intentId: string; score: number }[];
  chosen?: { skillId: string; intentId: string };
  /** True when the embedding match was ambiguous and a model broke the tie. */
  disambiguated: boolean;
}
