# PROGRESS.md

The agent updates this at the end of every phase. The owner reads this first
after a break. Keep it factual and short.

---

## Current state

**Phase:** 0 — Baseline and model selection
**Status:** complete
**Branch:** `phase/00-baseline-model-selection`
**Last updated:** 2026-08-03

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
| Machine | MacBook Air (M1), Model Identifier MacBookAir10,1 |
| Chip | Apple M1 — 8 cores (4 performance + 4 efficiency) |
| Unified memory | **8 GB** |
| macOS | 15.6.1 (Sequoia, build 24G90) |

**8 GB is below the 16 GB floor `README.md`'s model-tier table assumes.**
Substituted the suggested `qwen3:8b` + `phi4` pair with what fits this
machine in practice: benchmarked `gemma3:4b` (sized for 8 GB) alongside
`qwen3:8b` (already pulled locally from prior use, kept in the run for real
data on whether it's usable despite the RAM pressure — see Phase 0 log for
the numbers). Serial number / hardware UUID intentionally not recorded here
— not needed for model selection, and this file is version-controlled.

---

## Chosen stack

| Layer | Choice | Decided in |
|---|---|---|
| `converse` model | NIM `meta/llama-3.1-8b-instruct` (local ruled out — 8 GB RAM) | ADR-001 |
| `reason` provider | NVIDIA NIM, `meta/llama-3.3-70b-instruct` | ADR-002 |
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

### Phase 0 — complete, 2026-08-03

**Built:**
- Hardware profile recorded (see § Hardware).
- NIM key stored in Keychain (`jarvis-nim-key`); `bench/nim_smoke.sh` run
  live: 7/7 passed.
- Fixed a real bug in `bench/bench_local.py`: `except (urllib.error.URLError,
  TimeoutError)` doesn't catch `socket.timeout` on Python 3.9 (it only became
  a `TimeoutError` alias in 3.10) — crashed mid-benchmark. Now `except
  OSError`, which covers all three uniformly and is simpler.
- `bench/bench_nim_lane.py` written: same 45-case set as `bench_local.py`
  (imported, not duplicated), targets NIM instead of Ollama, paced at 30 rpm.
- Local: `gemma3:4b` and `qwen3:8b` both tested via Ollama, both unusable on
  this hardware (timeouts / OOM-restart thrashing — see ADR-001 for the raw
  evidence).
- NIM: `meta/llama-3.2-3b-instruct` unusable (degenerate JSON-mode output),
  `meta/llama-3.1-8b-instruct` usable (100% valid JSON, 709ms median / 1019ms
  p95, 71.1% lane accuracy).

**Decided:**
- ADR-001: `converse`/lane-classification routes to NIM
  (`meta/llama-3.1-8b-instruct`), not local — no local candidate survived
  contact with this machine's 8 GB of RAM.
- ADR-002: confirmed accepted (was provisional) — NIM smoke-tested live,
  `meta/llama-3.3-70b-instruct` for `reason`.

**Left over:**
- 71.1% lane accuracy is below the 85% bar. Failures are concentrated in one
  fixable gap (camera on/off phrases aren't taught as `reflex` examples in
  the benchmark's system prompt) plus genuinely ambiguous short utterances —
  see ADR-001's failure analysis. Phase 3 should add those examples and
  re-check before assuming the number is final.
- A sub-2B local model (`qwen3:1.7b`, `llama3.2:1b`) was never tried. Worth a
  cheap look during SOAK 1.
- `ruff` still not installed locally (flagged at scaffold time, still true).

**Surprised me:**
- The 8 GB RAM ceiling. The project's own docs assumed 16 GB as the floor;
  nobody had checked this specific machine against that assumption before
  now. Local Ollama inference didn't just run slowly, it was unstable
  (OOM-restart loops) — worth remembering as a reason to distrust "should be
  fine" sizing assumptions in general on this hardware.
- How much better `meta/llama-3.1-8b-instruct` did than the 3B model —
  perfect JSON vs. degenerate repetition loops. Model-size cliffs on
  instruction-following-under-constrained-decoding are real and not
  smoothly predictable from parameter count alone.

---

## Key numbers to record as we go

| Metric | Target | Actual | Phase |
|---|---|---|---|
| Lane classification accuracy | ≥ 85% | 71.1% (NIM `llama-3.1-8b`; no local candidate viable — ADR-001) | 0 |
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

- **`converse` is remote for now, not local.** `SPEC.md` § 1 leads with
  "voice never leaves the machine" — that's no longer true for the
  `converse` lane specifically, because no local model survived this
  machine's 8 GB RAM (ADR-001). `reflex` stays local (rules, no model
  needed). Revisit if a small local model ever proves out, or the machine
  changes — the router architecture (ADR-008) makes that a config change,
  not a rewrite.
- **NIM now serves both `reason` and `converse`.** The router's planned 30
  rpm bucket (`SPEC.md` § 3) was sized assuming only `reason`/`see`-fallback
  traffic. `converse` volume is much higher. Phase 3 should re-check whether
  30 rpm still holds once real usage is on it.
- Lane classification accuracy (71.1%) is below the 85% target — see
  `DECISIONS.md` ADR-001 for why it was still accepted and what would likely
  close the gap.
