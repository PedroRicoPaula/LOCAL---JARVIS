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
import { addObservation, getObservation } from "./observations.ts";
import type { AssembledContext, RecallOptions } from "./recall.ts";
import { assembleContext } from "./recall.ts";
import { recordRoutingStat, routingStatsSince, type RoutingStatRow } from "./routingStats.ts";

export class Memory {
  private readonly db: DatabaseSync;
  private readonly embedder: Embedder;

  constructor(db: DatabaseSync, embedder: Embedder) {
    this.db = db;
    this.embedder = embedder;
  }

  static open(path: string, embedder: Embedder): Memory {
    return new Memory(openDb(path), embedder);
  }

  close(): void {
    this.db.close();
  }

  /** Appends the event and indexes it for semantic recall in one step —
   * the two are meant to always happen together for anything recall
   * should be able to find later. Use `appendEvent` alone for events that
   * shouldn't be semantically searchable (rare; none yet). */
  async remember(input: Omit<MemoryEvent, "id" | "ts"> & { ts?: number }): Promise<MemoryEvent> {
    const event = appendEvent(this.db, input);
    await indexText(this.db, this.embedder, event.id, event.content);
    return event;
  }

  appendEvent(input: Omit<MemoryEvent, "id" | "ts"> & { ts?: number }): MemoryEvent {
    return appendEvent(this.db, input);
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

  recordRoutingStat(input: { lane: Lane; skillId: string | null; intentId: string | null; matched: boolean }): void {
    recordRoutingStat(this.db, input);
  }

  routingStatsSince(sinceTs: number): RoutingStatRow[] {
    return routingStatsSince(this.db, sinceTs);
  }
}
