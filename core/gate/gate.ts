/**
 * core/gate/gate.ts — the `ApprovalRequest` lifecycle (SPEC.md § 8):
 *
 *   pending --approve--> approved --execute--> executed
 *      |
 *      +--reject--> rejected
 *      +--timeout-> expired
 *
 * State lives here, server-side (`core`), enforced by this module alone —
 * "the dashboard is a view, never an authority" (SPEC.md § 8) applies
 * just as much to the CLI in `cli.ts` before a dashboard exists.
 *
 * A green-tier `ProposedAction` skips this lifecycle entirely — it runs
 * unprompted, per CLAUDE.md § 5's table, but is still logged (SPEC.md § 8
 * / CLAUDE.md § 5: every tier is logged, only yellow/red block).
 */

import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { ulid } from "ulid";
import type {
  ApprovalOutcome,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalState,
  Capability,
  ProposedAction,
} from "../../shared/types.ts";
import { GREEN_CAPABILITIES } from "../../shared/types.ts";
import { ensureGateSchema } from "./db.ts";
import { sign } from "./hmac.ts";

export const DEFAULT_EXPIRY_MS = 5 * 60_000; // SPEC.md SS8: "expiresAt (default 5 min)"

export type CapabilityTier = "green" | "yellow";

/** Red capabilities have no representation in the `Capability` type at
 * all (see shared/types.ts's own comment) -- nothing here can be asked to
 * classify one, by construction, matching CLAUDE.md § 5's "never
 * proposed by a model." */
export function capabilityTier(capability: Capability): CapabilityTier {
  return GREEN_CAPABILITIES.includes(capability) ? "green" : "yellow";
}

interface ApprovalRow {
  id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  capability: string;
  skill_id: string;
  human_summary: string;
  payload: string;
  diff: string | null;
  state: ApprovalState;
}

interface PendingEntry {
  resolve: (outcome: ApprovalOutcome) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

function rowToRequest(row: ApprovalRow): ApprovalRequest {
  const request: ApprovalRequest = {
    id: row.id,
    nonce: row.nonce,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    capability: row.capability as Capability,
    skillId: row.skill_id,
    humanSummary: row.human_summary,
    payload: JSON.parse(row.payload),
    state: row.state,
  };
  if (row.diff !== null) request.diff = row.diff;
  return request;
}

/** Emits `"approval.new"` (full `ApprovalRequest`, wire-shaped) and
 * `"approval.resolved"` (`{requestId, state}`) — `core/ws.ts` (Phase 7)
 * subscribes to these to broadcast `ServerEvent`s to the dashboard. The
 * dashboard is a *view*: it hears about state changes here, it never
 * causes one except through `decide()` (SPEC.md § 8). */
export class Gate extends EventEmitter {
  private readonly db: DatabaseSync;
  private readonly signingKey: string;
  private readonly pending = new Map<string, PendingEntry>();

  constructor(db: DatabaseSync, signingKey: string) {
    super();
    this.db = db;
    this.signingKey = signingKey;
    ensureGateSchema(db);
  }

  async propose(action: ProposedAction, skillId: string, now: () => number = Date.now): Promise<ApprovalOutcome> {
    const tier = capabilityTier(action.capability);

    if (tier === "green") {
      this.logAudit(null, "green_auto_run", { capability: action.capability, skillId, humanSummary: action.humanSummary });
      return { ok: true, result: action.payload };
    }

    const id = ulid();
    const nonce = randomUUID();
    const createdAt = now();
    const expiresAt = createdAt + (action.expiresInMs ?? DEFAULT_EXPIRY_MS);

    const row: ApprovalRow = {
      id,
      nonce,
      created_at: createdAt,
      expires_at: expiresAt,
      capability: action.capability,
      skill_id: skillId,
      human_summary: action.humanSummary,
      payload: JSON.stringify(action.payload),
      diff: action.diff ?? null,
      state: "pending",
    };
    this.insertApproval(row);
    this.logAudit(id, "created", { capability: action.capability, skillId, humanSummary: action.humanSummary });
    this.emit("approval.new", rowToRequest(row));

    return new Promise<ApprovalOutcome>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(id);
        this.setState(id, "expired");
        this.logAudit(id, "expired", {});
        this.emit("approval.resolved", { requestId: id, state: "expired" });
        resolve({ ok: false, reason: "expired" });
      }, Math.max(0, expiresAt - createdAt));
      this.pending.set(id, { resolve, timeoutHandle });
    });
  }

  /** The only way a `pending` approval is ever resolved by an owner
   * decision. A response for anything not currently `pending` — already
   * decided, already expired, or a nonce that doesn't match — fails
   * closed and is logged as a rejection with `reason: "replay"`,
   * verbatim SPEC.md § 8's own wording. */
  decide(response: ApprovalResponse, now: () => number = Date.now): void {
    const row = this.getApprovalRow(response.requestId);

    if (!row || row.state !== "pending" || row.nonce !== response.nonce) {
      this.logAudit(response.requestId, "rejected", { reason: "replay" });
      return;
    }

    if (now() > row.expires_at) {
      this.settlePending(row.id, "expired", { ok: false, reason: "expired" });
      return;
    }

    if (response.decision === "approve") {
      const signed = sign(this.signingKey, row.id, row.nonce, JSON.parse(row.payload), now());
      this.settlePending(row.id, "approved", { ok: true, result: signed });
    } else {
      this.settlePending(row.id, "rejected", { ok: false, reason: "rejected" });
    }
  }

  /** Called by an executor (Phase 12+) once it has verified the signed
   * execution and actually performed the action. Not exercised by any
   * real caller yet -- `core/executors/` is still empty (README.md) —
   * built now so the lifecycle SPEC.md § 8 describes is complete and
   * tested, not half-implemented. */
  markExecuted(id: string): boolean {
    const row = this.getApprovalRow(id);
    if (!row || row.state !== "approved") return false;
    this.setState(id, "executed");
    this.logAudit(id, "executed", {});
    return true;
  }

  getApproval(id: string): ApprovalRow | null {
    return this.getApprovalRow(id);
  }

  listPending(): ApprovalRow[] {
    return (
      this.db.prepare("SELECT * FROM approvals WHERE state = 'pending' ORDER BY created_at").all() as unknown as ApprovalRow[]
    );
  }

  /** Wire-shaped, for a freshly opened dashboard tab to backfill —
   * `"approval.new"` is a live broadcast, not a replay log (SPEC.md § 8:
   * "close the browser mid-approval, request survives, still pending"
   * means this endpoint, not WS history). */
  listPendingRequests(): ApprovalRequest[] {
    return this.listPending().map(rowToRequest);
  }

  private settlePending(id: string, state: ApprovalState, outcome: ApprovalOutcome): void {
    const entry = this.pending.get(id);
    if (entry) {
      clearTimeout(entry.timeoutHandle);
      this.pending.delete(id);
    }
    this.setState(id, state);
    this.logAudit(id, state === "approved" ? "approved" : state, {});
    this.emit("approval.resolved", { requestId: id, state });
    entry?.resolve(outcome);
  }

  private insertApproval(row: ApprovalRow): void {
    this.db
      .prepare(
        `INSERT INTO approvals (id, nonce, created_at, expires_at, capability, skill_id, human_summary, payload, diff, state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.nonce,
        row.created_at,
        row.expires_at,
        row.capability,
        row.skill_id,
        row.human_summary,
        row.payload,
        row.diff,
        row.state,
      );
  }

  private getApprovalRow(id: string): ApprovalRow | null {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as unknown as ApprovalRow | undefined;
    return row ?? null;
  }

  private setState(id: string, state: ApprovalState): void {
    this.db.prepare("UPDATE approvals SET state = ? WHERE id = ?").run(state, id);
  }

  private logAudit(approvalId: string | null, event: string, detail: Record<string, unknown>): void {
    this.db
      .prepare("INSERT INTO audit_log (id, ts, approval_id, event, detail) VALUES (?, ?, ?, ?, ?)")
      .run(ulid(), Date.now(), approvalId, event, JSON.stringify(detail));
  }
}
