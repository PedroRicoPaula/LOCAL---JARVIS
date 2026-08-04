/**
 * core/memory/feedback.ts — the owner's up/down rating of a `jarvis`
 * response (SOAK 1). One row per event id, last rating wins; see
 * `db.ts`'s `event_feedback` table for why this is separate from
 * `events` (append-only, no place to hang a rating) and never fed into
 * recall.
 */

import type { DatabaseSync } from "node:sqlite";
import type { FeedbackRating } from "../../shared/types.ts";

interface FeedbackRow {
  event_id: string;
  rating: string;
}

export function setFeedback(db: DatabaseSync, eventId: string, rating: FeedbackRating, ts: number = Date.now()): void {
  db.prepare(
    `INSERT INTO event_feedback (event_id, rating, created_at) VALUES (?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET rating = excluded.rating, created_at = excluded.created_at`,
  ).run(eventId, rating, ts);
}

/** Most recent ratings, as a map for the dashboard to merge onto its own
 * transcript backfill -- bounded, not the whole table's history. */
export function recentFeedback(db: DatabaseSync, limit: number): Record<string, FeedbackRating> {
  const rows = db
    .prepare("SELECT event_id, rating FROM event_feedback ORDER BY created_at DESC LIMIT ?")
    .all(limit) as unknown as FeedbackRow[];
  const out: Record<string, FeedbackRating> = {};
  for (const row of rows) out[row.event_id] = row.rating as FeedbackRating;
  return out;
}
