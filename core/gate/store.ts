/**
 * core/gate/store.ts — the `approvals`/`audit_log` persistence layer for
 * `Gate` (`core/gate/gate.ts`), split out 2026-08-17 so the state-machine
 * logic in `gate.ts` isn't interleaved with raw SQL (CLAUDE.md § 3's
 * ~300-line guideline). Plain functions over a passed-in `DatabaseSync`,
 * the same shape `core/gate/db.ts` (schema) and `core/skills/store.ts`
 * already use — no class, no hidden state, `Gate` owns the only instance
 * that matters.
 */

import type { DatabaseSync } from "node:sqlite";
import { ulid } from "ulid";
import type { ApprovalRequest, ApprovalState, Capability } from "../../shared/types.ts";

export interface ApprovalRow {
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

export function rowToRequest(row: ApprovalRow): ApprovalRequest {
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

export function insertApproval(db: DatabaseSync, row: ApprovalRow): void {
  db.prepare(
    `INSERT INTO approvals (id, nonce, created_at, expires_at, capability, skill_id, human_summary, payload, diff, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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

export function getApprovalRow(db: DatabaseSync, id: string): ApprovalRow | null {
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as unknown as ApprovalRow | undefined;
  return row ?? null;
}

export function setApprovalState(db: DatabaseSync, id: string, state: ApprovalState): void {
  db.prepare("UPDATE approvals SET state = ? WHERE id = ?").run(state, id);
}

export function listPendingApprovals(db: DatabaseSync): ApprovalRow[] {
  return db.prepare("SELECT * FROM approvals WHERE state = 'pending' ORDER BY created_at").all() as unknown as ApprovalRow[];
}

export function insertAuditLog(db: DatabaseSync, approvalId: string | null, event: string, detail: Record<string, unknown>): void {
  db.prepare("INSERT INTO audit_log (id, ts, approval_id, event, detail) VALUES (?, ?, ?, ?, ?)").run(
    ulid(),
    Date.now(),
    approvalId,
    event,
    JSON.stringify(detail),
  );
}
