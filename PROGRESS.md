# PROGRESS.md

The agent updates this at the end of every phase. The owner reads this first
after a break. Keep it factual and short.

---

## Current state

**Phase:** 0 — Baseline and model selection
**Status:** not started
**Branch:** —
**Last updated:** —

---

## Repository scaffold — 2026-08-03

Not a phase — done ahead of Phase 0 so the documented architecture in
`SPEC.md` § 10 exists on disk before any code is written against it.

- Git repo initialized (`main`), all planning docs committed as the baseline.
- Directory skeleton created matching `SPEC.md` § 10: `senses/{ears,eyes,voice}`,
  `core/{router,memory,gate,skills}`, `skills/`, `data/{food,frames}`, `ui/`,
  `bench/`, `shared/`, `docs/`. Empty dirs hold `.gitkeep`.
- `docs/ARCHITECTURE.md` added: Mermaid graphs (process graph, router lanes,
  request lifecycle, memory ER, camera FSM, gate FSM, module import
  boundaries, phase DAG) plus a concept → file → spec-section lookup table.
  Derived from `SPEC.md`; treat any drift between them as a bug.
- `core/persona.md` baseline written (SKILLS.md § 6 expects it to exist).
- TypeScript tooling: root `package.json` + strict `tsconfig.json`
  (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on). `shared/types.ts`
  typechecks clean — verified with `npx tsc --noEmit`.
- Python: `pyproject.toml` with a `ruff` config, targeting py311.
- `Makefile` with `check` (tsc + ruff) and `bench` (runs `nim_smoke.sh`).
  Only real targets — `new-skill`, `dev`, `types` are added when the phase
  that needs them (5, 1/3, 5) is actually built, not stubbed now.
- `.env.example`, `.nvmrc` (pinned to Node 22, matching installed `v22.22.2`).
- Original browser-exported `jarvis-phase0.tar.gz` moved to `.archive/`
  (gitignored) — its contents were verified byte-identical to the files now
  in their proper locations before the move.

**Found while setting up, not yet acted on:**
- System `python3` is 3.9.6 (Apple's system Python), past upstream EOL
  (3.9 support ended Oct 2025). Fine for nothing right now — `bench_local.py`
  and `nim_smoke.sh` are stdlib/bash only — but `senses/` in Phase 1 will want
  a modern interpreter. Recommend installing 3.11+ (pyenv or Homebrew) before
  Phase 1 starts.
- `ruff` is not installed, so `make check` currently fails on the Python half
  with a clear "ruff: No such file or directory" — install it
  (`brew install ruff`) before relying on `make check`.
- `aider` is not installed — expected, it is not needed until Phase 12.

---

## Hardware

| Field | Value |
|---|---|
| Machine | _to fill from `system_profiler SPHardwareDataType`_ |
| Chip | |
| Unified memory | |
| macOS | |

---

## Chosen stack

| Layer | Choice | Decided in |
|---|---|---|
| `converse` model | _pending Phase 0_ | ADR-001 |
| `reason` provider | _pending Phase 0_ | ADR-002 |
| `see` model | _pending Phase 8_ | |
| Food data | Open Food Facts + USDA | ADR-011 |
| Paid provider | none — deferred | ADR-009 |
| STT | whisper.cpp (Metal) | ADR-003 |
| TTS | macOS `say` → Piper | ADR-004 |
| Wake word | openWakeWord `hey_jarvis` | ADR-005 |
| Code harness | Aider | ADR-006 |
| Store | SQLite + sqlite-vec | ADR-007 |

---

## Phase log

### Phase 0 — not started

**Built:** —
**Decided:** —
**Left over:** —
**Surprised me:** —

---

## Key numbers to record as we go

| Metric | Target | Actual | Phase |
|---|---|---|---|
| Lane classification accuracy | ≥ 85% | — | 0 |
| Time to first audible syllable | < 1.5 s | — | 1 |
| Wake false activations / 4h | < 2 | — | 2 |
| Memory recall p95 | < 200 ms | — | 4 |
| **`make new-skill` → working no-op** | **< 30 min** | **—** | **5** |
| Intent routing accuracy | ≥ 90% | — | 5 |

---

## Open questions for the owner

- [ ] Nothing yet.

---

## Known issues

- Nothing yet.
