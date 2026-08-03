# ARCHITECTURE.md — the graph

A visual index into `SPEC.md`. Every diagram here is derived from prose that
already exists in `SPEC.md`, `ROADMAP.md`, `CLAUDE.md` or `shared/types.ts`.

**If this file and `SPEC.md` ever disagree, `SPEC.md` is right.** Fix this
file in the same commit that changes the spec — treat divergence as a bug,
the same way `shared/types.ts` treats frontend/backend type drift as a bug.

Read order for a new session is still `CLAUDE.md` → `SPEC.md` → `ROADMAP.md`
→ `PROGRESS.md`. This file does not replace that. It exists so the *shape* of
the system — what talks to what, what is allowed to import what, what state
machine a subsystem obeys — can be checked at a glance instead of
reconstructed from paragraphs every session.

---

## 1. Processes

Five processes, communicating over a local Unix socket + WebSocket. Only
`core` touches the database. `ears`, `eyes`, `voice` and `ui` cannot cause a
side effect — they hold no executor imports, by construction. See `SPEC.md`
§ 2.

```mermaid
graph LR
    subgraph Senses["senses/ — Python, launchd"]
        EARS["ears<br/>wake · VAD · STT"]
        EYES["eyes<br/>camera, on demand"]
        VOICE["voice<br/>streaming TTS"]
    end

    CORE["core/ — Node/TS<br/>router · memory · gate · skills"]
    UI["ui/ — Next.js<br/>dashboard · approvals"]
    DB[("SQLite<br/>jarvis.db")]

    EARS -- "text (STT)" --> CORE
    CORE -- "sentences" --> VOICE
    CORE -- "open / capture / close" --> EYES
    CORE <-- "WebSocket" --> UI
    CORE -- "only writer" --> DB

    style DB fill:#333,stroke:#888,color:#fff
    style CORE fill:#1f4a7a,color:#fff
```

---

## 2. Router lanes

The single most important component — all model access goes through it.
The `converse` lane classifies which lane a request belongs to; that
classification is the thing benchmarked hardest in Phase 0. See `SPEC.md` § 3.

```mermaid
graph TD
    U["utterance / text"] --> LC["lane classifier<br/>(converse lane, local)"]
    LC --> REFLEX["reflex — &lt;300ms<br/>stop, repeat, wake ack"]
    LC --> CONVERSE["converse — &lt;1.5s<br/>dialogue, intent routing"]
    LC --> REASON["reason — 3-15s<br/>analysis, teaching, planning"]
    LC --> SEE["see — 2-10s<br/>image understanding"]
    LC --> ACT["act — minutes<br/>code, files, multi-step"]

    REFLEX --> P1["rules + local 1-4B"]
    CONVERSE --> P2["ollama, local 8-14B"]
    REASON --> P3["nim (free)"] -. "fallback" .-> P2
    SEE --> P4["ollama Qwen3-VL"] -. "fallback / high-accuracy" .-> P5["nim VLM"]
    ACT --> P6["Aider + reason provider"]
```

Every lane keeps at least one `free-local` fallback — the system must stay
usable with no internet (ADR-008). No paid provider exists on this graph
anywhere (ADR-009); the `ModelProvider` interface has room for one, nothing
is wired.

---

## 3. Request lifecycle

The path from spoken word to executed action. This is the diagram that
matters most for not hallucinating a shortcut that skips the gate.

```mermaid
sequenceDiagram
    participant O as Owner (voice)
    participant Ears as senses/ears
    participant Router as core/router
    participant SR as skill router
    participant Sk as skill.handle
    participant Gate as core/gate
    participant Ex as executor
    participant Voice as senses/voice

    O->>Ears: speech
    Ears->>Router: text (STT)
    Router->>Router: classify lane (SPEC §3)
    Router->>SR: dispatch
    SR->>SR: embed match vs manifest examples (SKILLS §3)
    alt score > 0.72, margin > 0.08
        SR->>Sk: skill.handle(input, ctx)
    else ambiguous
        SR->>Router: disambiguate top 3 (converse lane)
        Router->>Sk: skill.handle(input, ctx)
    end
    Sk->>Sk: ctx.ask / ctx.say as needed
    Sk->>Gate: ctx.propose(action)
    Gate-->>O: ApprovalRequest (dashboard and/or voice)
    O->>Gate: approve / reject
    alt approved
        Gate->>Ex: SignedExecution (HMAC over id+nonce+payload)
        Ex-->>Gate: result
    else rejected or expired
        Gate-->>Sk: ApprovalOutcome.ok = false
    end
    Sk-->>Voice: SkillResult.speech
    Voice-->>O: audio
```

A skill **never** reaches `Ex` directly. `ctx.propose` is the only door out
of `skill.handle`. See § 7 below for why that boundary is enforced by lint,
not convention.

---

## 4. Memory schema

`events` is append-only and is the spine; everything else derives from it.
`observations` is kept separate because vision is unreliable by nature —
mixing it into `facts` would let a guess masquerade as a belief. See
`SPEC.md` § 4.

```mermaid
erDiagram
    events ||--o{ facts : "source_event"
    events ||--o{ memory_vec : "ref_id"
    facts ||--o{ memory_vec : "ref_id"

    events {
        text id PK
        int ts
        text kind "utterance|response|observation|action|approval|rejection|note"
        text actor "owner|jarvis|system"
        text content
        text meta "JSON"
        text session_id
    }
    facts {
        text id PK
        text key UK "diet.avoids, project.x.stack"
        text value
        real confidence "0..1, honest"
        text source_event FK
        int updated_at
    }
    observations {
        text id PK
        int ts
        text image_path "local only"
        text provider
        text qualitative "durable record"
        text structured "JSON, nullable"
        real confidence
    }
    memory_vec {
        float_array embedding "768-dim"
        text ref_id
    }
```

Recall order before any `converse`/`reason` call: last N turns → top-k
semantic matches above a similarity floor → `facts` with confidence > 0.6.
Capped — a small model with 2k tokens of *relevant* memory outperforms the
same model with 30k tokens of noise.

---

## 5. Camera session state machine

`SPEC.md` § 6 — the state machine **is** the specification, not a summary of
it. ARMED is not recording; a frame is taken only on an explicit request.

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> ARMED: "turn on the camera" / "open your eyes"
    ARMED --> CAPTURE: owner states a request
    CAPTURE --> ANALYSE
    ANALYSE --> ARMED: respond, ready for follow-up
    ARMED --> IDLE: "close the camera" / 120s idle / 10min absolute cap

    note right of ARMED
        Arming captures nothing.
        Every follow-up re-captures —
        frames are never reused.
        Indicator is on for the whole
        ARMED session, not just capture.
    end note

    note right of IDLE
        Frames deleted on close unless
        an approved observation
        references them.
    end note
```

---

## 6. Gate (approval) state machine

`SPEC.md` § 8. State lives in `core`; the dashboard is a view, never an
authority.

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> approved: approve (nonce valid)
    pending --> rejected: reject
    pending --> expired: timeout (5min default)
    approved --> executed: execute (HMAC verified)

    note right of pending
        Replaying a spent nonce, or acting on
        a request that is no longer pending,
        fails closed and logs a "rejection"
        event with reason "replay". The
        request's real state never moves
        backward — only a log entry is added.
    end note
```

Capability tiers that decide whether a proposal needs this loop at all —
green / yellow / red — are defined in `CLAUDE.md` § 5, not repeated here to
avoid a second copy drifting from the first.

---

## 7. Who may import whom

The rule that makes the gate meaningful: a skill can *propose*, never
*execute*. Enforced by an ESLint rule (Phase 5), not convention — this graph
is what that rule encodes.

```mermaid
graph TD
    Skills["skills/*"] -->|ctx.router| Router["core/router"]
    Skills -->|"ctx.memory (read)"| Memory["core/memory"]
    Skills -->|"ctx.propose — the only way out"| Gate["core/gate"]
    Skills -.->|"FORBIDDEN — ESLint-enforced"| Executors

    Gate -->|"only after approval"| Executors[["executors<br/>(live inside core/gate)"]]
    Executors --> External["filesystem · git · shell · webhooks"]

    Ears["senses/ears"] -.->|"no executor import, by construction"| Executors
    Eyes["senses/eyes"] -.->|"no executor import, by construction"| Executors
    Voice["senses/voice"] -.->|"no executor import, by construction"| Executors
    UI["ui/"] -.->|"no executor import, by construction"| Executors

    style Executors fill:#7a1f1f,color:#fff
    style Skills fill:#1f4a7a,color:#fff
```

Dashed = forbidden. If a diff ever adds one of the dashed edges for real,
that diff is wrong regardless of what it claims to be fixing.

---

## 8. Phase dependency graph

Linear by design — `ROADMAP.md` is not a backlog to reorder, it is a sequence
where each phase is proven before the next is trusted. The two SOAK phases
are not slack time; they are load-bearing.

```mermaid
graph TD
    P0["Phase 0<br/>Baseline + model selection"] --> P1["Phase 1<br/>Voice loop, push-to-talk"]
    P1 --> P2["Phase 2<br/>Wake word"]
    P2 --> S1{{"SOAK 1 — 2wk<br/>use it, do not build"}}
    S1 --> P3["Phase 3<br/>Router"]
    P3 --> P4["Phase 4<br/>Memory"]
    P4 --> P5["Phase 5<br/>Skill host + brief"]
    P5 --> P6["Phase 6<br/>Gate + audit"]
    P6 --> P7["Phase 7<br/>Dashboard"]
    P7 --> S2{{"SOAK 2 — 2wk<br/>use it, do not build"}}
    S2 --> P8["Phase 8<br/>Camera sessions + look"]
    P8 --> P9["Phase 9<br/>nutrition"]
    P9 --> P10["Phase 10<br/>workbench"]
    P10 --> P11["Phase 11<br/>coach"]
    P11 --> P12["Phase 12<br/>code via Aider"]
    P12 --> P13["Phase 13<br/>Actions via n8n"]

    style S1 fill:#7a5a1f,color:#fff
    style S2 fill:#7a5a1f,color:#fff
```

Current position: see `PROGRESS.md`. **Never** start a box here without a
recorded "Phase N complete" for every box above it.

---

## 9. Quick lookup — concept → where it lives

| Concept | Lives in (code) | Defined in (spec) |
|---|---|---|
| `Lane`, lane budgets | `shared/types.ts` | `SPEC.md` § 3 |
| `ModelProvider` interface, registry | `core/router/` (Phase 3) | `SPEC.md` § 3 |
| Memory schema, recall policy | `core/memory/` (Phase 4) | `SPEC.md` § 4 |
| `Skill`, `SkillContext`, `SkillManifest` | `shared/types.ts`, `skills/*` | `SPEC.md` § 5, `docs/SKILLS.md` |
| Intent routing (embed match, disambiguation) | `core/skills/` (Phase 5) | `docs/SKILLS.md` § 3 |
| `Capability`, green/yellow/red tiers | `shared/types.ts` | `CLAUDE.md` § 5 |
| `ApprovalRequest` lifecycle, nonces, HMAC | `core/gate/` (Phase 6) | `SPEC.md` § 8 |
| Camera state machine | `senses/eyes/` (Phase 8) | `SPEC.md` § 6 |
| `Estimate` vs `Measurement`, quantity rule | `shared/types.ts` | `SPEC.md` § 7, ADR-011 |
| Baseline voice | `core/persona.md` | `docs/SKILLS.md` § 6 |
| Every architectural decision and why | — | `DECISIONS.md` (ADR log) |
| What's built, what's next, what surprised us | — | `PROGRESS.md` |
| Ideas explicitly not being built yet | — | `docs/BACKLOG.md` |

---

## 10. Latency budget, visually

```mermaid
graph LR
    A["wake word<br/>100ms"] --> B["VAD<br/>400ms"] --> C["STT<br/>300-800ms"] --> D["lane classify<br/>150ms"] --> E["first token<br/>200-500ms"] --> F["first audio<br/>100-300ms"]
```

Total budget to first audible syllable: **< 1.5 s** (`SPEC.md` § 9). This is
a Phase 1 acceptance criterion, measured, not a later optimization pass.
