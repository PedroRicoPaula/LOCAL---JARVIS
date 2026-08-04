/**
 * core/gate/db.ts — schema for `approvals` and `audit_log`. Not part of
 * `core/memory/db.ts`'s schema (`events`/`facts`/`observations`/
 * `memory_vec`): the gate is its own concern (CLAUDE.md § 5), applied to
 * the same database file via the same `DatabaseSync` handle, the same
 * pattern `core/skills/store.ts` uses for skill-owned tables.
 *
 * `audit_log` is append-only for the same reason `events` is (SPEC.md
 * § 4 / CLAUDE.md § 5: "The audit log is append-only. Rejections are
 * logged too.") — enforced by the same kind of `RAISE(ABORT)` triggers
 * Phase 4 used for `events`, not left to convention.
 */

import type { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS approvals (
  id            TEXT PRIMARY KEY,       -- ulid
  nonce         TEXT NOT NULL UNIQUE,   -- single-use
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  capability    TEXT NOT NULL,
  skill_id      TEXT NOT NULL,
  human_summary TEXT NOT NULL,
  payload       TEXT NOT NULL,          -- JSON
  diff          TEXT,
  state         TEXT NOT NULL           -- pending|approved|rejected|expired|executed
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,         -- ulid
  ts          INTEGER NOT NULL,
  approval_id TEXT,                     -- null only for events with no single approval to point at
  event       TEXT NOT NULL,            -- created|approved|rejected|expired|executed|replay_rejected|green_auto_run
  detail      TEXT                      -- JSON
);

CREATE TRIGGER IF NOT EXISTS audit_log_no_update
BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only, never UPDATE'); END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete
BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is append-only, never DELETE'); END;
`;

export function ensureGateSchema(db: DatabaseSync): void {
  db.exec(SCHEMA);
}
