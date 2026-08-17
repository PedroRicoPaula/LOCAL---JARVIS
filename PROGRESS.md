# PROGRESS.md

The agent updates this at the end of every phase. The owner reads this first
after a break. Keep it factual and short.

---

## Current state

**Phase:** 8 — Camera sessions + `look` — **closed, merged to `main`**.
Phase 9 not started -- the owner asked instead for a stretch of
autonomous, self-directed work (2026-08-08 through 2026-08-12): full
detail in each night's own dated log entry below (ADR-047 through
ADR-052), condensed here to what's actually still relevant day to day.

**What's real and working:** GitHub as a second MCP server alongside
Gmail (`skills/github`, `skills/_shared/mcpTool.ts`, ADR-047); a
permanent benchmark regression gate (`make bench-gate`, ADR-048); a
reviewable routing-misses list (`GET /api/routing-misses`, ADR-049);
batched, idle-triggered fact extraction that directly addresses the
repeated approval-fatigue finding (ADR-050); audit log entries now tag
which channel (dashboard/CLI) resolved them; the 2026-08-07 `ears`
"hang" was re-diagnosed as not a hang at all, with the real gap it
exposed (no feedback on an empty wake-word transcription) fixed instead
(ADR-051); `tasks` now runs on real Reminders.app via a new green
`REMINDERS` capability instead of a private table (ADR-052) -- `add`
confirmed working end to end against real data, `list`/`complete` hit a
real, precisely-isolated hang **not yet confirmed as fixed in real
interactive use** (see that ADR's own "owner-required" section).
`make check`: 465 tests green (Python: 50).

**Owner-required, not yet done:**
1. A real GitHub PAT in Keychain (README § 3d) to confirm the MCP
   pipeline against live third-party data (ADR-047).
2. Try "what are my tasks" for real via `make dev`, more than once,
   including right after adding or completing something -- re-
   investigated live 2026-08-13 (ADR-060): likely iCloud sync latency
   on freshly-touched items, not a stuck permission dialog as ADR-052
   first suspected; timeout bumped 15s -> 30s with real headroom
   measured, but whether that's enough under real everyday use is still
   only observable from a real interactive session.

**Also researched, not built:** a screen-guide overlay idea (`docs/
BACKLOG.md`, inspired by farzaa/clicky) -- real platform work, not
scoped.

**Also built 2026-08-12:** real-time hand tracking as a distinct camera
mode (`senses/eyes/gestures.py`, `ui/src/components/gesture-panel.tsx`,
ADR-053) -- live camera feed on the dashboard with a hand skeleton
overlay, pinch-to-drag, and a finger-position theremin. Fully local and
free (mediapipe, verified working on this machine before adoption). Two
real bugs found by live measurement during the build (an effect-based
drag React rightly rejected, and a frame-pacing bug measured at 7.4fps
against a 12fps target, fixed and re-measured at 11.5fps). Plus two live
bug fixes the owner hit: `close_app` claimed success for apps that were
never running (AppleScript's `quit` exits 0 regardless -- now checks
System Events first), and `open_url` read entire raw URLs out loud (now
speaks a friendly name).

Dashboard refreshed the same day (ADR-054): CSS-only 3D depth (panels
tilt toward the cursor, Orb rings at real Z-depths), the Orb at the
Figma reference's full 480px/7 rings, a sweep animation that renders
only while a real dispatch is in flight, a waveform driven by real
microphone RMS (the reference's own version used `Math.random()`), a
capped and denser conversation log, and a real responsive breakpoint --
verified in a real browser at two viewports, which is how four layout
bugs invisible in the code were found.

Two rounds of live-testing fixes and one new capability, 2026-08-12:
ADR-055 fixed a real hand-skeleton mirroring bug (detection was running
on an already-mirrored frame, then mirroring the result a second time,
cancelling back to unmirrored landmarks under a mirrored preview) and
added background blur to the gesture preview (MediaPipe's free selfie
segmenter, verified real before adoption). ADR-056 shipped
`POINTER_CONTROL` (new green-tier capability, CLAUDE.md § 5): the real
macOS cursor follows the hand, but a click never fires from a gesture
or voice alone -- only a real physical keypress fires it, the same
"real keystroke fires it" property red-tier actions already rely on,
enforced structurally in the executor rather than via the approval
queue. A broader, unconfirmed version was explicitly proposed and
refused first; see the ADR for why.

Same day, ADR-057: owner reported real glitches in the camera/hand-
tracking display. Measured instead of guessing -- found blur nearly
doubled the loop's own CPU cost (44% -> 79% of one core) because it ran
on the full captured frame instead of the already-downscaled preview.
Fixed (resize before blur; a cheaper "obscured" blend toward the
dashboard's own background colour instead of a Gaussian blur, also
answering the owner's own "completely obscured" request; preview
skipped entirely while pointer control is active, since using the real
cursor means looking at the real screen, not the dashboard). Blur's
marginal cost dropped to +10 points, re-measured the same way. `make
check`: 103 Python tests, 492 TS.

**Same day, project reorganized for continued growth** (owner request:
"faz o que achares realmente melhor... reorganiza se for preciso"):
`DECISIONS.md` (4260 lines, 57 ADRs) and `PROGRESS.md`'s own Phase log
(~2780 of its 3076 lines) split into `docs/decisions/ADR-NNN.md` and
`docs/progress/phase-N.md`, one file each, both files now short indexes
-- every split file verified byte-for-byte against the original before
trusting the rewrite, not just eyeballed. `shared/types.ts` (573 lines,
imported by 79 files) split into `shared/types/*.ts` by domain as a
pure re-export barrel, `tsc --noEmit` confirming zero broken imports
across the repo. `.claude/settings.json` gained a hook catching a real
gap found this session firsthand: a new `Capability` added to
`shared/types.ts` without `CLAUDE.md` § 5 being updated in the same
commit, tested against a throwaway repo before trusting it.
`ui/src/lib/use-jarvis.ts`'s state-shape types also extracted to
`use-jarvis-types.ts` (414 -> 333 lines; the 6 components importing
these types from `@/lib/use-jarvis` grepped and confirmed working via
a re-export, then verified in a real browser, not just a clean
compile). **Not yet done:** `core/main.ts`, `core/gate/gate.ts`,
`senses/eyes/gestures.py`, `senses/eyes/main.py` still exceed 300 lines
-- these carry real runtime logic and cross-module wiring, not just
declarations, so splitting them safely needs its own dedicated,
careful pass rather than the mechanical extraction the docs/types
splits were.

**Same day, a dedicated security review of `POINTER_CONTROL` (ADR-058)
found 8 real issues, all fixed, none deferred silently.** The one that
mattered most: the click-safety key was Space -- the most overloaded
key on a keyboard -- so an ordinary Space press for an unrelated reason
could fire a real, unintended click while pointer control happened to
be on. Fixed with two independent changes: the default trigger moved
to `ctrl_r` (a bare modifier, types nothing, no bound OS meaning), and
a click now also requires the hand to be in a deliberate pointing pose
(`is_pointing`, new) at that instant, not just any visible hand. Also
fixed: `POINTER_CONTROL` was documented but never actually enforced at
the point a skill receives `ctx.camera` (`restrictPointerControl`,
`core/skills/camera.ts`); clicks now get a durable `events` row, not
just an ephemeral WS broadcast; the `eyes` IPC socket is `chmod 0o600`;
plus four smaller hardening fixes (stale click-state reset, a Python
`bool()` truthy-string trap, an `isfinite` guard, a bounded IPC read
buffer). `make check`: 108 Python tests, 497 TS.

**Next:** to be decided with the owner -- more MCP servers, Phase 9,
the Knowledge Brain idea, or the screen-guide idea.
**Branch:** `main`
**Last updated:** 2026-08-12

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
- **Machine-wide disk pressure, found via `getSystemMetrics()` and
  cleaned up 2026-08-17.** `df` on `/System/Volumes/Data` (the real data
  volume behind `/Users`) showed 96% used, 9.6 GB free of 245 GB --
  RAM was also at 99% (7.9/8 GB), a plausible contributor to this
  session's own observed Ollama slowness (little headroom left to load
  a model into). Investigated before deleting anything: the two biggest
  items on disk, `~/.colima` (24 GB) and `~/.ollama` (11 GB), are both
  real and in use -- `.colima` backs a live Docker stack for an
  unrelated project (`agente-crm`, containers up 4 days at the time of
  the check) and `.ollama` holds this project's own local models --
  neither was touched. Cleared instead: `npm`/`pip`/Homebrew package
  caches, and known-regenerable `~/Library/Caches` entries (Electron
  auto-updater staging for two desktop apps, Chrome's disk cache,
  Spotify's stream cache, `dotslash`/`node-gyp`/`next-swc` build-tool
  caches) -- none of these are project data, all regenerate on next use.
  `~/Library/Application Support` (19 GB, real app settings/login state)
  and `~/.cursor/extensions` (3 GB, installed extensions, not a cache)
  were deliberately left alone as not safely disposable. Freed ~6.5 GB
  (9.6 GB -> 16 GB free). `make check` reran clean after (498 TS + 108
  Python tests, `tsc`/`ruff`/`eslint`/`next build`), confirming the
  cleanup didn't touch anything the project depends on. Disk pressure
  wasn't found to be causing any specific test failure -- flagged
  originally as a suspect, but no failing test or hang was traced to it
  specifically; the RAM pressure remains the more likely explanation for
  the Ollama slowness observed earlier this session.
- **`core/gate/gate.ts` split 2026-08-17** (one of the 5 files flagged
  earlier this session as over CLAUDE.md § 3's ~300-line guideline,
  deliberately deferred then as needing a careful, dedicated pass):
  382 -> 311 lines. Persistence (`approvals`/`audit_log` SQL) moved to
  new `core/gate/store.ts`; the orphaned-observation-file cleanup moved
  to new `core/gate/observationCleanup.ts`. `Gate`'s public surface is
  unchanged -- every external import (`core/main.ts`, `core/http.ts`,
  `core/ws.ts`, `core/factExtraction.ts`, `core/skills/context.ts`, and
  their tests) still imports `Gate`/`Executor` from `gate.ts` itself,
  untouched. `make check` green after (498 TS + 108 Python), including
  `core/gate/tests/gate.test.ts` unmodified. 4 files remain over the
  guideline: `core/main.ts`, `senses/eyes/gestures.py`, `senses/eyes/
  main.py`, and `ui/src/lib/use-jarvis.ts` (already partially split).
- **`core/main.ts` split 2026-08-17**, same stretch: 448 -> 349 lines.
  `relayVoiceStatus`/`relayCameraStatus` (both already self-contained,
  taking their dependencies as explicit parameters rather than closing
  over `main()`'s own scope) moved to new `core/senseRelays.ts`.
  `relayCameraStatus` gained an explicit `sessionId` parameter (was
  reading the module-level `SESSION_ID` constant directly, no longer
  possible once it's a separate file) -- call site passes `SESSION_ID`
  same as before, behavior unchanged. `make check` green after (498 TS
  + 108 Python). 3 files remain over the guideline: `senses/eyes/
  gestures.py`, `senses/eyes/main.py`, `ui/src/lib/use-jarvis.ts`.
- **`senses/eyes/main.py` split 2026-08-17**, same stretch: 369 -> 302
  lines. `GestureHolder`/`SessionHolder`/`ConnectionHolder` (three
  "one lock, one current thing" state holders, no protocol/dispatch
  logic of their own) moved to new `senses/eyes/state.py`. `handle_message`
  (the real dispatch logic, ~175 lines) stays in `main.py` -- it's the
  file's own actual subject, not something to relocate for a line-count
  target. `ruff` clean, 108 Python tests unchanged (nothing imported
  the three classes from anywhere but `main.py`'s own re-exported
  names, still valid after the move). 2 files remain over the
  guideline: `senses/eyes/gestures.py`, `ui/src/lib/use-jarvis.ts`.
- **Resolved 2026-08-17, ADR-061:** the 5-skill routing benchmark
  coverage gap flagged earlier this session (`system_health`, `gmail`,
  `github`, `about`, `look` had zero cases in `bench_skill_routing.ts`)
  is closed -- 15 new real paraphrase cases, all 13 skills now covered.
  Found and fixed a real deterministic embedding collision along the
  way (PT-PT "ativa o rastreio de mãos" vs. `look`'s own
  `stop_gestures`), same failure class as ADR-059's "cursor"-app-name
  collision. Baseline updated 88.6 -> 89.0 for the new, larger case set.
