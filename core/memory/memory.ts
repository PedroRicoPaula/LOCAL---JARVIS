/**
 * core/memory/memory.ts — the public `Memory` surface (SPEC.md § 5's
 * `SkillContext.memory: Memory`). Ties `db.ts`/`events.ts`/`facts.ts`/
 * `observations.ts`/`embeddings.ts`/`recall.ts` together into one object;
 * callers never touch the SQLite handle directly.
 */

import type { DatabaseSync } from "node:sqlite";
import type { Fact, FeedbackRating, Lane, MemoryEvent, Observation } from "../../shared/types.ts";
import { openDb } from "./db.ts";
import type { Embedder } from "./embeddings.ts";
import { indexText } from "./embeddings.ts";
import { appendEvent, getEvent, recentEvents, recentEventsForSession } from "./events.ts";
import { factsAboveConfidence, getFact, upsertFact } from "./facts.ts";
import { recentFeedback, setFeedback } from "./feedback.ts";
import { indexKeywords } from "./keywordSearch.ts";
import { addObservation, getObservation } from "./observations.ts";
import type { AssembledContext, RecallOptions } from "./recall.ts";
import { assembleContext } from "./recall.ts";
import { recentRoutingMisses, recordRoutingStat, routingStatsSince, type RoutingMiss, type RoutingStatRow } from "./routingStats.ts";

export class Memory {
  private readonly db: DatabaseSync;
  private readonly embedder: Embedder;

  constructor(db: DatabaseSync, embedder: Embedder) {
    this.db = db;
    this.embedder = embedder;
  }

  close(): void {
    this.db.close();
  }

  appendEvent(input: Omit<MemoryEvent, "id" | "ts"> & { ts?: number }): MemoryEvent {
    return appendEvent(this.db, input);
  }

  /** The indexing half of `remember()`, decoupled so a caller can
   * `appendEvent` synchronously (get the id immediately) and index
   * afterward without blocking on it -- found live, SOAK 1:
   * `core/main.ts` had only ever called plain `appendEvent` for real
   * conversation turns, never `remember`, so `memory_vec`/`events_fts`
   * had never actually indexed a single real utterance or response in
   * production -- semantic (and now keyword) recall silently returned
   * nothing for real conversations the whole time, with no error to
   * notice by (`assembleContext` degrades gracefully to recent-turns
   * -only, indistinguishable from "genuinely nothing relevant"). */
  async indexEvent(event: MemoryEvent): Promise<void> {
    await indexText(this.db, this.embedder, event.id, event.content);
    indexKeywords(this.db, event.id, event.content);
  }

  getEvent(id: string): MemoryEvent | null {
    return getEvent(this.db, id);
  }

  recentEventsForSession(sessionId: string, limit: number): MemoryEvent[] {
    return recentEventsForSession(this.db, sessionId, limit);
  }

  recentEvents(limit: number): MemoryEvent[] {
    return recentEvents(this.db, limit);
  }

  upsertFact(input: { key: string; value: string; confidence: number; sourceEventId?: string }): Fact {
    return upsertFact(this.db, input);
  }

  getFact(key: string): Fact | null {
    return getFact(this.db, key);
  }

  factsAboveConfidence(threshold?: number): Fact[] {
    return factsAboveConfidence(this.db, threshold);
  }

  addObservation(input: Omit<Observation, "id" | "ts"> & { ts?: number }): Observation {
    return addObservation(this.db, input);
  }

  getObservation(id: string): Observation | null {
    return getObservation(this.db, id);
  }

  recall(opts: RecallOptions): Promise<AssembledContext> {
    return assembleContext(this.db, this.embedder, opts);
  }

  setFeedback(eventId: string, rating: FeedbackRating): void {
    setFeedback(this.db, eventId, rating);
  }

  recentFeedback(limit: number): Record<string, FeedbackRating> {
    return recentFeedback(this.db, limit);
  }

  recordRoutingStat(input: { lane: Lane; skillId: string | null; intentId: string | null; matched: boolean; eventId?: string | null }): void {
    recordRoutingStat(this.db, input);
  }

  routingStatsSince(sinceTs: number): RoutingStatRow[] {
    return routingStatsSince(this.db, sinceTs);
  }

  recentRoutingMisses(limit: number): RoutingMiss[] {
    return recentRoutingMisses(this.db, limit);
  }
}
