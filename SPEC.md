# SPEC.md — JARVIS Architecture

Version 0.1 · Owner: Pedro · Target: macOS, Apple Silicon · Language: English

---

## 1. What this is

A local-first personal assistant that listens, sees on request, remembers, and
teaches. It proposes; the owner disposes. It is a **platform plus skills**, not a
monolith.

Design goals, in priority order:

1. **Correct over impressive.** It says "I don't know" fluently.
2. **Local by default.** Voice never leaves the machine. Heavy reasoning may.
3. **Free by default.** Paid providers plug into the same interface.
4. **Owner-gated.** No side effects without recorded approval.
5. **Additive.** New capabilities are skills, not surgery.

Non-goals: multi-user, client-facing, cloud-hosted, real-time continuous video.

---

## 2. Processes

Five processes. They communicate over a local Unix socket + WebSocket. None of
them share a database connection except `core`.

```
senses/ears     Python   wake word → VAD → STT → text        launchd, always on
senses/eyes     Python   camera capture on demand            launchd, idle
senses/voice    Python   streaming TTS                       launchd, idle
core/           Node/TS  router · memory · gate · skills      the brain
ui/             Next.js  dashboard · approvals                on demand
```

Only `core` writes to the database. Only executors invoked *by the gate* cause
side effects. `ears`, `eyes`, `voice` and `ui` are incapable of side effects by
construction — they have no executor imports.

---

## 3. The Router

The single most important component. All model access goes through it.

### Lanes

| Lane | Budget | Default provider | Used for |
|---|---|---|---|
| `reflex` | < 300 ms | rules + local 1–4B | "stop", "repeat", "what time", wake acknowledgement |
| `converse` | < 1.5 s | local 8–14B | dialogue, intent classification, summarising loaded data |
| `reason` | 3–15 s | NVIDIA NIM (free) | analysis, teaching, planning, anything where wrong is costly |
| `see` | 2–10 s | local VLM → NIM VLM | image understanding |
| `act` | minutes | Aider + `reason` provider | code, files, multi-step work |

**The `converse` lane classifies which lane a request belongs to.** That is its
most important job and the thing to benchmark hardest.

### Provider interface

```ts
export interface ModelProvider {
  readonly id: string;                    // "ollama" | "nim" | "anthropic" | ...
  readonly lanes: readonly Lane[];        // which lanes it can serve
  readonly costTier: "free-local" | "free-remote" | "paid";

  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  vision?(req: VisionRequest): Promise<VisionResult>;
  embed?(texts: string[]): Promise<number[][]>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
```

Rules:

- Providers are registered in `core/providers/registry.ts`. Adding one is a file
  plus a config line — never a change to calling code.
- Each lane has an **ordered** provider list. On failure or timeout, the router
  falls through to the next. Falling back to a *worse* provider is correct;
  failing the request is not.
- Every lane must have at least one `free-local` fallback, even a degraded one.
  The system must remain usable with no internet.
- The router logs which provider served each request. This is how we learn.

### Providers at v0.1

| id | Lane coverage | Notes |
|---|---|---|
| `ollama` | reflex, converse, see, embed | `http://localhost:11434`, OpenAI-compatible |
| `nim` | reason, see | `https://integrate.api.nvidia.com/v1`, OpenAI-compatible, ~40 RPM free |
| _(paid slot)_ | — | **Deferred.** No paid provider is built or configured. The `ModelProvider` interface exists so one can be added later as a file plus a config line. See ADR-009. |

Rate limiting: the `nim` provider enforces its own token bucket at 30 RPM
(below the ~40 RPM observed ceiling) and surfaces `429` as a fallback trigger,
not an error.

---

## 4. Memory

Without this, JARVIS is a chatbot. With it, it is a coach.

### Schema (SQLite)

```sql
-- Append-only. Never UPDATE, never DELETE. The spine of everything.
CREATE TABLE events (
  id          TEXT PRIMARY KEY,            -- ulid
  ts          INTEGER NOT NULL,            -- epoch ms
  kind        TEXT NOT NULL,               -- utterance|response|observation|action|approval|rejection|note
  actor       TEXT NOT NULL,               -- owner|jarvis|system
  content     TEXT NOT NULL,               -- human-readable
  meta        TEXT,                        -- JSON
  session_id  TEXT
);

-- Durable, editable beliefs about the owner. Derived from events.
CREATE TABLE facts (
  id           TEXT PRIMARY KEY,
  key          TEXT NOT NULL,              -- "diet.avoids", "project.hoqueimanager.stack"
  value        TEXT NOT NULL,
  confidence   REAL NOT NULL,              -- 0..1, honest
  source_event TEXT REFERENCES events(id),
  updated_at   INTEGER NOT NULL,
  UNIQUE(key)
);

-- What the camera saw. Kept separate because it is unreliable by nature.
CREATE TABLE observations (
  id          TEXT PRIMARY KEY,
  ts          INTEGER NOT NULL,
  image_path  TEXT NOT NULL,               -- local only, never uploaded unless lane=nim
  provider    TEXT NOT NULL,
  qualitative TEXT NOT NULL,               -- what was seen, in words
  structured  TEXT,                        -- JSON, may be null
  confidence  REAL NOT NULL
);

-- Vector index for semantic recall over events + facts.
CREATE VIRTUAL TABLE memory_vec USING vec0(
  embedding float[768],
  ref_id TEXT
);
```

Embeddings come from Ollama (`nomic-embed-text` or equivalent) — local, free.
Search is `sqlite-vec`. No external vector database.

### Recall policy

Before any `converse` or `reason` request, the router assembles context:

1. Last N turns of the current session (always).
2. Top-k semantic matches from `memory_vec` above a similarity floor.
3. All `facts` with confidence > 0.6 relevant to the detected intent.

Cap the assembled context. A local 8B model with 30k tokens of memory performs
worse than the same model with 2k tokens of *relevant* memory.

---

## 5. Skills

Skills are the point of this system. The platform exists to host them.

**Full authoring guide: `docs/SKILLS.md`.** It covers directory anatomy, the
manifest format, two-stage intent routing, the confirmation-loop pattern,
per-skill persona files, and the required tests. Read it before writing a skill.

Summary of the contract:

```ts
export interface Skill {
  readonly id: string;                       // "nutrition"
  readonly description: string;              // used in intent routing
  readonly intents: readonly string[];       // "log_meal", "review_diet"
  readonly capabilities: readonly Capability[];

  handle(input: SkillInput, ctx: SkillContext): Promise<SkillResult>;
}

export interface SkillContext {
  router: Router;
  memory: Memory;                 // read is free; write goes through the gate
  propose(action: ProposedAction): Promise<ApprovalOutcome>;
  say(text: string): void;        // streams to TTS
  now(): number;
}
```

A skill **cannot** import an executor. It can only `propose`. This is enforced
by an ESLint rule, not by convention.

### Planned skills

| Skill | Phase | Capabilities |
|---|---|---|
| `brief` | 5 | MEMORY_READ |
| `look` | 8 | CAMERA, MEMORY_WRITE |
| `nutrition` | 9 | CAMERA, MEMORY_WRITE |
| `workbench` (Arduino, assembly) | 10 | CAMERA, MEMORY_WRITE |
| `coach` | 11 | MEMORY_READ |
| `code` | 12 | FS_READ, GIT_WRITE, SHELL_EXEC |
| `finance` | 13 | NET_READ (Stripe read-only key) |
| `wardrobe` | backlog | CAMERA |

---

## 6. Vision — the camera session

**The camera is off. The owner turns it on by voice. It turns itself off.**
There is no ambient observation mode, ever.

### State machine

```
        "turn on the camera" / "open your eyes"
IDLE ──────────────────────────────────────────> ARMED
                                                   │
        owner states a request                     │
ARMED ─────────────────────────────────────────> CAPTURE
                                                   │
CAPTURE ──> ANALYSE ──> RESPOND ──────────────> ARMED   (ready for a follow-up)
                                                   │
        "that's all" / "close the camera"          │
        or 120s idle / 10min absolute cap          │
ARMED ─────────────────────────────────────────> IDLE
```

Invariants:

- **ARMED is not recording.** Turning the camera on does not capture anything.
  A frame is grabbed only when a request is made. This is the difference between
  a tool and a surveillance device.
- **Every request re-captures.** Follow-ups do not reuse the previous frame —
  the owner has usually moved something, which is the entire point in the
  workbench case.
- **The indicator is on for the whole ARMED session**, not just during capture.
  The owner must never be unsure whether the camera is live. Dashboard shows it;
  the macOS camera LED does the rest.
- **Two timeouts, both announced.** 120s idle → "closing the camera". 10 minutes
  absolute → same. Both configurable; neither removable.
- **Frames are ephemeral by default.** A captured frame is deleted when the
  session closes unless an `observation` row referencing it was written, which
  itself requires `MEMORY_WRITE` approval.
- **Closing is always available.** "Close the camera" is handled by the `reflex`
  lane and pre-empts anything in flight.

### Session API

```ts
interface CameraHandle {
  open(reason: string): Promise<CameraSession>;   // IDLE -> ARMED
  readonly state: CameraState;
}

interface CameraSession {
  capture(): Promise<Frame>;      // ARMED -> CAPTURE -> ARMED
  close(): Promise<void>;         // -> IDLE, deletes unreferenced frames
  readonly openedAt: number;
  readonly expiresAt: number;
}
```

A skill without `CAMERA` in its manifest receives a handle that throws on
`open()`. Capability enforcement happens at the handle, not at the call site.

### Model routing

`see` lane: local Qwen3-VL via Ollama first, larger VLM via NIM on fallback or
when the skill requests high accuracy. Qwen3-VL is the current strongest open
VLM and ships dense 2B/4B/8B/32B variants under Apache 2.0.

**Known weakness, designed around:** small VLMs are unreliable on fine detail —
resistor colour bands, specific pin identification, small text at an angle,
anything requiring depth judgement. Skills that depend on such detail must ask
the owner to confirm before advising:

> "I think that's a 220 ohm — can you read the bands to me?"

Silent assumption on fine detail is a defect, not a shortcut.

---

## 7. Quantities — the owner is the source of truth

**No model ever produces a number that gets stored as fact.** This is a hard
architectural rule, and it is what makes the nutrition and workbench skills
trustworthy rather than merely impressive.

The reason: a vision model cannot recover mass from a photograph. Depth and
density are not in the image. Errors of 30–50% per item are normal and
*systematically biased*, so they do not cancel out over a week. A confident
wrong number is worse than no number.

### The division of labour

| Who | Does |
|---|---|
| **Vision** | Identifies. "Looks like grilled chicken, white rice, green salad." |
| **Owner** | Quantifies and confirms. "180g chicken, 150g rice, 80g salad." |
| **Lookup table** | Converts. Confirmed food + confirmed grams → calories and macros. |
| **Model** | Never touches the number. |

Vision is optional throughout. The owner can log a meal with the camera off,
by speaking, and nothing about the record is weaker for it.

### The confirmation contract

Nothing is written until the owner has heard it read back and said yes.

```
Owner:   turn on the camera — help me log this
Jarvis:  I can see grilled chicken, white rice and a green salad.
         I can't judge weights. Tell me the quantities.
Owner:   180 chicken, 150 rice, 80 salad
Jarvis:  180 grams grilled chicken, 150 grams white rice,
         80 grams green salad. Confirm and log?
Owner:   yes
Jarvis:  Logged. [camera closes]
```

If the owner does not give a quantity for an item, it is logged **without one**.
It is never estimated. An item with no quantity still contributes to pattern
analysis, which is the useful output anyway.

### Nutrition data

Calories and macros come from a **local, static food composition table** —
deterministic, auditable, offline, free:

- **Open Food Facts** — open data, barcode coverage, good European and
  Portuguese product coverage.
- **USDA FoodData Central** — public domain, strong on raw and generic foods.

Both are downloaded once into `data/food/`. A lookup either hits or it does not.
On a miss, the item is stored with quantity and no macros, and the owner is told
once. No model is asked to guess a calorie count. Ever.

### Types

`shared/types.ts` encodes this. `Measurement` has a `value`. `Estimate` has a
`low`/`high`/`confidence` and deliberately **no** `value` field, so any code
wanting a single number from an uncertain quantity has to make that choice
visibly. Nutrition quantities are always `Measurement` with source `declared`
or `scale` or `barcode`.

Daily totals over `Measurement` values are fine — those numbers are real.
The prohibition is on totalling estimates, and there are now no estimates in
this path.

### Where this generalises

The same contract governs the `workbench` skill: vision proposes an
identification, the owner confirms it, and only confirmed facts drive advice.
"I think that's a 220 ohm, confirm?" before "then your LED will draw about
15 mA" — never after.

---

## 8. The gate (HITL)

```ts
type ApprovalState = "pending" | "approved" | "rejected" | "expired" | "executed";
```

Transitions are one-directional and enforced server-side:

```
pending ──approve──> approved ──execute──> executed
   │
   ├──reject──> rejected
   └──timeout─> expired
```

- State lives in `core`. The dashboard is a view, never an authority.
- Each `ApprovalRequest` carries `id`, `nonce` (single use), `expiresAt`
  (default 5 min), `capability`, `humanSummary`, and `payload`.
- Approving a request whose nonce is spent, or whose state is not `pending`,
  fails closed and is logged as a `rejection` event with reason `replay`.
- Executors verify an HMAC over `{id, nonce, payload}` signed by `core`. n8n
  webhooks verify the same HMAC before acting.
- `humanSummary` is generated by the `converse` lane and must be reviewed at
  design time: the owner approves based on what they read, so a misleading
  summary is a security hole.

---

## 9. Latency budgets

| Segment | Budget | How |
|---|---|---|
| wake word detection | 100 ms | openWakeWord, ONNX |
| end-of-speech (VAD) | 400 ms | Silero, tuned |
| STT | 300–800 ms | whisper.cpp Metal, streaming partials |
| lane classification | 150 ms | small local model, cached prompt |
| first token (`converse`) | 200–500 ms | keep model warm, `OLLAMA_KEEP_ALIVE` |
| first audio (TTS) | 100–300 ms | Piper, start on first sentence |
| **total to first syllable** | **< 1.5 s** | |

Miss this and the system feels dead and goes unused. It is a Phase 1 acceptance
criterion, not a later optimisation.

---

## 10. Repository layout

```
jarvis/
├── CLAUDE.md            agent conduct rules
├── SPEC.md              this file
├── ROADMAP.md           phases + definition of done
├── PROGRESS.md          current state (agent updates this)
├── DECISIONS.md         ADR log
├── Makefile             make check | make dev | make bench
├── bench/               model selection benchmarks
├── shared/              TypeScript types — single source of truth
├── senses/
│   ├── ears/            Python: wake, vad, stt
│   ├── eyes/            Python: camera
│   └── voice/           Python: tts
├── core/
│   ├── router/          lanes, providers, fallback
│   ├── memory/          sqlite, embeddings, recall
│   ├── gate/            approvals, nonces, audit
│   ├── skills/          skill host + registry
│   └── persona.md       the voice of JARVIS
├── skills/              one directory per skill — see docs/SKILLS.md
│   ├── brief/
│   ├── look/
│   ├── nutrition/
│   └── ...
├── data/
│   ├── jarvis.db        SQLite
│   ├── food/            Open Food Facts + USDA extracts, offline
│   └── frames/          ephemeral camera captures
├── docs/
│   ├── SKILLS.md        skill authoring guide
│   └── BACKLOG.md
└── ui/                  Next.js dashboard
```

`shared/` is the contract. Python side generates its models from the same
JSON Schema via `make types`. Drift between frontend and backend types is the
most common failure mode in this kind of project; this is the mitigation.

---

## 11. Explicit non-decisions

Recorded so they are not re-litigated every session:

- **Database:** SQLite. Not Postgres. Revisit only if concurrent writers appear.
- **Wake word:** openWakeWord `hey_jarvis` pretrained. Note: its Speex noise
  suppression is Linux-only, so macOS gets none — expect threshold tuning.
- **Code harness:** Aider. Git is the trust boundary; every change is a commit,
  every commit is revertible. We are not writing an agent loop.
- **TTS:** macOS `say` in Phase 1 (zero latency, zero setup), Piper from Phase 2.
  Piper is GPL-3.0 since the MIT repo was archived — fine for personal use,
  relevant if this is ever distributed.
- **Camera:** explicitly opened by voice, explicitly or automatically closed.
  No ambient mode. ARMED never means recording. See ADR-010.
- **Quantities:** owner-declared, never model-estimated. See ADR-011.
- **Paid providers:** deferred, not designed out. The interface exists; nothing
  is built or configured. See ADR-009.
- **No Docker** for the core loop. It adds latency and complexity on a laptop.
  OpenHands-style sandboxing is a backlog item for the `act` lane only.
