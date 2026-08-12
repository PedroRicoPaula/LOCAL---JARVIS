# Phase 4 — built, 2026-08-04

**Built:**
- `core/memory/db.ts`: opens the SQLite database, loads `sqlite-vec`,
  creates `events`/`facts`/`observations`/`memory_vec` if not present.
  Append-only enforcement on `events` is two `BEFORE UPDATE`/`BEFORE
  DELETE` triggers that `RAISE(ABORT, ...)` — confirmed live that both
  raise a catchable error, not just a silent no-op.
- `core/memory/events.ts`, `facts.ts`, `observations.ts`: typed
  read/write primitives over each table, mapping snake_case rows to
  `shared/types.ts`'s `MemoryEvent`/`Fact`/`Observation`. `facts.ts` is
  the one table meant to be updated (`UNIQUE(key)` + upsert) — "durable,
  editable beliefs," deliberately not append-only like `events`.
- `core/memory/embeddings.ts`: `indexText()`/`semanticSearch()` against
  `memory_vec`, behind a minimal `Embedder` interface
  (`OllamaProvider` from Phase 3 already satisfies it structurally —
  no new provider code needed).
- `core/memory/recall.ts`: `assembleContext()` implements SPEC.md § 4's
  three-step recall policy (recent turns always, then semantic matches,
  then facts above a confidence floor) with a hard character cap —
  pieces that wouldn't fit are skipped whole, never truncated mid-text,
  so "never exceeds the cap" is exact and simple to test.
- `core/memory/memory.ts`: the public `Memory` class (`SPEC.md` § 5's
  `SkillContext.memory: Memory`) tying the above together; `remember()`
  appends and indexes in one call for anything recall should be able to
  find later.
- `bench/bench_recall_p95.ts`: Phase 4's DoD instrument — 10k synthetic
  events with random embeddings inserted directly (not through real
  Ollama calls — the number being measured is `assembleContext()`'s own
  query latency, not embedding-generation time, a separate and
  already-understood cost).
- 26 new tests (63 TS total, 83 across both languages), `node --test`,
  zero network, zero models loaded — including a `FakeEmbedder`
  (deterministic bag-of-words hashing: shared words embed closer
  together) and a `ScriptedEmbedder`/`orthogonalVector` pair for tests
  needing exact control over similarity/distance.

**DoD — measured:**
- **`UPDATE events` raises:** PASS, both `UPDATE` and `DELETE` — tested
  and confirmed live.
- **Recall p95 < 200ms over 10k synthetic events:** **12.43ms**
  (median 11.96ms), `bench/bench_recall_p95.ts`, in-memory DB.
- **Assembled context never exceeds the cap:** PASS — tested with 50
  qualifying events against a deliberately tight cap; `text.length`
  never exceeds it, `truncated` flags correctly.
- **Three facts told across three sessions, all recalled correctly in a
  fourth:** PASS as a *mechanism* test — `memory.test.ts` stores three
  facts via `upsertFact()` across three simulated sessions and confirms
  all three are recalled via `factsAboveConfidence()` in a fourth. This
  is not yet the literal owner experience the DoD describes ("told"
  implies speaking to it) — nothing can *tell* Memory something by voice
  until Phase 5 gives it a skill to talk through. The storage/recall
  mechanism itself is what this phase owns and what's proven; the full
  voice-in experience is Phase 5's to prove. Flagged plainly rather than
  claimed as more than it is.

**Decided:**
- **`memory_vec`'s embedding dimension is 1024, not `SPEC.md` § 4's
  literal `float[768]`.** That number assumed `nomic-embed-text`; Phase 3
  had already pulled and wired `mxbai-embed-large` (1024-dim, and
  generally the stronger of the two on public benchmarks) as the
  `ollama` provider's embed model. Adjusting the schema to the model
  actually in use, rather than switching models to match a schema number
  that was only ever illustrative, kept one fewer moving part.
- **`memory_vec` uses `distance_metric=cosine`, not `sqlite-vec`'s L2
  default.** SPEC.md § 4's recall policy asks for a "similarity floor" —
  cosine distance is bounded (0 = identical, 1 = orthogonal, ~2 =
  opposite), so a floor on it reads naturally as a similarity threshold.
  L2/euclidean distance has no such natural bound to floor against.
  Confirmed live: `distance_metric=cosine` is a real `sqlite-vec` column
  option, not an assumption.
- **`node:sqlite` (built into Node, Experimental) over `better-sqlite3`
  (a compiled native addon).** Smaller supply-chain surface for a
  single-owner project (CLAUDE.md § 3) — no native compile step, no
  prebuilt-binary-per-platform story to maintain beyond what `sqlite-vec`
  itself already ships. The Experimental status is a real, accepted
  risk: this is a local, single-writer file database, not a concurrent
  multi-user service, so API churn is cheap to absorb if it happens.
  `better-sqlite3` is the documented fallback.
- **Facts are recalled by confidence threshold only, not semantic
  search, in this phase.** SPEC.md § 4's recall policy step 3 doesn't
  ask for semantic fact matching — only `events` are indexed into
  `memory_vec`. Adding semantic fact search now would be building ahead
  of an actual need (CLAUDE.md § 0.6); revisit if a real use case shows
  the confidence-threshold-only approach missing something.
- **The context cap is character-based, not a real tokenizer count.** A
  tokenizer is another dependency for a number that only has to be a
  reasonable, consistent budget, not billing-accurate. Documented
  plainly in `recall.ts` rather than implied to be more precise than
  it is.

**Surprised me:**
- **`sqlite-vec`'s npm package needs a JSON-array string for inserts and
  queries, not a raw binary blob**, despite `vec0` columns being typed
  `float[N]`. A first attempt passed a `Float32Array.buffer` (an
  `ArrayBuffer`) and got a genuinely confusing error — `"JSON array
  parsing error: Input does not start with '['"` — because `node:sqlite`
  doesn't automatically recognize an `ArrayBuffer` as a blob parameter
  the way some SQLite bindings do; `sqlite-vec` then tried to parse
  whatever it received as JSON text instead. `JSON.stringify(vector)`
  works cleanly and is what's used throughout. Confirmed with a small
  standalone script before writing any real code against it, rather than
  discovering this via a failing test later.
- **`sqlite-vec`'s package is CommonJS-default under `require()` but
  named-exports-only under real ESM `import`** — `import sqliteVec from
  "sqlite-vec"` type-checked fine (an artifact of `esModuleInterop`) but
  failed at runtime with `"does not provide an export named
  'default'"`, only surfacing when tests actually ran, not at `tsc
  --noEmit`. Fixed with `import { load } from "sqlite-vec"`. A reminder
  that `esModuleInterop` makes a default import type-check against a CJS
  module without guaranteeing it'll actually work at runtime under
  `"module": "NodeNext"` — worth an actual test run, not just a clean
  `tsc`, before trusting an import shape for a new dependency.
- **`node:sqlite` rows have a `null`-prototype**, not a plain `Object`
  one — `assert.deepEqual(row, { ref_id: "ref-a" })` failed on a
  prototype mismatch even though every property matched. Every other
  test compares through this module's own row-to-domain-object mapping
  functions (`rowToEvent`, `rowToFact`, `rowToObservation`), which build
  plain object literals and don't have this problem; only the one test
  asserting directly against a raw `.get()` result hit it. Fixed by
  comparing the specific field instead of the whole object.

---
