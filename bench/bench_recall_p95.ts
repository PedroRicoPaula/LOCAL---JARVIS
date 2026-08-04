/**
 * bench/bench_recall_p95.ts — Phase 4 DoD: "Recall p95 < 200ms over 10k
 * synthetic events."
 *
 * "Synthetic" means exactly that: 10k events with random embeddings
 * inserted directly, not 10k real embedding calls through Ollama — the
 * number being measured is `assembleContext()`'s own query latency
 * (SQL + vector search + assembly), not embedding-generation time, which
 * is a separate, already-understood cost living in the `ollama` provider.
 *
 * Usage: node bench/bench_recall_p95.ts
 */

import { openDb, EMBEDDING_DIMENSIONS } from "../core/memory/db.ts";
import { appendEvent } from "../core/memory/events.ts";
import { assembleContext } from "../core/memory/recall.ts";
import type { Embedder } from "../core/memory/embeddings.ts";

const N_EVENTS = 10_000;
const N_QUERIES = 200;

function randomVector(): number[] {
  const v = Array.from({ length: EMBEDDING_DIMENSIONS }, () => Math.random() - 0.5);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

// A query still needs *an* embedding — this fixed one is fine, only
// assembleContext()'s own latency is being measured, not embedding cost.
const queryVector = randomVector();
const fixedEmbedder: Embedder = { embed: async (texts) => texts.map(() => queryVector) };

async function main(): Promise<number> {
  const db = openDb(":memory:");

  console.log(`inserting ${N_EVENTS} synthetic events + embeddings...`);
  const insertEvent = db.prepare(
    "INSERT INTO events (id, ts, kind, actor, content, meta, session_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const insertVec = db.prepare("INSERT INTO memory_vec (embedding, ref_id) VALUES (?, ?)");
  for (let i = 0; i < N_EVENTS; i++) {
    const id = `synthetic-${i}`;
    insertEvent.run(id, i, "utterance", "owner", `synthetic event number ${i}`, null, "synthetic-session");
    insertVec.run(JSON.stringify(randomVector()), id);
  }
  // One real session's worth of "current" turns, for the "always included" part.
  for (let i = 0; i < 10; i++) {
    appendEvent(db, { kind: "utterance", actor: "owner", content: `real turn ${i}`, sessionId: "bench-session" });
  }

  console.log(`running ${N_QUERIES} recall() calls...`);
  const latencies: number[] = [];
  for (let i = 0; i < N_QUERIES; i++) {
    const start = performance.now();
    await assembleContext(db, fixedEmbedder, { sessionId: "bench-session", queryText: "query" });
    latencies.push(performance.now() - start);
  }

  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)]!;
  const median = latencies[Math.floor(latencies.length / 2)]!;

  console.log(`\n  median  ${median.toFixed(2)}ms`);
  console.log(`  p95     ${p95.toFixed(2)}ms   (need < 200ms)`);
  console.log(`\n  ${p95 < 200 ? "PASS" : "FAIL"}`);

  db.close();
  return p95 < 200 ? 0 : 1;
}

main().then((code) => process.exit(code));
