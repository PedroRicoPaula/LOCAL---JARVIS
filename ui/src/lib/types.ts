/**
 * ui/src/lib/types.ts — mirrors the wire subset of `shared/types.ts`.
 *
 * `ui/` is its own Next.js project (own `package.json`, own tsconfig root)
 * talking to `core` only over HTTP/WS, never importing it directly — so
 * unlike `core/skills/types.ts` (same process, can import the real file),
 * this is a hand-kept mirror. `shared/types.ts`'s own docstring names a
 * `make types` codegen step for Python; no such step exists yet for
 * TypeScript either (see docs/BACKLOG.md). Keep this in sync by hand
 * until that's built.
 */

export type Lane = "reflex" | "converse" | "reason" | "see" | "act";

export type Capability =
  | "MEMORY_READ"
  | "FS_READ"
  | "CAMERA"
  | "NET_READ"
  | "MEMORY_WRITE"
  | "FS_WRITE"
  | "GIT_WRITE"
  | "SHELL_EXEC"
  | "WEBHOOK";

export type ApprovalState = "pending" | "approved" | "rejected" | "expired" | "executed";

export interface ApprovalRequest {
  id: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  capability: Capability;
  skillId: string;
  humanSummary: string;
  payload: unknown;
  diff?: string;
  state: ApprovalState;
}

export interface ApprovalResponse {
  requestId: string;
  nonce: string;
  decision: "approve" | "reject";
  decidedAt: number;
}

export type EventKind = "utterance" | "response" | "observation" | "action" | "approval" | "rejection" | "note";

export interface MemoryEvent {
  id: string;
  ts: number;
  kind: EventKind;
  actor: "owner" | "jarvis" | "system";
  content: string;
  meta?: Record<string, unknown>;
  sessionId?: string;
}

export type SkillStatus = "loaded" | "disabled";

export interface SkillHealth {
  id: string;
  version: string;
  status: SkillStatus;
  lastError?: string;
  loadedAt?: number;
}

export type ServerEvent =
  | { type: "thought"; text: string; lane: Lane; ts: number }
  | { type: "approval.new"; request: ApprovalRequest }
  | { type: "approval.resolved"; requestId: string; state: ApprovalState }
  | { type: "transcript"; text: string; final: boolean; speaker: "owner" | "jarvis" }
  | { type: "speaking"; active: boolean }
  | { type: "camera"; active: boolean }
  | { type: "health"; providers: Record<string, boolean> };

export type ClientEvent =
  | { type: "approval.decide"; response: ApprovalResponse }
  | { type: "mute"; category: string; muted: boolean };
