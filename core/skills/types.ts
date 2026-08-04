/**
 * core/skills/types.ts — the skill host's own interfaces (`docs/SKILLS.md`
 * §§ 3-4). Like `ModelProvider` (Phase 3) and `Memory` (Phase 4), these
 * live in `core/`, not `shared/types.ts`: skills run in the same process
 * as `core`, never across a real boundary — `shared/types.ts` stays
 * reserved for core↔ui, core↔senses, core↔skills *wire* shapes
 * (`SkillManifest`, `SkillInput`, `SkillResult` already live there because
 * a manifest is data a skill exports and the host reads, not a live
 * object with methods).
 */

import type {
  ApprovalOutcome,
  CameraHandle,
  Fact,
  MemoryEvent,
  ProposedAction,
  SkillInput,
  SkillManifest,
  SkillResult,
  VisionRequest,
  VisionResult,
} from "../../shared/types.ts";
import type { Memory } from "../memory/memory.ts";

// ---------------------------------------------------------------------------
// Router — the narrow slice of core/router a skill actually needs
// ---------------------------------------------------------------------------

export interface Router {
  /** Non-streaming text completion through a lane's provider chain — a
   * skill calls `ctx.say()` separately for what the owner actually hears,
   * so it wants a full string back here, not a chunk stream. */
  complete(lane: "converse" | "reason", system: string, userText: string, opts?: { maxTokens?: number }): Promise<string>;
  see(req: VisionRequest): Promise<VisionResult>;
}

// ---------------------------------------------------------------------------
// Conversation — say()/ask(), the live half of SkillContext (docs/SKILLS.md
// § 4). No real voice-loop wiring (core <-> senses/ears/voice over IPC)
// exists yet in any phase's checklist — see PROGRESS.md's Phase 5 log.
// This is the seam a future integration phase plugs a real implementation
// into; `conversation/cli.ts` is a genuine (not fake) stdio implementation
// usable today for manual testing of the skill host end to end.
// ---------------------------------------------------------------------------

export interface Conversation {
  say(text: string): void;
  ask(question: string, opts?: { timeoutMs?: number }): Promise<string>;
}

// ---------------------------------------------------------------------------
// Skill-owned storage (docs/SKILLS.md § 1: "owns its tables, prefixed
// skill_<id>_")
// ---------------------------------------------------------------------------

export interface SkillStore {
  /** Runs `sql` against this skill's own namespace. Throws if `sql`
   * references a table not prefixed for this skill — see `store.ts`. */
  exec(sql: string): void;
  get<T = unknown>(sql: string, ...params: unknown[]): T | undefined;
  all<T = unknown>(sql: string, ...params: unknown[]): T[];
  run(sql: string, ...params: unknown[]): void;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// SkillContext / SkillInitContext (docs/SKILLS.md § 4)
// ---------------------------------------------------------------------------

export interface SkillContext {
  router: Router;
  memory: Memory;
  /** Only meaningfully usable if the manifest declares CAMERA — see
   * `camera.ts`'s stub (real implementation is Phase 8). */
  camera: CameraHandle;
  /** The only way to cause a side effect. Real implementation is Phase 6
   * (the gate) — see `gate.ts`'s stub. No skill built before Phase 6 may
   * declare a capability that needs it. */
  propose: (action: ProposedAction) => Promise<ApprovalOutcome>;
  say(text: string): void;
  ask(question: string, opts?: { timeoutMs?: number }): Promise<string>;
  store: SkillStore;
  sessionId: string;
  now(): number;
  log: Logger;
}

export type SkillInitContext = Pick<SkillContext, "memory" | "store" | "log">;

export interface Skill {
  readonly manifest: SkillManifest;
  init?(ctx: SkillInitContext): Promise<void>;
  handle(input: SkillInput, ctx: SkillContext): Promise<SkillResult>;
  cancel?(sessionId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Recalled facts/events, resolved for a skill's convenience — not part of
// the wire contract, just a shared shape between loader/dispatch/context.
// ---------------------------------------------------------------------------

export interface RecalledMemory {
  recentTurns: MemoryEvent[];
  facts: Fact[];
}
