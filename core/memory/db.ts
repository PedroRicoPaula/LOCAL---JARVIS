/**
 * core/memory/db.ts — opens the SQLite database (SPEC.md § 4's schema),
 * loads `sqlite-vec`, and creates the schema if it isn't there yet.
 *
 * `node:sqlite` (built into Node, no native compile step) over
 * `better-sqlite3` (a compiled native addon) — smaller supply-chain
 * surface for a single-owner, boring-by-default project (CLAUDE.md § 3).
 * It's still Experimental (Node prints a warning on every import) — a real
 * risk, accepted deliberately: this is a local, single-writer file
 * database, not a concurrent multi-user service, so the kind of API
 * churn Experimental status implies is cheap to absorb if it happens.
 * `better-sqlite3` is the documented fallback if it ever doesn't hold.
 * See DECISIONS.md's Phase 4 ADR.
 *
 * `memory_vec`'s embedding dimension is 1024, not SPEC.md § 4's literal
 * `float[768]` — that number assumed `nomic-embed-text`; this project
 * already had `mxbai-embed-large` (1024-dim) pulled and wired as the
 * `ollama` provider's embed model in Phase 3. Also documented in
 * DECISIONS.md.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { load as loadSqliteVec } from "sqlite-vec";

export const EMBEDDING_DIMENSIONS = 1024;

const SCHEMA = `
-- Append-only. Never UPDATE, never DELETE. The spine of everything.
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,            -- ulid
  ts          INTEGER NOT NULL,            -- epoch ms
  kind        TEXT NOT NULL,               -- utterance|response|observation|action|approval|rejection|note
  actor       TEXT NOT NULL,               -- owner|jarvis|system
  content     TEXT NOT NULL,               -- human-readable
  meta        TEXT,                        -- JSON
  session_id  TEXT
);

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'events is append-only, never UPDATE'); END;

CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'events is append-only, never DELETE'); END;

-- Durable, editable beliefs about the owner. Derived from events.
CREATE TABLE IF NOT EXISTS facts (
  id           TEXT PRIMARY KEY,
  key          TEXT NOT NULL,              -- "diet.avoids", "project.hoqueimanager.stack"
  value        TEXT NOT NULL,
  confidence   REAL NOT NULL,              -- 0..1, honest
  source_event TEXT REFERENCES events(id),
  updated_at   INTEGER NOT NULL,
  UNIQUE(key)
);

-- What the camera saw. Kept separate because it is unreliable by nature.
CREATE TABLE IF NOT EXISTS observations (
  id          TEXT PRIMARY KEY,
  ts          INTEGER NOT NULL,
  image_path  TEXT NOT NULL,               -- local only, never uploaded unless lane=nim
  provider    TEXT NOT NULL,
  qualitative TEXT NOT NULL,               -- what was seen, in words
  structured  TEXT,                        -- JSON, may be null
  confidence  REAL NOT NULL
);
`;

export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path, { allowExtension: true });
  loadSqliteVec(db);
  db.exec(SCHEMA);
  // cosine, not the vec0 default (L2/euclidean): bounded 0 (identical) to
  // ~2 (opposite), 1 = orthogonal — a threshold on this reads naturally as
  // a "similarity floor" (SPEC.md § 4's recall policy step 2). L2 distance
  // has no such natural bound to floor against.
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(embedding float[${EMBEDDING_DIMENSIONS}] distance_metric=cosine, ref_id TEXT)`,
  );
  return db;
}
