/**
 * core/memory/observations.ts — what the camera saw (SPEC.md § 4). Kept
 * separate from `events`/`facts` because vision output is unreliable by
 * nature (SPEC.md § 6/§ 7) and never becomes a stored quantity on its own.
 * The camera session itself is Phase 8's scope; this phase only owns the
 * table and the read/write primitives.
 */

import type { DatabaseSync } from "node:sqlite";
import { ulid } from "ulid";
import type { Observation } from "../../shared/types.ts";

interface ObservationRow {
  id: string;
  ts: number;
  image_path: string;
  provider: string;
  qualitative: string;
  structured: string | null;
  confidence: number;
}

function rowToObservation(row: ObservationRow): Observation {
  return {
    id: row.id,
    ts: row.ts,
    imagePath: row.image_path,
    provider: row.provider,
    qualitative: row.qualitative,
    structured: row.structured !== null ? (JSON.parse(row.structured) as object) : null,
    confidence: row.confidence,
  };
}

export function addObservation(
  db: DatabaseSync,
  input: Omit<Observation, "id" | "ts"> & { ts?: number },
): Observation {
  const observation: Observation = {
    id: ulid(),
    ts: input.ts ?? Date.now(),
    imagePath: input.imagePath,
    provider: input.provider,
    qualitative: input.qualitative,
    structured: input.structured,
    confidence: input.confidence,
  };

  db.prepare(
    "INSERT INTO observations (id, ts, image_path, provider, qualitative, structured, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    observation.id,
    observation.ts,
    observation.imagePath,
    observation.provider,
    observation.qualitative,
    observation.structured !== null ? JSON.stringify(observation.structured) : null,
    observation.confidence,
  );
  return observation;
}

export function getObservation(db: DatabaseSync, id: string): Observation | null {
  const row = db.prepare("SELECT * FROM observations WHERE id = ?").get(id) as unknown as ObservationRow | undefined;
  return row ? rowToObservation(row) : null;
}
