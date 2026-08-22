# PROGRESS.md

The agent updates this at the end of every phase. The owner reads this first
after a break. Keep it factual and short.

---

## Current state

**Phase:** 8 (camera + `look`) closed and merged. Phase 9 not started --
the owner asked instead for an open stretch of autonomous work, running
2026-08-08 to now. Dated write-ups live in `docs/progress/`; this
section is only what is true today.

**Verified now (2026-08-22):** `make check` green -- **576 TypeScript
tests, 118 Python**. 13 real skills loaded (`skills/` also holds
`_shared` and `__fixtures__`, which are not skills). 69 ADRs.

**What's real and working:** voice in and out through `senses/ears`/
`senses/voice`; a two-stage skill router (embedding match, then LLM
disambiguation) over 13 skills; the gate with green/yellow tiers, real
executors, HMAC-signed executions and an append-only audit log; hybrid
memory recall (semantic + keyword) grounding general conversation; a
live dashboard with approvals, transcript, metrics and hand tracking;
Gmail and GitHub as MCP servers; real Reminders.app for `tasks`; and
hand-driven cursor control whose clicks fire only on a real keypress.
Everything runs on free tiers, with a local `ollama` last resort.

**Known-good numbers:** `converse` first audible syllable p50 **424ms**
(budget 1500ms, `bench/bench_latency.ts`); skill routing **92.2%**
(`bench/bench_skill_routing.ts`, baseline 89.0); lane classification
97.8% EN / 97.8% PT-PT; recall p95 23ms over 10k events.

**Owner-required, not yet done:**
1. A real GitHub PAT in Keychain (README § 3d) to confirm the MCP
   pipeline against live third-party data (ADR-047).
2. Re-authorize Gmail -- the stored OAuth refresh token is expired or
   revoked (`invalid_grant` from Google's own endpoint, seen live
   2026-08-17). `bench/gmail_authorize.ts` needs a real browser.
3. Try "what are my tasks" for real via `make dev`, more than once,
   including right after adding or completing something -- ADR-060
   narrowed the old hang to likely iCloud sync latency on freshly
   touched items and raised the timeout to 30s, but only real everyday
   use shows whether that is enough.
4. Judge whether hand-driven cursor control and the wake word *feel*
   right. The daemon is currently **stopped** (`make uninstall-daemon`,
   2026-08-21) because the wake word fired without being addressed;
   `make install-daemon` brings it back.

**Next:** owner's call -- Phase 9, more MCP servers, the Knowledge Brain
idea, or the screen-guide idea.
**Branch:** `main`
**Last updated:** 2026-08-22

(Phase 7 — the dashboard: live WebSocket channel, REST backfill, `ui/`
Next.js + shadcn/ui project, all four DoD checks Playwright-verified —
closed and merged to `main`. 137 TS tests + 20 Python tests. See its own
log below.)
**Last updated:** 2026-08-04

(Phase 6 — the gate: full `ApprovalRequest` lifecycle, HMAC signing,
append-only audit log, capability tiers — closed and merged to `main`.
156 tests, `make check` green. See its own log below.)
**Last updated:** 2026-08-04

(Phase 5 — skill host + `brief`, plus real `core` integration — closed
and merged to `main`. 148 tests, `make check` green. See its own log
below for the full record: the `core` <-> `senses` wiring that replaced
`senses/echo_bridge.py`, the general-conversation fallback, the
memory-pressure-driven recall timeout, and fact extraction.)
**Last updated:** 2026-08-04

(Phase 3 complete and merged to `main`; Phase 1 complete — see Phase log below for the full record and what was
owner-waived rather than formally measured.)

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
| STT | whisper.cpp (Metal), `small.en`, resident server | ADR-003 |
| TTS | macOS `say` → Piper | ADR-004 |
| Wake word | openWakeWord `hey_jarvis`, ONNX, threshold 0.5 (default, untuned) | ADR-005, ADR-015 |
| Code harness | Aider | ADR-006 |
| Store | SQLite + sqlite-vec | ADR-007 |

---

## Phase log

Full detail for each phase now lives under `docs/progress/`, one file per phase -- this table is the index. Read `## Current state` above first; come here only when you need a specific phase's own history.

| Phase | Summary |
|---|---|
| [Phase 0](docs/progress/phase-0.md) | Hardware baseline, model selection benchmarks — `converse` routed to NIM, no local model survived 8GB |
| [Phase 1](docs/progress/phase-1.md) | Push-to-talk voice loop: whisper.cpp STT, `say`/Piper TTS |
| [Phase 2](docs/progress/phase-2.md) | Wake word (openWakeWord), always-listening `ears` daemon |
| [Phase 3](docs/progress/phase-3.md) | The router: lane classification, provider fallback chain |
| [Phase 4](docs/progress/phase-4.md) | Memory: SQLite + sqlite-vec, facts and events |
| [Phase 5](docs/progress/phase-5.md) | Skill host, first skills, `ctx.ask` |
| [Phase 5b](docs/progress/phase-5b.md) | `core` ↔ `senses` integration follow-up, same session |
| [Phase 6](docs/progress/phase-6.md) | The gate: capability tiers, approvals, audit log |
| [Phase 7](docs/progress/phase-7.md) | The dashboard: Next.js UI, WebSocket-pushed live state |
| [SOAK 1](docs/progress/soak-1.md) | Real usage after Phase 7 — most of the bug fixes, MCP integrations, and new capabilities in this log came out of this stretch |
| [Phase 8](docs/progress/phase-8.md) | Camera sessions, `look` skill, vision providers |

## Key numbers to record as we go

| Metric | Target | Actual | Phase |
|---|---|---|---|
| Lane classification accuracy | ≥ 85% | **97.8%** (SOAK 1, live, `bench/bench_router_lane.ts` — up from Phase 3's 93.3%, itself up from Phase 0's raw-model 71.1%; see Phase 3 log and ADR-024) | 0, 3, SOAK 1 |
| Time to first audible syllable | < 1.5 s | 3/10 real trials: 657ms, 686ms, 1530ms (3rd was a ~45-word stress test) | 1 |
| Wake false activations / 4h | < 2 | 1 (score=0.565) | 2 |
| Wake detection rate (30 @ ~2m) | ≥ 90% | 30/30 synthetic TTS proxy (not the official number — see Phase 2 log); strong real-voice signal across several live rounds, no formal count-of-30 | 2 |
| Survives reboot, no manual intervention | pass/fail | **PASS** — daemon auto-started, mic permission held, wake word + transcription worked | 2 |
| Memory recall p95 | < 200 ms | **12.43ms** (median 11.96ms), 10k synthetic events, `bench/bench_recall_p95.ts` | 4 |
| **`make new-skill` → working no-op** | **< 30 min** | **~111s** (`id=wardrobe`, incl. 2 real bug fixes) | **5** |
| Intent routing accuracy | ≥ 90% | **100%** (15/15), `bench/bench_skill_routing.ts`, live | 5 |
| Phase 7 DoD (approve executes / survives close / two-tab sync / no executor import) | 4/4 pass | **4/4 PASS**, live via Playwright + real headless Chromium against the real running `core` process (not the MCP tool, unavailable this session) | 7 |

---

## Open questions for the owner

- [ ] This machine has two Homebrew installs (`/usr/local` Intel/Rosetta,
      `/opt/homebrew` native) — worth knowing about beyond just this
      project. I didn't touch the Intel one or your shell PATH; up to you
      whether that's worth cleaning up globally.
- [ ] Phase 1's word-accuracy DoD was owner-waived, not measured with real
      speech (see Phase 1 log). If STT accuracy ever feels off in real use
      — wrong words, especially on names/accented speech/numbers — that's
      the signal to actually run `.venv/bin/python bench/score_phase1.py`
      rather than assume it's fine. Deferred, not closed.
- [ ] Phase 2 closed on an owner-waived 30-activation count, same pattern
      as Phase 1's word-accuracy waiver (see the Phase 2 closing note
      above). If a "said hey jarvis and nothing happened" moment ever
      shows up during the soak, that's the signal to actually run the
      formal 30-attempt count with per-attempt scores logged, not
      something to assume is fine forever.
- [ ] `WAKE_WORD_THRESHOLD` (`senses/ears/config.py`) is still the
      untuned pretrained default (0.5) — never needed adjusting, every
      real detection scored well clear of it (0.53–1.00). Leave it unless
      real use during the soak says otherwise.
- [ ] The daemon (`make install-daemon`) only manages `ears` — after a
      reboot it hears and transcribes but doesn't speak back, since
      `voice`/`echo_bridge` aren't part of it (by design, see the Phase 2
      closing note; Pedro chose to leave this as-is rather than extend
      scope now). `make dev` is still how to get the full round-trip
      until `core` (Phase 5) replaces `echo_bridge`.
- [ ] ROADMAP.md's Phase 7 line item literally says "Next.js" — that's
      what got built. The Figma export at `~/Developer/Programação/
      JARVIS Desktop Interface Design` is Vite, and was treated as a
      visual reference only (palette, typography, panel language), not a
      codebase to port. Flagging in case that's not what "look there
      first for layout" meant to you — if you wanted the actual Vite app
      adapted in place instead, that's a different (larger) task.
- [ ] `ui/` currently expects `core` on `localhost:8787` via
      `NEXT_PUBLIC_JARVIS_CORE_URL` (`ui/.env.example`) — fine for one
      machine, would need revisiting (a real hostname, CORS narrowed from
      `*`) if the dashboard is ever opened from a different device on the
      network or the two ever run on separate machines.
- [ ] `docs/BACKLOG.md`'s "persistent menu-bar indicator" idea now has
      the natural home it was waiting for — the dashboard's `StatusBar`/
      camera indicator exist and are live. Not built (real scope, not
      asked for this phase); worth a look together once Phase 8 gives
      the camera indicator something to actually show.
- [ ] STT accuracy on Portuguese proper nouns beyond "Ponta Delgada,
      Açores" (the one real case seen so far, now fixed via
      `WHISPER_INITIAL_PROMPT`) is genuinely unverified against your
      real voice/accent — I can only test with synthetic `say`-generated
      audio, which turned out unreliable for this specific question (see
      ADR-026). If another name/word gets mangled in real use, add it to
      `JARVIS_WHISPER_PROMPT` (or ask me to) rather than assume the one
      fix generalizes on its own.

---

## Known issues
- **Context and code both restructured, 2026-08-22.** The owner asked
  for the system to be organised so an agent orients itself cheaply
  instead of reading everything. Measured first: `CLAUDE.md`'s "never
  start work without reading all three" meant **~25k tokens** before
  touching anything. `CLAUDE.md` is now a routing table (read SPEC when
  architecture changes, ROADMAP at a phase boundary, an ADR only via the
  index) -- **~4.3k tokens mandatory**. `PROGRESS.md` went 628 -> ~300
  lines: 254 lines of dated work log had been appended into `## Known
  issues` by mistake, and `## Current state` carried 93 lines of
  2026-08-12 history; both moved to `docs/progress/`, verified by
  reassembling the original text byte-for-byte. `## Current state` also
  claimed "465 tests green (Python: 50)" against a real 577/118 --
  exactly the kind of stale fact that makes an agent confidently wrong.
  New `.claude/agents/` (`jarvis-reviewer`, `jarvis-auditor`,
  `jarvis-explorer`) carries the project's conventions and known traps so
  they stop being retyped by hand. **Note:** `.claude/agents/` is read at
  session start, so new definitions land on the next session.
  A repo-wide simplification scan then produced six code changes, one of
  which was a live defect: `wiring.ts` built a **separate provider
  instance per lane per API key**, and each instance carries its own
  `TokenBucket`/`ConcurrencyLimiter` -- measured 25 + 25 = 50 rpm against
  a 25 rpm key, on groq/mistral/google/openrouter. Also: one SSE parser
  instead of three byte-identical copies, one `normalizeUtterance`
  instead of four drifted ones (`affirmative.ts` had no accent-stripping
  and compensated by listing every accented word twice), five dead
  symbols deleted, and `skills/look` 303 -> 233 lines. ~210 lines net
  removed, `make check` green throughout.


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
- Lane classification accuracy (71.1%) was below the 85% target — see
  `DECISIONS.md` ADR-001 for why it was accepted at the time. **Resolved in
  Phase 3:** the camera-phrase fix ADR-001 already predicted, plus three
  more rounds of prompt iteration against the real router's own failures,
  brought this to 93.3% live — see the Phase 3 log and ADR-017.
- This machine's `/usr/local` Homebrew is Intel/Rosetta, shadowing the
  native arm64 one at `/opt/homebrew` in PATH. `senses/ears/config.py`
  points at the native `whisper-cli` explicitly so the project is correct
  regardless, but any *other* brew-installed tool used ad hoc (not through
  this project's own config) may silently be the slower Rosetta build.
  `which -a <tool>` before trusting one's provenance.
- ~~When NIM is unreachable, the `converse` fallback (`qwen2.5:0.5b`)
  degrades further than ADR-001 originally checked~~ — **lane
  classification half fixed 2026-08-06, ADR-040.** Live-reproduced
  2026-08-04 (SOAK 1): lane classification itself runs on the
  `converse` lane, and under the fallback it frequently misclassified
  ordinary utterances as `see`, silently misrouting them. Root-caused
  further 2026-08-06 (ADR-038/040): the failure is a fast-but-wrong
  answer, not a hang -- a one-off ~29.7s cold-load measurement that day
  was a disk-cache artifact, re-verified live as landing within the
  existing 3s budget (`core/main.ts` already fails safely regardless,
  an honest spoken error, never a crash). Fixed via
  `core/router/laneHeuristic.ts`: `classifyLane` now prefers a
  no-model, bilingual heuristic over trusting the `ollama` fallback's
  own JSON specifically -- live-verified against the real provider, the
  exact documented misroute now resolves correctly. **Resolved
  2026-08-13, ADR-059:** `disambiguate()`'s equivalent gap (the
  "peanuts" misroute, ADR-038) turned out to need the same fix as
  `classifyLane`'s, not per-skill logic after all -- don't trust the
  `ollama` fallback's disambiguation choice either. Verified against the
  real `bench_disambiguation_fallback.ts`: 42.9% -> 100%. Also found and
  fixed a real, unrelated regression from this session's own pointer-
  control work while re-running the healthy-model benchmark as a check
  (a "cursor"/"Cursor"-app-name example collision) -- `bench_skill_
  routing.ts`: 88.6% -> 94.3%.

Dated write-ups of past work stretches (what was found, measured and
fixed each session) live in `docs/progress/sessions-2026-08.md` -- they
were in this section until 2026-08-22, which was a mistake: they are
records, not open issues.
