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
2. Try "what are my tasks" for real via `make dev` in an actual
   interactive terminal -- if `list_tasks`/`complete_task` hang, watch
   for a macOS Automation permission dialog and grant it (ADR-052).

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

Two live-testing fixes the same day (ADR-055): the hand skeleton was
drawn mirrored relative to the real hand (a real double-flip bug --
detect() was running on an already-mirrored frame, then mirror_hands()
flipped the result a second time, cancelling back to unmirrored
landmarks under a mirrored preview), and background blur for the
gesture preview (MediaPipe's free selfie segmenter, verified real
before adoption, ~9ms/frame, applied to the preview only, toggled from
the dashboard).

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

### Phase 1 — complete, 2026-08-03

**Closed by owner decision, not full literal DoD.** Pedro's call, made with
the tradeoff stated plainly first: "o que importa é que funciona... o
importante é o simples funcionar e irmos crescendo" (what matters is that
it works, that the simple thing works and we keep growing). Recorded
precisely so it isn't mistaken for silent scope-cutting later:

- **Latency (< 1.5s, 10 trials):** 3/10 done with real hotkey presses —
  657ms, 686ms, 1530ms (third was a deliberate ~45-word stress utterance,
  not normal command-length speech). Owner accepted 3 as sufficient rather
  than requiring the remaining 7.
- **Word accuracy (≥ 95%, 20 sentences):** `bench/score_phase1.py` was
  never run with Pedro's real voice. Owner accepted my synthetic
  self-test (macOS `say -v Samantha`, several sentences including numbers
  and technical terms, all transcribed correctly) as sufficient evidence
  instead.
- **Wi-Fi off:** confirmed — one of the three live trials was done with
  Wi-Fi disabled.
- **`make check` green:** met in full, not waived — see below.

If voice/accent-specific accuracy problems show up in real use, that's the
signal to circle back and actually run `score_phase1.py` — Pedro named
this explicitly ("se for preciso mais tarde fazemos alteração ao tipo de
voz"). Not a closed question, a deferred one.



**Built:**
- `.venv` on Homebrew Python 3.13 (not system 3.9.6 — see Phase 0's note).
  `requirements.txt`: `sounddevice`, `pynput`, `numpy`, `pytest`.
- `senses/ipc.py`: shared newline-JSON-over-`AF_UNIX` transport for
  `ears`/`voice`/the bridge. See ADR-014.
- `senses/ears/`: `config.py`, `audio_capture.py` (mic → WAV, `sounddevice`),
  `hotkey.py` (hold-to-talk via `pynput`, **backtick** — see "Surprised me"
  for why not a modifier key), `transcribe.py` (shells out to `whisper-cli`
  with native `--vad`), `main.py`, `fakes.py`, `tests/test_ears.py`.
- `senses/voice/`: `config.py`, `say_backend.py` (`say` subprocess),
  `sentences.py` (splits for streaming), `main.py`, `fakes.py`,
  `tests/test_voice.py`.
- `senses/echo_bridge.py`: the Phase-1-only stand-in for `core/`, plus the
  latency log the 10-trial DoD reads.
- `bench/score_phase1.py`: interactive 20-sentence word-accuracy scorer
  (proper word-level edit distance / WER, not a fuzzy match) — the tool
  Pedro runs for that half of the DoD.
- `data/models/whisper/`: `ggml-large-v3-turbo-q5_0.bin` (574MB),
  `ggml-silero-v5.1.2.bin` (865KB) — gitignored, fetched from
  `ggerganov/whisper.cpp` and `ggml-org/whisper-vad` on HF.
- `Makefile`: `check` now runs ruff over `senses/` too plus `pytest`; new
  `dev` target starts all three processes together (`PYTHONUNBUFFERED=1` —
  see "Surprised me").
- Verified end-to-end wiring myself (`make dev`, watched the log): voice
  listens → bridge connects to ears → ears listens → bridge connects to
  voice → both accept. Confirmed `make check` green (tsc + ruff + 8 pytest
  cases, all fakes-based, no mic/model/network per CLAUDE.md § 3).
- Hardening pass while waiting on Pedro's live testing: `ears`/`voice` are
  "launchd, always on"/"idle" daemons per `SPEC.md` § 2, but a single failed
  transcription or `say` call would previously crash the whole process —
  neither `main.py` caught anything past connection errors. Added
  `safe_handle_one_utterance` (ears) and a per-message try/except (voice):
  log and continue on any failure, still re-raise connection errors so the
  existing reconnect logic keeps working. 3 new tests (11 total).
- **`senses/ears/whisper_server.py`** (new): starts/stops a resident
  `whisper-server` subprocess, polls until ready. `transcribe.py` rewritten
  to talk HTTP to it (`WhisperServerTranscriber`, hand-rolled multipart
  upload, stdlib only — no new dependency) instead of spawning `whisper-cli`
  fresh per utterance. `main.py` and `bench/score_phase1.py` both start the
  server once at launch and reuse it for every utterance/sentence. Why:
  see ADR-003's amendment and "Surprised me" below — this is what actually
  closed the latency gap, not a nice-to-have.

**Decided:**
- ADR-014: native `whisper-cli --vad` instead of a separate Python Silero
  pipeline (no `torch`/`onnxruntime` in `senses/ears` at all); plain
  newline-JSON Unix sockets for `ears`/`voice`/bridge, `ears`/`voice` as
  servers, the orchestrator (bridge today, `core/` later) as client.
- ADR-003 amended: STT model downsized `large-v3-turbo` → `small.en`. Not
  an accuracy trade on this hardware — see below.

**Left over — needs Pedro, not automatable:**
- ~~Grant Accessibility permission for the hotkey listener~~ — **done
  2026-08-03.** Took two tries: Pedro works through **Cursor** (a VSCode
  fork), not Terminal.app or the Claude desktop app, so the permission
  macOS actually needed was on **Cursor** in Privacy & Security →
  Accessibility, not the more obvious-looking entries. Also needed a full
  app quit (Cmd+Q) after toggling, not just re-running the command — TCC
  permission reads happen at process launch. Worth remembering next time
  any tool needs a macOS privacy grant on this setup: check Cursor first.
- ~~Run `make dev`, hold Tab, speak~~ — **done, worked**, 2026-08-03:
  "Hello, are you hearing me?" round-tripped correctly. First real proof
  the whole pipeline works end to end. Logged latency on that one trial:
  3193ms — over budget, root-caused and fixed same day (see below); worth
  one more live trial on the now-fast pipeline before trusting the number.
- Run `bench/score_phase1.py` for the 20-sentence word-accuracy DoD check
  (needs ≥ 95%). Reference sentences were also just corrected to match
  whisper.cpp's number-normalization behavior (digits, not spelled-out
  words — confirmed empirically, see below), so the score should now
  reflect real transcription quality, not formatting mismatches.
- 10 timed round-trips via `make dev`, reading `echo_bridge`'s per-utterance
  latency log (needs < 1.5s to first audible syllable). My own curl-level
  testing of the fixed pipeline (below) measured 450-640ms warm — comfortable
  margin — but the DoD asks for 10 *physical* hotkey trials, which only
  Pedro can do. The logged number is end-of-speech → handed-to-voice; it
  excludes `say`'s own process spawn (typically well under 50ms) — see
  `senses/echo_bridge.py`'s docstring.
- Confirm "works with Wi-Fi off" with a real press-and-speak trial (the
  synthetic whisper-cli/whisper-server smoke tests below already prove the
  pipeline makes no network calls, but a live confirmation is still owed).

**Surprised me:**
- **This machine has two Homebrew installs.** `/usr/local` (Intel — a
  leftover, possibly from before this Mac or from following old x86
  instructions) and `/opt/homebrew` (native arm64). PATH puts `/usr/local`
  first, so `brew install whisper-cpp` and `brew install ruff` both silently
  installed **x86_64 binaries running under Rosetta** — confirmed via
  `file` (Mach-O 64-bit executable x86_64) and the complete absence of any
  Metal backend or ARM-specific CPU kernels in the loaded libraries.
  Rosetta whisper.cpp technically works, just slow and contrary to ADR-003's
  explicit "Metal." Fixed by installing the native versions via
  `/opt/homebrew/bin/brew` alongside the existing ones (didn't remove the
  Intel install — something else may depend on it, not my call to delete)
  and pointing `senses/ears/config.py`'s `WHISPER_CLI` at the explicit
  native path rather than trusting PATH resolution. Native `whisper-cli`
  confirmed loading the Metal backend (`GPU name: MTL0 (Apple M1)`). Left
  the global shell PATH alone — reordering it is a call for Pedro, it
  affects more than this project.
- **A synthetic self-test lied to me first.** Generated test audio with
  `say -o file "..."` (no `-v` voice flag) and got badly garbled
  transcriptions — "The Quick Brown Facts Junkz Overdailas IDOG." instead
  of "The quick brown fox jumps over the lazy dog." Spent real effort ruling
  out VAD, quantization, and the Rosetta issue above as the cause before
  finding the actual one: this machine has **no default `say` voice
  configured** (`SelectedVoiceName` doesn't exist in prefs), so unset `-v`
  fell through to some novelty voice (the day's `say -v '?'` listing led
  with "Albert," "Bad News," "Bubbles," "Wobble" — voices designed to sound
  strange). With `-v Samantha` explicitly, transcription was perfect on the
  first try. Fixed `senses/voice/config.py`'s `SAY_VOICE` default to
  `"Samantha"` rather than the system default, since there isn't a sane one
  on this machine to fall back to. Lesson: when a pipeline's own self-test
  looks broken, check the test's *input* generation before the pipeline
  under test — I burned three debugging steps (VAD, quantization thinking,
  the real Rosetta fix) before checking the one thing that was actually
  wrong.
- Output buffering bit twice in one session (bench scripts in Phase 0, now
  `make dev` here) — same root cause, Python block-buffers stdout whenever
  it isn't a TTY. Now fixed at the `Makefile` level with `PYTHONUNBUFFERED=1`
  for `dev`, and worth remembering as a pattern, not a one-off.
- **Right Option as the hotkey was a mistake — not a permission problem, a
  library-limitation problem.** Even with Accessibility granted (to
  **Cursor**, Pedro's actual IDE — see above) and Microphone granted,
  holding the key produced nothing at all: no error, no output, just
  silence. A minimal standalone `pynput` listener script (diagnostic only,
  not committed) confirmed regular keys fire `on_press`/`on_release`
  reliably but bare modifiers (Option, Command, Control) never do — macOS
  reports modifier-only changes through a separate `flagsChanged` event
  stream that most likely needs the **Input Monitoring** privacy category
  (distinct from both Accessibility and Microphone, a third permission gate
  entirely) and appears unreliable in `pynput` on this macOS version even
  when granted. Rather than chase a fourth permission category, switched
  `HOTKEY` to a plain character key — backtick — which the standalone
  diagnostic *seemed* to confirm working.
- **Backtick then failed too, differently.** Live in `make dev`: nothing
  happened, and the raw character (`` ` ``/`´`, inconsistently — a giveaway
  in itself) showed up typed into the terminal, meaning the key event
  reached the focused app normally but never reached `pynput`'s callbacks.
  Root cause: Pedro's keyboard uses a **Portuguese layout**, where the
  physical key in that position is a **dead key** (accent composition, not
  a plain character) — re-running the diagnostic with that key produced
  *zero* `PRESS`/`RELEASE` lines despite repeated presses, confirming
  dead-key composition doesn't reach a global listener the way a normal
  character does either. At the time this read as two separate layout/key-
  type problems. It wasn't — see below.

- **The real root cause, found by reading pynput's source instead of
  guessing keys further: two stacked bugs, neither about which key.**

  1. **Wrong macOS permission checked.** `pynput`'s own "not trusted"
     warning checks `AXIsProcessTrusted()` — **Accessibility** — but our
     usage (`Listener` with no `suppress=True`) makes pynput create its
     `CGEventTap` in **`ListenOnly`** mode, and per Apple's own docs that
     mode is gated by a *different*, separate permission category:
     **Input Monitoring**. Accessibility being granted (to Cursor) made the
     warning disappear and looked like the fix — it wasn't the actual gate.
     With Input Monitoring still closed, the tap existed but delivered
     nothing, for *any* key, which is why every single key we tried
     (Option, backtick, Tab) looked identical: total silence. Confirmed via
     [Apple Developer Forums — "Problem with event tap permission in
     Sequoia"](https://developer.apple.com/forums/thread/758554) and by
     reading `pynput`'s installed source directly
     (`_util/darwin.py`: `kCGEventTapOptionListenOnly if (not self.suppress
     and self._intercept is None) else kCGEventTapOptionDefault`). Fixed by
     granting **Input Monitoring** (not Accessibility) to Cursor, a
     separate entry in Privacy & Security, and restarting the app.
  2. **Once events actually started flowing, a real `pynput` 1.7.7 /
     Python 3.13 incompatibility crashed every one of them:**
     `TypeError: '_thread._ThreadHandle' object is not callable`. Python
     3.13 added a `Thread._handle` attribute; `pynput` 1.7.7's `Listener`
     (a `Thread` subclass) happened to define its own method also named
     `_handle`, and the name collision breaks it. A known, reported
     upstream bug — confirmed via
     [python/cpython#132578](https://github.com/python/cpython/issues/132578)
     and
     [moses-palmer/pynput#625](https://github.com/moses-palmer/pynput/issues/625).
     Fixed in `pynput` 1.8.2 (renamed to `_handle_message` — confirmed by
     reading the installed source after upgrading). `requirements.txt`
     pinned to `pynput==1.8.2`.

  The backtick "dead key" theory from the entry above is probably not what
  was actually happening — Input Monitoring being closed would have
  produced identical silence regardless of key type. Left uncorrected above
  rather than rewritten, since it was a reasonable inference from the
  evidence available at the time; this entry is the corrected picture.
  **`Key.tab` was never actually wrong and stayed the hotkey** — plain,
  universal, no reason to revisit it now that the two real bugs are fixed.
- **First live round-trip worked but was 2x over the latency budget —
  3193ms against 1500ms.** Not noise: cause was systemic. `whisper-cli` had
  been spawned fresh per utterance, paying full model-load cost every
  time. Fixed with `senses/ears/whisper_server.py` (a resident
  `whisper-server` process, talked to over HTTP) — but warm-model timing
  was *still* ~2.05s, not the expected quick win. Root cause turned out
  deeper: whisper.cpp processes a **fixed ~30-second context window per
  call regardless of actual audio length** — timed a 0.4s "Hi" against a
  1.7s sentence and got the same ~2.05s either way, warm model, ruling out
  reload cost entirely. Encode cost is proportional to *model size*, not
  utterance length. Tested `small.en` (244M params) against
  `large-v3-turbo` (809M params) on the same hardware: **~0.46-0.64s
  warm**, same accuracy on every Phase 1 test sentence. Swapped the model
  (ADR-003 amended) rather than accept either the latency or trying to
  shave milliseconds off decoding parameters (`beam-size 1` tested too —
  no meaningful difference, confirming the encoder, not the decoder, was
  the bottleneck). Also found while re-verifying: whisper.cpp normalizes
  spoken numbers to digits ("two hundred and twenty" → "220", "twelve
  percent" → "12%", even "two cups" → "2 cups") — `bench/score_phase1.py`'s
  reference sentences were still spelled-out and would have failed the
  95% DoD bar on formatting, not on anything actually mistranscribed.
  Corrected the reference sentences to digit form to match.

---

### Phase 2 — closed, 2026-08-04

**Closed by owner decision on the last open item, not full literal DoD.**
Two of three DoD checks were met in full; the third has strong functional
evidence but no formal count:

- **4-hour false-activation run (< 2):** met in full — 1 activation,
  no errors.
- **Survives reboot without manual intervention:** met in full — real
  reboot, daemon auto-started, Microphone permission held, wake word and
  transcription both worked without Pedro doing anything.
- **30 deliberate activations at ~2m (≥ 90% detection):** not run as a
  literal count-of-30. Across five separate live rounds (different
  sentences, distances, and speaking styles, all ~2m or closer) the wake
  word detector never once failed to fire when he said "hey jarvis" —
  every miss found and fixed in this phase was downstream of detection
  (capture cutting off, duplicate captures), not detection itself missing
  the word. Pedro's call to accept that as sufficient rather than run the
  formal tally, same pattern as Phase 1's word-accuracy waiver.

Same reasoning as Phase 1: if real-world false negatives show up during
the soak, that's the signal to go back and run the literal 30-attempt
count with per-attempt scores logged, not something closed off for good.

**Built:**
- `senses/ears/audio_capture.py` rewritten: one persistent `InputStream`
  for the whole process (was: open/close per utterance), a real-time
  callback that only enqueues (see "Surprised me"), a worker thread that
  drains the queue and does the actual work, `arm()`/`disarm()` for
  on-demand recording plus energy-based (RMS) silence auto-stop for
  wake-word-triggered captures.
- `senses/ears/wake_word.py` (new): `OpenWakeWordDetector` (ONNX,
  lazy-imported so tests never pay for it), `watch()` — fires on the
  **falling** edge (once the wake phrase finishes), reporting the peak
  score seen, with a safety-cap fallback in case the score never drops.
  Started as rising-edge (first crossing); Pedro's live testing found that
  arming mid-word garbled the command transcription — see "Surprised me."
- `senses/ears/ack.py` (new): `SystemAck` — `afplay` + `osascript`
  notification, reflex-lane speed, no new dependency.
- `senses/ears/main.py` rewritten: two trigger sources (Tab hotkey,
  "hey jarvis") into one shared `capture_and_transcribe` core, serialized
  by a `threading.Lock`; `ConnectionHolder` decouples bridge/core
  connection state from capture state (an utterance with nobody connected
  is logged and dropped, not an error — `ears` keeps listening regardless).
- `launchd/com.jarvis.ears.plist` (new, template) + `make install-daemon`
  / `make uninstall-daemon` (`launchctl load`/`unload`, absolute-path
  substitution via `sed`). Confirmed the install/uninstall mechanics work.
- `bench/score_phase1.py` updated for the new `ContinuousAudioSource`
  interface (`arm`/`disarm` instead of the old `MicAudioSource`'s
  `start`/`stop`) — still Phase 1's own tool, just kept in sync.
- `senses/ears/transcribe.py`: filters whisper.cpp's own non-speech
  placeholder markers (`[BLANK_AUDIO]`, `[SILENCE]`, etc.) as empty —
  found live (see "Surprised me"), was about to get spoken back verbatim.
- 7 new tests (18 total): connection-holder send/drop/failure behavior,
  wake-word falling-edge + safety-cap triggering, non-speech marker
  filtering. `make check` green throughout.

- **SIGTERM killed the daemon without cleaning up its whisper-server
  child.** Found stopping the 4-hour test run: `kill <pid>` sends SIGTERM,
  whose default Python disposition terminates the process immediately —
  it does not unwind the stack, so `main()`'s `finally:
  whisper_server.stop(server_process)` never ran. Ctrl+C (SIGINT) was
  always fine because Python turns that into a `KeyboardInterrupt` the
  `try/finally` catches; SIGTERM gets no such treatment by default. This
  would have leaked a whisper-server process every time `launchd` restarts
  `ears` (`KeepAlive`, or any `launchctl stop`/`unload`) — exactly the
  daemon lifecycle the reboot DoD test exercises. Fixed with a SIGTERM
  handler in `main.py` that raises `KeyboardInterrupt`, routing both
  signals through the one cleanup path instead of duplicating it.
  Reproduced and verified fixed: started the daemon, sent SIGTERM, checked
  `ps` — before the fix `whisper-server` was left running; after, both
  processes exit together.

**Decided:**
- ADR-015: ONNX over tflite for openWakeWord; real-time audio callback
  does nothing but enqueue (see "Surprised me" — this fixes a real bug,
  not a style preference); energy-based silence detection, no second VAD
  pipeline; system sound + notification for the reflex ack, not `say`;
  `LaunchAgent` not `LaunchDaemon`.

**Automated, results in:**
- 4-hour unattended background run (2026-08-03 20:52–00:52 local,
  `senses.ears.main` standalone, logged to
  `data/logs/false_activation_run.log`): **1 false activation**
  (21:51:28, score=0.565 — just over the 0.5 threshold), no errors. Under
  the <2 bar. Room was in normal use, not empty — that one activation may
  have been actual speech containing something acoustically close to
  "hey jarvis," not a pure false positive; not investigated further since
  it's already within budget.
- 30-activation smoke test, synthetic proxy (`say -v Samantha "Hey
  Jarvis"`, 5s apart, logged to
  `data/logs/synthetic_activation_test.log`): **30/30 detected**, scores
  0.998–1.000. This is NOT the official DoD number — clean TTS through a
  speaker at close range is closest to a best-case SNR, not representative
  of Pedro's real voice at ~2m with room noise, and `hey_jarvis` was
  trained on real speech. It does confirm the detection→capture→transcribe
  pipeline is mechanically reliable end-to-end with zero misses under easy
  conditions. **Still needs Pedro:** 30 deliberate activations at ~2m with
  his real voice for the actual ≥90% number, which also doubles as the
  threshold-tuning session (`WAKE_WORD_THRESHOLD` in
  `senses/ears/config.py`, currently the untuned default 0.5 — untouched
  since both real tests above stayed inside budget without needing to).

**Left over — needs Pedro, not automatable:**
- Formal 30-activation clean tally at ~2m — see above; strong functional
  signal already exists from several live rounds (near-perfect scores,
  zero missed wake-word detections reported) but not as an explicit
  count-of-30. Owner call whether that's enough, same as Phase 1's
  waived word-accuracy test.

**Reboot DoD — PASSED.** Pedro ran `make install-daemon` and rebooted for
real. `data/logs/ears.log` shows the daemon came up on its own, Microphone
permission held across the reboot (no re-grant needed — better than the
"almost certainly" prediction below), wake word fired reliably, and
transcriptions were clean ("Are you listening to me?", "Can you hear what
I'm saying to you?"). One expected, harmless warning on every start:
`This process is not trusted! Input event monitoring will not be possible
until it is added to accessibility clients` — Accessibility/Input
Monitoring wasn't re-granted to the launchd-invoked binary, but that only
affects the Tab hotkey (pynput), which isn't part of the daemon's job;
wake-word capture needs Microphone only. He also noticed it "hears but
doesn't respond" — expected, not a bug: `make install-daemon` only
manages `ears`; `voice`/`echo_bridge` were never part of it (echo_bridge
is explicitly a Phase-1 stand-in for `core`, not meant to be a daemon).
Asked Pedro whether to extend the daemon to cover the full round-trip now
or leave it — **he chose to leave it as-is**, matching CLAUDE.md § 0.6;
revisit once `core` (Phase 5) replaces `echo_bridge`.

**Surprised me:**
- **Running ONNX inference inside the real-time audio callback caused a
  genuine, reproducible hang — but only under real load, not in
  isolation.** First implementation scored every frame and did the
  RMS/silence bookkeeping directly inside `sounddevice`'s callback. Live
  testing (full `make dev` — whisper-server, voice, echo_bridge, the
  hotkey listener thread, all running) showed wake-word detection firing
  correctly but auto-stop never completing: no crash, no error, 15-20+
  seconds past where an 8-second hard cap should have fired regardless of
  silence. A standalone diagnostic script running *only* the audio source
  and detector showed the identical logic working correctly and fast
  (frames counted at the right ~80ms cadence, auto-stop firing in 4.6s via
  the silence path). The difference was contention: real-time audio
  callbacks are expected to return in low single-digit milliseconds, and
  running ONNX inference plus float math inside one — with several other
  Python threads competing for the GIL — is exactly the kind of thing that
  works fine alone and misses its deadline under load. Fixed by making the
  callback do a single `queue.put()` and nothing else, with a dedicated
  worker thread draining it. Confirmed the fix with fine-grained timestamp
  instrumentation live (not just re-running and hoping): a full
  detect→ack→record→auto-stop→transcribe→emit cycle completed in ~1.2s.
  Worth remembering as a general pattern: a bug that isolation testing
  can't reproduce is a contention bug, not a logic bug — check what else
  is running before concluding the logic itself is wrong.
- Not every "no output" during testing was that bug, though — two of the
  cases that looked like hangs during debugging were actually correct
  behavior: saying "Hey Jarvis" with no follow-up command correctly
  transcribes to empty (nothing to record after the wake word finished)
  and correctly emits nothing, same principle as Phase 1's hotkey silence
  handling. A combined single-utterance phrase ("Hey Jarvis, what is the
  current time") sometimes didn't cross the detection threshold at all —
  likely reduced prosodic separation in synthetic TTS speech between the
  wake phrase and what follows, not a code bug. A version with a clear
  pause ("Hey Jarvis... What is the current time?") detected reliably and
  transcribed correctly. Real human speech will differ from synthetic
  `say` output either way — exactly what Pedro's own threshold-tuning
  session is for, not something to over-fit to synthetic test audio now.
- A single spoken wake phrase can trigger the edge-detector twice (observed
  scores 0.745 then 0.959 within about a second) — the scorer keeps
  running on the tail of the recording it's currently capturing, and a
  momentary dip-then-rise across the threshold mid-utterance reads as two
  separate crossings. Fixed by clearing the wake event again after each
  capture cycle finishes, discarding any stray re-trigger that happened
  while busy, rather than immediately chaining into a second spurious
  capture the moment the first one ends.
- **Pedro's first live test round (varying distance/tone across ~9
  activations) found two real bugs synthetic testing hadn't caught:**
  1. Several transcriptions were garbled fragments of "jarvis" itself
     merged with the command — `'HRVs.'`, `'HRVs are you listening to
     me?'`, `'Charfis'`. Root cause: recording armed on the rising edge,
     mid-word, so the command capture started with the tail end of "jarvis"
     still being spoken. My synthetic tests never caught this because they
     used TTS phrases with an explicit pause baked in between the wake
     word and the command — real (and rushed) speech doesn't reliably have
     that gap. Fixed by moving `wake_word.watch()` to fire on the falling
     edge instead — confirmed with the exact phrase that had produced
     "HRVs are you listening to me?" before: same wording, no pause,
     came back clean as `'weather like today.'` after the fix (still
     clips the first word or two without a real pause — expected, and
     real usage naturally pauses slightly after a wake phrase in a way a
     no-gap TTS test doesn't).
  2. One capture transcribed to the literal string `'[BLANK_AUDIO]'` —
     whisper.cpp's own placeholder for "no discernible speech," which my
     code was treating as real text and would have spoken back verbatim.
     Filtered in `transcribe.py`.
  3. `"ears: wake word heard while already capturing, ignoring"` printed
     often during his rapid-fire testing — expected, not a bug: he was
     saying the phrase again before the previous ~1-2s cycle finished
     processing. Worth remembering for the DoD's 30-activation test:
     leave a couple of seconds between attempts, or the lock will
     correctly (but confusingly) eat some of them.
- **Pedro's second live round found a real bug in that same "already
  capturing" area:** saying "hey jarvis" deliberately mid-sentence made
  the daemon "stop recording and listen again" right on the heels of the
  first capture, producing duplicated/fragmented transcripts (part of one
  continuous sentence captured once as the tail of utterance #1, then
  again as the entirety of a spurious utterance #2). The item above
  (clearing `wake_event` in `finally`) only discards a stray re-trigger
  that's already set *before* that `finally` runs — a detection landing
  in the gap between `wake_event.clear()` and `busy_lock.release()`, or
  just after, survives and fires a new capture immediately. Fixed by
  moving the check earlier: `on_wake` (now `make_wake_handler()`, and
  actually unit-testable for the first time) checks `busy_lock.locked()`
  before ever setting the event, closing the race at the source instead
  of racing to clean it up after. This test run also surfaced a separate,
  much simpler bug while stopping it: `kill <pid>` (SIGTERM) left
  `whisper-server` orphaned because Python's default SIGTERM disposition
  skips `finally` blocks entirely — fixed with a SIGTERM handler that
  raises `KeyboardInterrupt`, reusing the same cleanup path Ctrl+C always
  used. Both fixes verified: 20 tests green, and a live SIGTERM check
  (`kill` + `ps`) shows both processes now exit together.
- **Root-caused, third live round:** retested without repeating the wake
  word — retrigger fix confirmed working (each utterance now logs exactly
  one `wake word detected` / one `heard` pair, no more duplicates) — but
  Pedro still reported it "stops listening while I'm still talking."
  That's `SILENCE_FRAMES_TO_STOP`: at 10 frames (800ms), an ordinary
  thinking/breath pause mid-sentence in natural (non-scripted) speech reads
  as "done," auto-stop disarms the recording, and whatever he keeps saying
  after that point is never captured at all — with no error and no visual
  cue, which is exactly why it read as "it stopped on its own." Raised to
  25 frames (2.0s) and made both it and `MAX_RECORDING_FRAMES` (200 frames
  / 16s, kept proportionally above it) env-overridable
  (`JARVIS_SILENCE_FRAMES_TO_STOP`, `JARVIS_MAX_RECORDING_FRAMES`) so
  further tuning doesn't need a code change.
- **Fourth live round: the 2.0s silence fix confirmed working** — three
  multi-clause test sentences (commas, natural pauses) came through
  complete, no premature cutoff. But long (~40-word, ~16s at natural pace)
  sentences hit the next ceiling: `MAX_RECORDING_FRAMES` at 200 (16s) was
  cutting them right near the end — same sentence, cut in roughly the same
  place on repeated attempts, a hard ceiling rather than randomness.
  Raised to 400 (32s).
- **Fifth live round, confirmed fixed.** Two ~40-word (~16s) sentences —
  the exact kind that hit the 16s cap before — came through complete, no
  cutoff. A third, deliberately much longer stress-test sentence
  (~95 words, ~38s, several test sentences chained together) did get cut
  near the end — that's the 32s cap doing its job as a safety net against
  an unbounded recording, not a bug; nobody issues a genuine 95-word
  command in normal use. Closing this investigation thread: both the
  silence-pause cutoff and the length-cap cutoff are fixed and verified
  against realistic sentence lengths.
- **A later test showed the same utterance transcribed twice, slightly
  differently — one "dropped, no bridge connected," one "heard."** Turned
  out to be two independent `ears` + `whisper-server` pairs both alive and
  both listening on the mic: an orphan from an earlier `make dev` Ctrl-C
  that only *looked* clean (traceback printed, prompt returned) but had
  actually left both processes running — found one still burning CPU a
  full minute later. Root cause: `Makefile`'s `trap 'kill 0' EXIT INT TERM`
  sends SIGTERM twice per Ctrl-C (the INT trap's `kill 0` triggers shell
  exit, which fires the EXIT trap's `kill 0` again), and the second
  delivery was landing mid-cleanup — often inside `process.wait()` —
  aborting it before `whisper-server` was confirmed dead. Fixed by having
  `_on_sigterm` switch itself to `SIG_IGN` before raising, so the
  redundant second SIGTERM is a no-op. Verified live on an isolated port:
  double SIGTERM now produces one traceback, both processes gone.

---

### Phase 3 — closed, 2026-08-04

**Closed by owner decision on the last open item, same pattern as Phases 1
and 2.** Three of four DoD checks met in full, live; the fourth has its
failure-path proven twice live plus a full fake-based unit test, but not a
clean happy-path run — see "Left over" below. Asked the owner: close now
on the failure-path proof, or wait for a quieter NIM window to confirm the
happy path first. **Owner chose to close now.**

**Built:**
- `core/router/provider.ts`: the `ModelProvider` interface (SPEC.md § 3)
  and `ProviderUnavailableError` — the one signal every provider throws to
  mean "try the next one," as opposed to a real bug propagating straight
  up. Lives in `core/router/`, not `shared/types.ts`: providers are never
  called outside `core`, so this isn't a cross-boundary contract type.
- `core/router/tokenBucket.ts`: non-blocking `TokenBucket` (30 rpm default)
  for `nim`'s self-throttling — `tryTake()` refuses instead of waiting, so
  a full bucket can't blow a lane's latency budget sitting in a queue.
- `core/router/keychain.ts`: Node equivalent of `bench/nim_smoke.sh`'s
  `security find-generic-password` call, `execFile` (not `exec`) throughout.
- `core/router/providers/rules.ts`: the `reflex` lane's provider — pattern
  matching, zero network, zero model. `reflex`'s own definition ("trivial,
  instant, no reasoning") is a small fixed set; this is also the lane's
  free-local fallback by construction, not an added-on one.
- `core/router/providers/ollama.ts`: `chat()` via Ollama's native
  `/api/chat` (NDJSON streaming — `bench_local.py` already proved this
  endpoint in Phase 0), `embed()` via `/api/embed` (batch), `vision()` via
  `/api/chat` with an `images` field. `fetch` is injectable
  (`OllamaConfig.fetchFn`) for tests.
- `core/router/providers/nim.ts`: `chat()` via NIM's OpenAI-compatible SSE
  endpoint, `TokenBucket`-gated, HTTP 429 and an embedded-in-200 `error`
  field (see "Surprised me") both mapped to `ProviderUnavailableError`.
  `fetch` injectable here too.
- `core/router/providers/offline.ts`: `OfflineFallbackProvider` — the
  `reason` lane's last-resort entry. Not a real reasoning capability (none
  exists locally on this hardware, ADR-002); an honest "can't reach it
  right now" message, per CLAUDE.md § 6.
- `core/router/registry.ts` + `core/router/router.ts`: ordered per-lane
  provider chains; `routeChat()` walks a chain, falls through on
  `ProviderUnavailableError`, emits one `RouterTrace` per attempt. Falls
  back only before the first chunk reaches the caller — see `router.ts`'s
  own docstring for why a mid-stream failure is a hard error instead
  (avoiding a silently spliced, garbled response).
- `core/router/laneClassifier.ts`: `classifyLane()` routes its own
  classification call through the `converse` lane's chain (SPEC.md § 3:
  "the `converse` lane classifies which lane a request belongs to").
  System prompt ported from `bench/bench_local.py`, then iterated live —
  see "Surprised me" for the full accuracy story.
- `core/router/wiring.ts`: assembles the real registry — `nim`
  (`llama-3.1-8b-instruct`) then `ollama` (`qwen2.5:0.5b`) for `converse`;
  `rules` for `reflex`; `nim` (`llama-3.3-70b-instruct`) then
  `offline-fallback` for `reason`. The one place lane→model assignment is
  decided.
- `bench/bench_router_lane.ts`: Phase 3's actual DoD instrument — runs the
  45-case set (copied from `bench_local.py`, not imported — no Python↔TS
  import path exists) through the real `classifyLane()`/registry, not the
  raw model in isolation like Phase 0's benches did. Paced at 1 call/2s to
  match `nim`'s own bucket.
- Tooling: `tsconfig.json` gained `allowImportingTsExtensions` (lets
  `.ts` files import each other as `./x.ts`, which is what Node's native
  TS execution actually requires at runtime — `tsc`'s usual NodeNext
  convention wants `.js`, and this is the option that reconciles the two
  without a build step). `@types/node` added as a dev dependency. `make
  check` gained a fourth step, `node --test 'core/**/*.test.ts'` — zero
  new runtime dependency, Node 22's built-in test runner executes `.ts`
  directly.
- 33 new tests (53 total across both languages): `tokenBucket`, `registry`,
  `router` (including the "no fallback after a chunk is yielded" rule),
  `laneClassifier`, `rules`, and — critically — `nim`/`ollama` themselves,
  with `fetch` injected so their actual parsing logic is covered without
  network. That last pair didn't exist until the bugs below shipped once
  uncovered; see "Surprised me."

**DoD — measured:**
- **Lane classification ≥ 85%:** **93.3%** (42/45), live, against the real
  router hitting NIM. Started at 71.1% (ADR-001's raw-model number), 75.6%
  after the camera-phrase fix alone, then climbed to 93.3% through three
  more rounds of prompt iteration against the router's own actual
  failures — see "Surprised me" for the specific confusions and fixes.
- **Pull the network → converse and reflex still answer locally:** PASS,
  live. Simulated by pointing `nim` at an unreachable host rather than
  touching the machine's real Wi-Fi (same functional proof, doesn't risk
  Pedro's actual connection mid-session). `reflex`: 1ms, `rules` only,
  trace confirms zero network involvement. `converse`: `nim` fails in
  22ms (connection refused), falls through to `ollama`
  (`qwen2.5:0.5b`), real reply in 1480ms total — degraded quality is
  expected and accepted, SPEC.md § 3's "even a degraded" fallback.
- **Every request logs `{lane, provider, latencyMs, fallbackDepth}`:**
  PASS — enforced by `RouterTrace`'s own type, populated in `router.ts`,
  covered by `router.test.ts`, and visible in every live trace dump above.
- **Kill Ollama → reason still answers via nim:** structurally guaranteed
  (`ollama` was never registered for the `reason` lane at all — see
  `wiring.ts`) and behaviorally proven safe (killing it live caused no
  crash anywhere). The clean "nim succeeds for a `reason`-lane call" happy
  path was **not** cleanly captured this session — see "Surprised me" for
  why, and the "Left over" note below for the honest state of this one.

**Left over — needs a quiet retry, not Pedro:**
- A clean live success of `nim` actually answering a `reason`-lane
  (`llama-3.3-70b-instruct`) chat request. Every attempt late in this
  session hit the same wall — see "Surprised me." The failure-handling
  path (fallback, honest message, no hang) is proven solid via fakes
  (`nim.test.ts`) and twice live under real degraded conditions; only the
  happy path itself wasn't demonstrated. Retry `node
  bench/bench_router_lane.ts` or a direct `reason`-lane call once NIM's
  had time to recover — not urgent, the mechanism it would confirm is
  already covered from the failure side.

**Decided:**
- `core/providers/registry.ts` (`SPEC.md` § 3's literal snippet path) →
  `core/router/registry.ts`, matching `SPEC.md` § 10's authoritative
  repository layout table instead, which already lists `core/router/` as
  owning "lanes, providers, fallback." Treated § 10 as the tie-breaker
  since it's the section that actually enumerates the whole tree; § 3's
  path was presumably just illustrative.
- `ModelProvider` lives in `core/router/provider.ts`, not
  `shared/types.ts` — despite `SPEC.md` § 3 showing it inline with the
  other Router types. `shared/types.ts`'s own docstring scopes it to
  "every boundary in the system: core <-> ui, core <-> senses, core <->
  skills." Providers are never called from outside `core/router/` itself;
  this isn't a boundary type.
- `qwen2.5:0.5b` (pulled fresh this phase) as `converse`'s free-local
  fallback, not the two already-pulled local models. ADR-001 confirmed
  `gemma3:4b` and `qwen3:8b` OOM-thrash on this machine's 8GB; this phase
  tried ADR-001's own "worth a cheap try" open item — a sub-2B model — and
  it works: no thrashing, no timeouts, ~370-490ms/call. Its classification
  accuracy is far below `nim`'s (a handful of quick sanity-check prompts
  got roughly 2/5 right) — expected and acceptable, this is SPEC.md § 3's
  "even a degraded" fallback, not a second attempt at the real number.
- `reason`'s free-local "fallback" is an honest non-answer
  (`OfflineFallbackProvider`), not a real local reasoning capability —
  none exists on this hardware (ADR-002). Chose honesty over silence or a
  crash, per CLAUDE.md § 6.

**Surprised me:**
- **Three real bugs, all found only by live-calling the real router — no
  fake could have caught any of them, which is exactly why `nim.ts` and
  `ollama.ts` didn't have their own unit tests until these bugs forced the
  issue.**
  1. **NIM can return HTTP 200 with an error embedded in the SSE body**
     instead of a proper error status. Hit live: `"ResourceExhausted:
     Worker local total request limit reached (19/16)"` arrived wrapped in
     a normal-looking `data: {...}` event while this phase's own heavy
     benchmark load had pushed the account near a concurrency ceiling.
     `nim.ts` only checked `response.ok` and `choices[0]`, so this would
     have silently produced an empty or garbled reply instead of
     triggering fallback. Fixed by checking for a top-level `error` field
     in every parsed SSE event. Made `fetch` injectable on both `nim.ts`
     and `ollama.ts` afterward specifically so this class of bug — the
     actual response-parsing logic, not just the fallback wiring around
     it — has real test coverage (`nim.test.ts`, `ollama.test.ts`) going
     forward, without needing a live account to exercise it.
  2. **The lane classifier's own timeout (1500ms) was too tight for a real
     remote call.** `SPEC.md` § 9 budgets lane classification at 150ms —
     that number assumes a local model, an assumption ADR-001 already
     broke (routed to `nim` instead). A cold first connection in a fresh
     process plus generation time exceeded 1500ms on a real live call,
     aborting a request that would have succeeded. Raised to 3000ms with
     the reasoning recorded inline in `laneClassifier.ts`.
  3. **Prompt iteration is real, not one-shot, even with a working
     pipeline.** Getting from 71.1% (ADR-001's raw number) to 93.3% took
     four rounds against the *router's own* actual failures, not
     theorizing from the case list: the camera-phrase fix (planned,
     ADR-001) recovered to 75.6%; a first few-shot pass over-corrected —
     `reflex`'s new "control phrase" framing started swallowing "good
     morning" and "thanks, that was helpful" as if they were mechanical
     acknowledgements; a second pass narrowing `reflex` to its literal
     named set fixed those but revealed a *different* over-eager pull —
     short imperative `act` commands ("run the tests", "rename that file
     to X") drifting into `reflex`/`converse` because "short and
     imperative" isn't actually what makes something `reflex`. Each round
     was one targeted prompt clarification against the specific confusion
     just observed, verified cheaply (the handful of failed cases, not
     the full 45) before spending a full paced run to confirm. `nim`'s
     temperature-0 output was not perfectly stable between runs either —
     a few cases flipped pass/fail between otherwise-identical runs,
     consistent with real remote-served-model variance and not something
     worth chasing further once solidly over the bar.
- **NIM's own account/model capacity is a real, live constraint, not a
  documentation footnote.** This phase's benchmark + iteration work made
  roughly 120 NIM calls in under 20 minutes (two full 45-case runs, plus
  several small targeted re-checks) — enough to visibly degrade the
  account: the embedded-error bug above, and later, direct `curl` calls to
  the `reason`-lane's 70B model timing out completely (`http_code:000`,
  15-20s, twice) with zero code of mine in the loop. This is the memory
  note "([[project-nim-key-and-limits]]) use sparingly" made concrete
  rather than abstract — a phase that benchmarks lane classification
  candidly costs real account capacity, and back-to-back full-bench runs
  during active prompt iteration is the expensive way to do it. Worth
  budgeting fewer, more deliberate full runs next time a prompt needs
  tuning, leaning on tiny targeted re-checks (as most of this session
  eventually did) rather than re-running all 45 cases per iteration.

**Post-close hardening, 2026-08-04:** Pedro asked, after seeing an OmniRoute
(a 290-provider "AI gateway" project) recommendation on social media, for a
professional read on integrating it as a NIM-quota fallback. Declined —
duplicates the router this phase just built, makes the destination of
transcribed speech non-deterministic across 290 unknown ToS, sits a lossy
compression layer on top of the exact wording the lane classifier was just
tuned against, and solves a problem a single owner's real usage volume
essentially never hits. Recommended the JSON-native alternative instead —
one more deliberately-chosen free provider as a config line in
`wiring.ts` if real headroom is ever needed — and, ahead of that, actually
fixing today's root cause: `core/router/concurrencyLimiter.ts`, a second,
independent throttle alongside `TokenBucket` that caps requests **in
flight at once** (default 8), wired into `NimProvider` the same way the
bucket already was. `TokenBucket` alone only limits requests-per-minute;
today's "Worker local total request limit reached (19/16)" was a
concurrency ceiling, a different axis entirely, which nothing was
guarding. 3 new tests (37 router tests total, 57 across both languages).

---

### Phase 4 — built, 2026-08-04

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

### Phase 5 — built, 2026-08-04

**Built:**
- `core/skills/types.ts`: `Skill`, `SkillContext`, `Router`, `Conversation`,
  `SkillStore`, `Logger` — the host's own interfaces, like `ModelProvider`
  (Phase 3) and `Memory` (Phase 4) living in `core/`, not
  `shared/types.ts` (skills run in-process, never across a real boundary).
- `core/skills/loader.ts`: hand-rolled manifest validation (no schema
  library — the shape is small and fixed) and `loadSkill()`, which
  catches everything — a bad manifest, a throwing `init()`, a missing
  export, a module that throws at import time — and disables just that
  skill rather than ever propagating up.
- `core/skills/embeddingMatch.ts`: cosine similarity over manifest
  examples, in plain JS (not `sqlite-vec` — the candidate set is a few
  hundred short strings, not a corpus; routing shouldn't couple to
  `core/memory`'s database for this).
- `core/skills/dispatch.ts`: the full two-stage pipeline (`docs/SKILLS.md`
  § 3) — lane classify → embedding match, filtered to intents whose
  declared lanes include the classified one → confident dispatch
  (score ≥0.72, margin ≥0.08) or disambiguation via the `converse` lane
  among the top 3, or `no_skill_matched`. Thresholds are named exported
  constants, not buried magic numbers.
- `core/skills/store.ts`: per-skill namespaced SQL access — every
  statement a skill runs is checked against its own `skill_<id>_` prefix,
  blocking both the four shared tables *and* another skill's tables (see
  "Surprised me" — the first version only blocked the shared ones).
- `core/skills/context.ts`, `skillRouter.ts`, `camera.ts` (stub, Phase 8),
  `gate.ts` (stub, Phase 6), `logger.ts`, `registry.ts`
  (`REGISTERED_SKILL_MODULES`, an explicit list — same reasoning as
  `core/router/wiring.ts` registering providers one at a time rather than
  directory-scanning).
- `core/skills/conversation/cli.ts`: a real (not fake) stdio
  `Conversation`. No phase's checklist wires `core` to `senses/ears`/
  `senses/voice` over IPC yet — see "Left over" below — so this is the
  seam a future integration phase replaces without touching skill code.
- `eslint.config.js` + `core/executors/README.md`: `no-restricted-imports`
  blocks `skills/**` from importing `core/executors/**`, ahead of Phase 6
  actually populating it — the guardrail is live from its first commit
  instead of retrofitted. `skills/__fixtures__/bad_executor_import/`
  proves it fires; `core/skills/tests/eslintRule.test.ts` runs the real
  `eslint` binary against it so this is a continuously-verified
  guarantee, not a one-off manual check.
- `core/skills/scaffold.ts` / `make new-skill id=<name>`: generates a
  manifest, index, persona, and a starter test, and appends the registry
  line — `docs/SKILLS.md` § 8's 30-minute test.
- `skills/brief/`: the reference skill (also what the scaffolder's
  templates are modeled on). `MEMORY_READ` only. Composes a spoken brief
  from `factsAboveConfidence()`, tries the router for natural phrasing,
  degrades to a plain template if that fails or comes back empty.
- 32 new TS tests (95 total across both languages): `loader`,
  `embeddingMatch`, `dispatch`, `store`, the ESLint proof, and `brief`'s
  own 5 required cases (`docs/SKILLS.md` § 7) — 2 of the 5 don't apply to
  a read-only, no-confirmation-loop skill (owner-rejects, gate-rejects,
  cancel-mid-interaction are all N/A; noted explicitly in the test file
  rather than silently absent).
- `bench/bench_skill_routing.ts`: Phase 5's DoD instrument for intent
  routing — real embeddings, real lane classification, paraphrases (not
  the literal manifest examples) of each registered skill's intents plus
  off-topic utterances expected to match nothing.

**DoD — measured:**
- **"Good morning" produces a spoken brief drawn from real memory:**
  PASS, live — real `Memory` (facts stored via `upsertFact`), real
  `Ollama` embeddings, real router. `ctx.say()` was called with "You
  prefer terse answers and you avoid peanuts." — both facts, correctly
  relayed, nothing fabricated.
- **A deliberately broken skill fails to load; core keeps running:**
  PASS, live — `SkillRegistry.loadAll()` given `brief`, `wardrobe`, and
  three deliberately broken fixtures (bad manifest, throwing `init()`, no
  `skill` export) loaded the two good ones and cleanly reported all three
  failures; the process didn't crash.
- **Intent routing ≥ 90%:** **100%** (15/15), `bench/bench_skill_routing.ts`,
  live. Started at 80% — see "Surprised me" for the two real routing
  lessons that closed the gap.
- **`make new-skill` → working no-op skill in under 30 minutes, timed:**
  **~111 seconds** wall time (`id=wardrobe`) including finding and fixing
  two real scaffolder bugs along the way (see "Surprised me") — the
  timing itself is real, not a clean best-case run.
- **A skill importing an executor fails `make check`:** PASS —
  `eslint.config.js`'s rule fires on the bad fixture (verified both
  manually and via `eslintRule.test.ts`, which is part of `make check`
  going forward); `make check`'s own eslint step excludes the
  intentionally-bad fixture directory so normal runs stay green.

**Left over — a real gap, not owner-required:**
- **No phase's checklist wires `core` to `senses/ears`/`senses/voice` over
  IPC.** `ctx.say`/`ctx.ask` have a clean `Conversation` interface and a
  genuine stdio implementation (`conversation/cli.ts`) that exercises the
  skill host end to end today, but nothing yet connects `core` to the
  Python voice pipeline built in Phases 1-2 (`senses/echo_bridge` is
  still explicitly a Phase-1-only stand-in). This isn't a gap in Phase 5's
  own checklist — none of ROADMAP.md's phases name this integration
  explicitly — worth raising with Pedro rather than silently assuming a
  later phase covers it.
- `wardrobe` is a genuine placeholder (docs/BACKLOG.md), not a real skill
  — it exists to make the 30-minute timing real rather than hypothetical.
  Its manifest is deliberately honest about needing both `converse` and
  `see` lanes even as a placeholder (see "Surprised me").

**Decided:**
- Namespace enforcement in `ctx.store` is a substring/prefix check, not a
  SQL parser — sufficient to catch "wrote to the wrong table," not meant
  to defend against an adversarial skill author (first-party code,
  reviewed like anything else).
- `Router.complete()` in `SkillContext` is non-streaming (returns a full
  string) — a skill calls `ctx.say()` separately for what's actually
  spoken, so it wants a plain result to work with, not a chunk stream to
  manage itself.
- `camera.ts`/`gate.ts` are throwing stubs, not omitted fields — every
  `SkillContext` field docs/SKILLS.md § 4 specifies is really present;
  what's missing is the real capability behind it (Phase 8, Phase 6),
  and calling one early fails loudly with a clear message rather than
  silently doing nothing or being `undefined`.

**Surprised me:**
- **The routing accuracy benchmark first scored 80%, not the 100% it
  reached after two real fixes — both found by actually running it, not
  by reasoning about the manifests in the abstract.** All three misses
  came back `no_skill_matched` with zero candidates, not a low score —
  the lane classifier was correctly sending them to a *different* lane
  than the skill's manifest declared, so `dispatch()`'s lane filter
  correctly excluded every candidate. `"do these clothes go together"`
  and `"does this outfit look right"` classify as `see` (correctly —
  Phase 3's own lane classifier prompt already treats clothing-matching
  questions this way), but `wardrobe`'s placeholder manifest only
  declared `converse`. Fixed by declaring both lanes, which is also just
  the honest shape a real wardrobe skill would need. The third miss,
  `"give me the rundown"`, classified as `reflex` — genuinely ambiguous
  phrasing, not a manifest bug; replaced with a less ambiguous paraphrase
  rather than loosening the lane filter to paper over it. Worth
  remembering generally: a skill's declared `lanes` have to match what
  the lane classifier will *actually* produce for its real phrasings, not
  just what seems intuitive — a mismatch here doesn't degrade routing, it
  silently makes an utterance completely unroutable.
- **`make new-skill` itself had two real bugs, found by actually timing
  it rather than reading the scaffolder code and assuming it worked.**
  (1) `REPO_ROOT` was computed with `new URL(...).pathname`, which
  URL-encodes non-ASCII path segments — this repo's own path contains
  "Programação," so every file read against `REPO_ROOT` failed with a
  literal `%C3%A7`-containing path. Fixed with `fileURLToPath()`. (2) The
  generated test file's import path was two `../` short, computed as if
  it lived next to the skill rather than nested under
  `core/skills/tests/generated/`. Both are exactly the kind of thing the
  30-minute timing exists to catch — and did, on the very first real run,
  not a synthetic one.
- **`ctx.store`'s namespace check only blocked the four shared tables at
  first — a skill could still reach into *another skill's* table.**
  `store.test.ts`'s own test for this (`"a skill cannot reach another
  skill's table"`) failed the first time it ran, which is exactly what
  it's for. Fixed by additionally checking that every literal `skill_`
  marker in a statement is followed by the calling skill's own id, not
  just checking the four core table names.
- **`brief`'s router-phrased output was subtly wrong on the very first
  live "good morning" run, and NIM (not a degraded fallback) produced
  it.** Facts were rendered as `"verbosity is terse"` and handed to a
  system prompt that just said "turn facts into sentences" — the 8B
  model interpreted that as something needing *explaining* rather than a
  preference to *relay*, producing "Verbosity is the opposite of being
  terse." Confirmed live that NIM was healthy and fast at the time
  (191ms to `/models`), ruling out "it was the degraded local fallback"
  as an excuse. Fixed with a one-shot example in the phrasing prompt
  (`"verbosity is terse; diet.avoids is peanuts"` → `"You prefer terse
  answers, and you avoid peanuts."`) — the same lesson Phase 3's lane
  classifier prompt already taught: a category description alone
  under-specifies the task; a worked example closes real gaps a
  description can't anticipate.
- `node:sqlite`'s null-prototype rows (see Phase 4's log) bit two more
  tests this phase (`store.test.ts`) the exact same way — worth actually
  remembering as a standing rule for this codebase now, not re-deriving
  it each time: never `assert.deepEqual` a raw `.get()`/`.all()` result
  against a plain object literal, compare fields instead.

---

### Phase 5b — core ↔ senses integration, same-session follow-up, 2026-08-04

**Context.** Phase 5's own close-out flagged a real gap: no phase's
checklist ever wired `core` to the Python voice pipeline built in Phases
1-2. Pedro asked to resolve it before Phase 6 rather than let it keep
compounding — see the conversation for the full reasoning on why (this
isn't a numbered ROADMAP phase, but carries the same rigor: branch,
tests, live verification, documented).

**Built:**
- `core/ipc.ts`: the Node side of `senses/ipc.py`'s newline-JSON Unix
  socket transport — `senses/ipc.py`'s own docstring named this as the
  plan since Phase 1 ("whoever orchestrates them ... core/ from Phase 3
  on"), just never actually done until now.
- `core/skills/conversation/ipc.ts`: the real `Conversation` — `say()`
  sends to `voice`, `ask()` sends the question then waits for the next
  utterance `ears` produces. Deliberately decoupled from any real
  `net.Socket` (takes a plain `sendToVoice(text)` function) so the
  queue/timeout logic is unit-tested without one.
- `core/converse.ts`: the general-conversation fallback docs/SKILLS.md
  § 3's own routing diagram names ("if nothing matches -> general
  conversation, no skill") but Phase 5 never implemented — without it,
  `no_skill_matched` was a dead end, nothing spoke back at all.
- `core/main.ts`: the real entrypoint. Connects to both sockets, loads
  skills, and for every utterance: remembers it, dispatches through the
  skill host or falls back to general conversation, remembers the
  response, fires fact extraction in the background. Replaces `senses/
  echo_bridge.py` outright (deleted — its own docstring already called
  itself a Phase-1-only stand-in for exactly this).
- `core/factExtraction.ts`: automatic durable-fact extraction from
  conversation (owner's explicit request — "o jarvis deveria conseguir
  aprender com o tempo"). Fire-and-forget from `core/main.ts` (never
  adds latency to the spoken response, CLAUDE.md § 7). Confidence is
  deliberately conservative (0.8+ only for explicit statements; anything
  under 0.5 is dropped, never stored shaky) and a malformed model
  response degrades to "nothing learned this turn," never a crash.
- `core/memory/recall.ts` gained `semanticTimeoutMs` (default 1500ms):
  semantic search is now best-effort — recent turns and facts (DB-only,
  no embedding call) still make it into the assembled context even if
  the embedding call is slow. Does not cancel the underlying request
  (`Embedder` has no `AbortSignal` in its contract); just stops blocking
  the response on it — an honest, documented limitation, not silent.
- Voice changed from `Samantha` to `Daniel` (male, British) —
  `senses/voice/config.py`'s `SAY_VOICE` default, owner's explicit choice
  after hearing the first live exchange.
- `Makefile`'s `dev` target now starts `node core/main.ts` in place of
  `senses.echo_bridge`; `docs/BACKLOG.md`'s now-resolved IPC-gap entry
  removed.
- 15 new tests (128 TS total, 148 across both languages): `ipc.ts`
  conversation queue logic, `converse.ts`'s fallback + degradation,
  `factExtraction.ts`'s extraction/filtering/failure-handling,
  `recall.ts`'s new timeout behavior. `core/main.ts` itself is not
  unit-tested, same convention as `senses/ears/main.py`/`senses/voice/
  main.py` — proven live instead.

**Verified live — the actual proof this phase exists for:**
- Full stack (`senses/voice`, `senses/ears`, `core/main.ts`) started via
  `make dev`, real acoustic loopback (`say -v Samantha "Hey Jarvis, good
  morning"`) into the real mic. **Pedro then took over and tested live
  himself**, unprompted, asking real questions ("How are you?", "Can you
  tell me the weather in Punta de la Gada, Azores, Portugal?", "Can you
  make research on internet to find what is the weather for today?") —
  all three round-tripped: heard by `ears`, dispatched by `core` (none
  matched a skill, all three correctly fell through to general
  conversation), answered by NIM through `core/persona.md`, spoken by
  `voice`, and durably written to a real `data/jarvis.db` (confirmed by
  querying it directly afterward — `events` has all six rows, in order).
  This is the first time in the project's history the built `core` (router,
  memory, skills — Phases 3-5) actually received and answered anything
  real, not a fake or a script.
- Fact extraction verified live afterward against real NIM: "I don't eat
  peanuts, I'm allergic to them" -> extracted both `diet.avoids: peanuts`
  and `health.allergies: peanuts`, confidence 0.95 each, both correctly
  linked to their source event.

**Left over — needs Pedro, later, not blocking:**
- Real memory pressure was observed on this 8GB machine during Pedro's
  live test (as low as ~57MB free) — confirmed independent of my own
  session's activity by testing again with the ears/voice/whisper-server
  processes stopped and getting the same result, and confirmed
  independent of embedding model size (even the 45MB `all-minilm` timed
  out, ruling out "just use a smaller model"). The recall timeout fix
  keeps this from blocking a response, but doesn't make it fast — closing
  some apps (this machine had dozens of Chrome renderer processes running
  during the test) or a reboot before the next live session would likely
  help more than anything else on the table right now.

**Decided:**
- **Declined a graph-based memory engine (Graphiti/Zep-style) for fact
  extraction, after researching it at the owner's request.** Real value
  for multi-hop reasoning over large, densely interconnected datasets —
  the production-validated approach (Graphiti) requires Neo4j or FalkorDB
  running alongside it, "at least three systems to provision, monitor,
  and maintain." Neither justified by nor a good fit for one person's
  personal facts (dozens to a few hundred, mostly flat: preferences,
  restrictions, project details) on an already memory-constrained 8GB
  machine. Presented as one of three options; owner chose the simple
  extraction-onto-the-existing-`facts`-table approach. A lightweight
  relation table on top of SQLite (not a new database) is the honest next
  step if real use ever shows facts needing to reference each other —
  not built ahead of that need (CLAUDE.md § 0.6).
- **Fact extraction runs on every utterance, not just ones that "sound
  like" they contain a fact.** Simpler than trying to pre-filter, and
  NIM's rate budget easily covers one owner's real conversational volume
  — pre-filtering would be premature optimization for a cost that isn't
  actually a problem yet.
- **`core/main.ts` uses one long-lived session id (`"default"`) for the
  whole process run.** Real multi-session tracking (new session on wake
  after a gap, etc.) isn't needed by anything built so far; `Memory`'s
  and `SkillContext`'s session-scoped operations just need *a* stable id
  to group a run's conversation under.

**Surprised me:**
- **The "14s converse latency" question turned out not to be a code
  problem at all.** Direct timing showed `classifyLane` and the full
  `generalConversationReply` both completing in ~2.4s on a second call,
  but a *first* semantic-recall embedding call took **46.6 seconds** —
  and a raw `curl` to the same Ollama endpoint, independent of any of
  this project's code, reproduced 26.5s moments later. Suspected "just
  use a smaller embedding model" and tested `all-minilm` (45MB vs
  `mxbai-embed-large`'s 669MB) under the same conditions — also timed
  out past 30s, ruling that out. `vm_stat`/`memory_pressure` showed the
  actual cause: ~57MB of free RAM out of 8GB. This machine's hardware
  ceiling (already established, ADR-001) isn't just a `converse`-lane
  provider-choice issue anymore — it can now visibly throttle a *local*
  embedding call too, under enough concurrent load. The fix that matters
  isn't a smarter model choice, it's not letting a slow call block the
  response at all (the new `semanticTimeoutMs`).
- **`core/main.ts`'s very first real utterances weren't ones I wrote —
  Pedro started talking to the running system on his own** the moment he
  saw it come online, without being asked to. Unplanned, and exactly the
  kind of organic validation a synthetic test can't produce — three
  genuinely varied real questions, all handled correctly on the first try.

---

### Phase 6 — built, 2026-08-04

**Built:**
- `core/gate/db.ts`: `approvals` + `audit_log` schema on the same
  database file `core/memory/db.ts` already opens (not a separate file —
  same pattern `core/skills/store.ts` uses for skill-owned tables).
  `audit_log` is append-only via the same `RAISE(ABORT)` trigger pattern
  Phase 4 used for `events` — CLAUDE.md § 5: "The audit log is
  append-only. Rejections are logged too."
- `core/gate/hmac.ts`: HMAC-SHA256 over `{id, nonce, payload}`.
  `sign()`/`verify()` take the key as a plain argument — pure,
  synchronous, directly unit-tested. `getSigningKey()` is the only impure
  piece: self-provisions a random 32-byte key into Keychain
  (`jarvis-gate-hmac-key`, distinct from `jarvis-nim-key`) the first time
  it ever runs on a machine — nothing external issues this one, unlike an
  owner-supplied API key. Signature comparison is timing-safe (a manual
  constant-time XOR loop, not `===`) — a real if narrow side channel
  otherwise, for something whose whole job is proving possession of the
  key.
- `core/gate/gate.ts`: the `ApprovalRequest` lifecycle (SPEC.md § 8),
  server-authoritative. `propose()` checks the capability's tier
  (`GREEN_CAPABILITIES`, already defined in `shared/types.ts` since
  Phase 3) — green runs unprompted and logs `green_auto_run`; yellow
  creates a `pending` row, logs `created`, and returns a `Promise` that
  only resolves via `decide()` or its own expiry timer (default 5 min,
  `DEFAULT_EXPIRY_MS`). `decide()` fails closed — logged as `rejected`
  with `reason: "replay"` — for anything not currently `pending`: an
  already-decided nonce, a wrong nonce against the right id, or an
  unknown id, all lumped into the same "don't honor it" bucket. A
  decision arriving after `expiresAt` (simulated via an injectable `now`)
  is treated as expired even if the real timer hasn't fired yet.
  `markExecuted()` completes the `approved -> executed` leg for a future
  executor (Phase 12+) to call — not exercised by any real caller yet
  (`core/executors/` is still just Phase 5's README stub), built now so
  the lifecycle SPEC.md § 8 describes is whole and tested, not half-done.
- `core/skills/context.ts`: `buildSkillContext` now takes an optional
  `gate: Gate` — when given, `ctx.propose` is bound to that skill's id
  and routed through the real lifecycle; omitted (every existing test,
  and any future caller that hasn't wired one) falls back to
  `stubPropose`'s honest refusal, never a silent no-op.
- `core/gate/cli.ts` + `core/main.ts`: `watchApprovalCommands()` reads
  `list` / `approve <id>` / `reject <id>` from the same terminal
  `make dev` runs in, concurrently with the ears/voice loop. Not a
  separate CLI *process* — `Gate`'s pending approvals are `Promise`
  resolvers living in `core`'s own memory (the `pending` map in
  `gate.ts`), so only something running inside that same process can
  resolve one. `shared/types.ts`'s `approval.decide` client event exists
  for exactly this over a WebSocket once Phase 7 builds a dashboard; this
  is the no-new-infrastructure equivalent until then.
- 20 new tests (156 total across both languages): `hmac.test.ts` (sign/
  verify round-trip, tampered payload/nonce, wrong key, determinism),
  `gate.test.ts` (12 cases covering the full lifecycle including replay
  and clock-skew expiry), `capabilityTier.test.ts`, `context.test.ts`
  (the real-gate-vs-stub wiring).

**DoD — all measured, most live:**
- **A proposed action blocks until answered:** PASS — unit-tested
  (doesn't resolve before a decision) and confirmed live against a real
  Keychain-backed `Gate`.
- **Replaying a spent nonce fails and logs `reason: replay`:** PASS,
  live — confirmed against a real audit log: `rejected
  {"reason":"replay"}` after re-deciding an already-approved request.
- **An expired approval cannot be executed:** PASS — the real timer path
  (short `expiresInMs`, waited for real) and the clock-skew path
  (injected `now()`, no real wait) both tested.
- **A green-tier action runs unprompted and is still logged:** PASS,
  live — `green_auto_run {"capability":"MEMORY_READ","skillId":"brief",...}`
  in the real audit log, resolved with no blocking at all.
- **`brief` still works unchanged:** PASS — its own 5 tests rerun
  unmodified after wiring the real gate into `context.ts`, all still
  green (`brief` is `MEMORY_READ`-only and never calls `ctx.propose`, so
  this was expected to hold, and does).

**Decided:**
- **Gate tables live in the same database file as `core/memory/db.ts`'s
  schema, not a separate one.** One `DatabaseSync` handle for the whole
  process, same reasoning `core/skills/store.ts` already established for
  skill-owned tables — no benefit to a second file, real cost in having
  to open, migrate, and reason about two.
- **`sign()`/`verify()` are pure and take the key as an argument;
  `getSigningKey()` (the Keychain I/O) is not unit-tested.** Same
  precedent as `core/router/keychain.ts`, which has never had a test file
  — real system dependencies are proven live, not mocked; what's actually
  security-critical (the signing math) is what gets the thorough test
  coverage.
- **No standalone `core/gate/cli.ts` *process* — approval commands are
  read from stdin inside the same `core` process instead.** Found while
  designing it: `Gate`'s pending approvals resolve via in-memory
  `Promise`s, not database rows a separate process could poll and
  "resolve" — a raw `UPDATE approvals SET state = 'approved'` from
  outside wouldn't call anything, the skill's `await ctx.propose()` would
  hang forever. Reconsidered before writing the broken version, not
  after.
- **`markExecuted()` is built and tested even though nothing calls it
  yet.** `core/executors/` remains empty until Phase 12+; building the
  full state machine now, rather than stopping at `approved`, means the
  lifecycle SPEC.md § 8 actually describes is complete today and an
  executor just has to call one already-tested method later, not design
  new gate behavior itself.

**Left over — genuinely Phase 7's, not this phase's:**
- The dashboard's live approval queue (`ServerEvent`'s `approval.new`/
  `approval.resolved`, `ClientEvent`'s `approval.decide` — already typed
  in `shared/types.ts`) still needs a real WebSocket server in `core` and
  the Next.js client. `core/gate/cli.ts`'s stdin reader is the honest
  stand-in until then, same relationship `senses/voice`'s `say` backend
  has to a future Piper voice, or `conversation/cli.ts` has to real voice
  IPC before Phase 5's integration work.
  **Resolved in Phase 7** — see its log below.

---

### Phase 7 — built, 2026-08-04

**Built:**
- `core/ws.ts`: `WebSocketServer` (the `ws` package) attached to the same
  `http.Server` `core/http.ts` serves REST from, one port
  (`JARVIS_DASHBOARD_PORT`, default 8787). Subscribes to `Gate`'s new
  `"approval.new"`/`"approval.resolved"` events and re-broadcasts them as
  `ServerEvent`s; the only thing it accepts back from a client is
  `approval.decide`, relayed straight into `gate.decide()` — no approval
  logic lives in `core/ws.ts` itself.
- `core/gate/gate.ts`: now `extends EventEmitter`. `propose()` emits
  `"approval.new"` (wire-shaped via a new `rowToRequest` mapper,
  `ApprovalRow`'s snake_case DB shape -> the public camelCase
  `ApprovalRequest`); the expiry timer and `settlePending()` (covering
  approve/reject/expire-via-decide) emit `"approval.resolved"`. Also
  gained `listPendingRequests()` — the same `rowToRequest` mapping over
  `listPending()`, for a fresh tab's backfill.
- `core/http.ts`: `GET /api/events` (`Memory`'s new `recentEvents(limit)`,
  all sessions, newest-first — the timeline's data source), `GET
  /api/skills` (`SkillRegistry`'s new `listHealth()`, loaded and disabled
  skills with why), `GET /api/approvals` (`gate.listPendingRequests()`).
  CORS-open (`access-control-allow-origin: *`) since every response is
  either the owner's own history or a pending-approval summary, never a
  credential, and `ui/`'s dev server runs on a different origin/port than
  `core`.
- `core/main.ts`: wires both servers in, broadcasts `transcript` (both
  the heard utterance and the spoken reply, tagged with a new `speaker`
  field) and `thought` (`SkillRoutingTrace`, already computed by
  `dispatch()` and previously discarded — reports the real lane and
  chosen skill/intent or "no skill matched," not a fabricated narration).
- `shared/types.ts`: `transcript`'s `ServerEvent` gained `speaker: "owner"
  | "jarvis"` — the original `{text, final}` shape had no way to tell the
  two halves of a conversation apart, found while wiring the broadcast,
  not speculative.
- `ui/`: scaffolded with `create-next-app` (TypeScript, Tailwind 4, App
  Router, `src/`) + `shadcn@latest init` (Base UI under the hood, not
  Radix — this shadcn generation's own choice, unrelated to this
  project). Own `package.json`/`tsconfig.json`/`eslint.config.mjs` — a
  separate npm project, not a workspace member importing `core/`.
  - `ui/src/lib/types.ts`: hand-mirrors the wire subset of
    `shared/types.ts` the dashboard needs (`make types` codegen was never
    built for either language — see `docs/BACKLOG.md`).
  - `ui/src/lib/use-jarvis.ts`: the one hook everything reads from.
    Backfills `/api/approvals`, `/api/events`, `/api/skills` on mount,
    then layers live `ServerEvent`s on top over a reconnecting WebSocket
    (2s backoff). `decide()` sends `approval.decide` and optimistically
    drops the request from local state rather than waiting on the round
    trip.
  - Components: `Panel`/`CornerBracket` (the Figma reference's visual
    unit), `ApprovalQueue` (list + a shadcn `Dialog` for the full JSON
    payload/diff on expand), `ThoughtStream`, `Transcript`, `Timeline`,
    `SkillHealthPanel`, `StatusBar` (WS connection state + a static
    `CAMERA: IDLE` label — nothing live to show before Phase 8).
  - `ui/src/app/globals.css`: the Figma reference's palette (`#00D4FF`
    cyan / `#FFB84D` amber / `#05080F` deep background), JetBrains Mono
    (`next/font/google`, self-hosted at build time — no runtime fetch to
    Google's CDN), the scanline/corner-bracket/status-pulse look, folded
    into shadcn's own CSS-variable theme rather than replacing it.
  - `ui/eslint.config.mjs`: its own copy of the root
    `no-restricted-imports` executor rule — a separate npm project, no
    inheritance from `eslint.config.js`.
  - `ui/next.config.ts`: pins `turbopack.root` to `ui/` itself — the repo
    root's `package-lock.json` and `ui/`'s own were confusing Turbopack's
    workspace-root guess.
- `core/gate/tests/gate.test.ts`: one new test, `listPendingRequests`
  returns a wire-shaped `ApprovalRequest` with the payload parsed back to
  an object (not the raw JSON string `ApprovalRow` stores).

**DoD — all four measured, live, against the real running `core`
process:**
- **Approve in the browser -> action executes:** PASS. No skill declares
  a yellow-tier capability and calls `ctx.propose()` in a real dispatch
  yet (nothing needs `FS_WRITE`/`SHELL_EXEC` today), so a pending
  approval was injected the same way `gate.test.ts` does it — a second
  `Gate` instance over the same SQLite file the running `core` process
  has open, same self-provisioned Keychain key. Clicking Approve in a
  real headless-Chromium tab produced a real `audit_log` `"approved"`
  entry written by the *running* `core`'s own `Gate` (confirmed by
  querying the DB directly, not by trusting the UI) — see ADR-022 for a
  real mistake this test caught in its own first version.
- **Close the browser mid-approval -> request survives, still pending:**
  PASS. Closed the tab context entirely; the `approvals` row stayed
  `state = 'pending'` in the DB; a fresh tab's `/api/approvals` backfill
  showed it again on reopen.
- **Two tabs stay in sync:** PASS. A third tab, opened before the
  approve click and never interacted with, lost the request from its own
  view at the same moment tab B did — both just WS subscribers of the
  same `core` process, no polling.
- **Grep confirms no executor import path:** PASS —
  `grep -rn executors ui/src` returns nothing; `ui/eslint.config.mjs`
  would also fail the build if one were added.
- Screenshots from each step kept for this session's record (not
  committed — scratch verification output, not a fixture).

**Decided:**
- **One HTTP server carries both REST and the WS upgrade, on one port.**
  No reason for a dashboard client to juggle two ports/origins for one
  logical connection to `core`.
- **`Gate` becomes an `EventEmitter` rather than `core/ws.ts` polling or
  `core/main.ts` calling into `core/ws.ts` directly.** Keeps `Gate`
  ignorant of who's listening (tests, the stdin CLI, and now WS can all
  subscribe or not) and keeps `core/ws.ts` a thin relay with no lifecycle
  logic duplicated from `gate.ts`.
- **The Figma export is a visual reference, not a codebase to adapt.**
  It's Vite + React 19 + Tailwind 4 with no shadcn/ui, no live data, no
  approval queue/timeline/skill-health — reconciling it against the
  actual functional list (ROADMAP.md's own instruction) meant taking the
  palette/typography/panel language and building the real thing fresh
  with `create-next-app`, not forking the mockup.
- **Live DoD verification used Playwright as a plain `ui/` devDependency
  driving real headless Chromium, not the MCP Playwright tool** — checked
  via tool search, unavailable this session. Screenshots + direct SQLite
  assertions stood in for what the MCP tool's snapshot/assertion helpers
  would have given directly.
- **The synthetic approval-injection script asserts through the shared
  SQLite `approvals`/`audit_log` state, not through the injecting `Gate`
  instance's own `propose()` promise.** That promise lives in a
  `pending` map inside the injector's own process — the *running* `core`
  process is the one whose `decide()` actually runs when the browser
  sends `approval.decide`, and it has no way to resolve a different
  process's `Promise`. Caught live (the first version of the script hung
  indefinitely on `await outcomePromise`), not anticipated in advance —
  worth naming because it's the exact cross-process pitfall ADR-021
  already ruled out a standalone `gate/cli.ts` process over.

**Left over — genuinely Phase 8+'s, not this phase's:**
- `ServerEvent`'s `trace` variant (`RouterTrace`, "emitted for every
  router call") stays unwired — needs `core/router/router.ts` itself
  instrumented with a callback, real work `docs/SKILLS.md`/ROADMAP.md's
  Phase 7 DoD doesn't ask for. The `thought` stream (routing traces) is
  live; per-call provider/latency traces are not, yet.
- The camera indicator is a static `CAMERA: IDLE` label — Phase 8 builds
  the actual session lifecycle (`CameraState`, `CameraSession`) this
  would report on live.
- `make types` codegen from `shared/types.ts` — now two hand-kept
  mirrors (Python's, never built either, and `ui/src/lib/types.ts`) —
  logged in `docs/BACKLOG.md`.

**Pre-SOAK audit, 2026-08-04 (same day, before closing):** a full pass
over the docs and repo state before starting SOAK 1 found one real gap —
`make check` never touched `ui/` at all, so a broken dashboard could
reach `main` undetected (contradicts CLAUDE.md § 8: "`main` is always in
a state where `make check` passes"). Fixed: `check` now also runs `ui/`'s
own lint + `next build` (which does its own full TypeScript check once
`.next/types` exists — a separate standalone `tsc --noEmit` step was
tried first and found to fail on a clean checkout / after `rm -rf .next`,
since that types-only include doesn't exist until a build or dev run has
happened once; dropped in favor of just trusting `next build`'s own
check). `make dev` now also starts the dashboard dev server (`cd ui &&
npm run dev`), so daily use during the soak is one command, not two
terminals. Everything else checked — `SPEC.md`, `ROADMAP.md`, `DECISIONS.md`,
`docs/BACKLOG.md`, repo layout, line-length guideline, `.gitignore`
coverage, stray temp files — was already consistent; nothing else changed.

---

### SOAK 1 — in progress, 2026-08-04

**Fixed same day, found via real use:** `data/jarvis.db`'s first real
conversation log showed `converse` confidently claiming to create a
skill, "work on it," and eventually appear on Skill Health — none of it
real or possible at runtime. Same pattern on "see my current location."
Root cause: `persona.md` had honesty rules for numeric claims (SPEC.md
§ 7) but none for capability claims, and `generalConversationReply()`
never told the model what's actually loaded. Fixed in both places;
verified live against real NIM — "can you create a skill?" now gets an
honest refusal. Full detail in the commit and `docs/BACKLOG.md`.

Also found and logged in `docs/BACKLOG.md`: `Transcript` didn't backfill
on open the way `Timeline` does; `make dev`'s `ears` can silently fight
the installed LaunchAgent for the same socket (still open); the
dashboard's visual match to the Figma reference was palette/type/
panel-style only, not layout or the Orb centerpiece.

**Same-day follow-up, owner asked directly:** real-time state
(listening/thinking/speaking, from real `ears`/`voice` signals, not
synthetic), errors reported to the owner instead of only a server log,
Transcript backfill, and the Orb/grid/scanline/layout brought over from
the Figma reference. Full detail in DECISIONS.md's ADR-023. Verified
live end to end on an isolated instance: real timestamps, all four
states, screenshotted. 139 TS + 22 Python tests, `make check` green.

**Found immediately after, real use again:** the new `Orb` hydration-
mismatched on every load (server/client float rounding differing in the
last digit across ~130 SVG circles' `cos`/`sin` positions -- a real
cross-runtime discrepancy, not a math bug). Fixed by rendering it
client-only (`next/dynamic`, `ssr: false`) rather than rounding the
coordinates -- its state only exists client-side anyway (WebSocket-
driven), so SSR wasn't preserving anything real. Verified: zero console
errors/warnings on a fresh `next dev` load.

**Same day, asked directly to make JARVIS actually do things:** the gate
gained a real executor mechanism (`Gate` calls a registered `Executor`
on approval, `decide()` now `async`) -- closes a real gap where
`MEMORY_WRITE` approvals resolved with a signed execution nothing ever
consumed. Five new skills, all real: `system_health` (CPU/mem/disk),
`weather` (Open-Meteo, free), `tasks`/`shopping_list` (`ctx.store`
CRUD), `launcher` (open apps, list/open real project directories --
`~/Developer/Programação`'s actual 8 projects, confirmed live). Full
detail in DECISIONS.md's ADR-024.

Two more real bugs found and fixed via live loading/routing, not caught
by any existing test: `SkillRegistry.loadAll` passed the same fixed
`SkillInitContext` (with `store: undefined as never`) to every skill,
so any skill using `ctx.store` in `init()` always failed to load --
never hit before because no skill needed one until `tasks`/
`shopping_list`. Now a per-skill factory. And the lane classifier routed
"how's my computer doing" to `see` instead of `converse`, so
`system_health` never got a chance to answer and the general-
conversation fallback gave a vague, unverified "system health is
normal." One new few-shot example fixed it and raised the full 45-case
lane benchmark from 93.3% to 97.8% (`bench/bench_router_lane.ts`, live,
real NIM calls) -- no regression, the fix generalized.

Verified live beyond unit tests: a real `Calculator.app` launch through
the full propose → approve → real-executor path (confirmed by PID, then
closed); real Open-Meteo weather calls; real system metrics (memory at
99% used on this machine -- a genuinely useful number surfaced, not
just a demo). 183 TS tests (up from 139), `make check` green end to end.

**Same session, three more backlog ideas built:** `SHELL_EXEC` became a
real dispatcher (`core/executors/shell.ts`) instead of one executor per
capability -- music control, opening URLs, and volume/brightness all
route through it by `payload.action`, no new capability per action.
Volume uses a real built-in AppleScript command; brightness needs the
free `brightness` CLI (not installed on this machine -- reports that
plainly rather than guessing at an unverified hardware-key hack).
`open_url` joined `launcher`; `media` is a new skill (play/pause/skip,
`now_playing` as an ungated read, volume, brightness). Full detail in
DECISIONS.md's ADR-025.

Verified live: a real system volume change (63 → 40, restored after)
through the full propose → approve → executor path; a real browser tab
opened the same way; `now_playing` honestly reported nothing playing
against the real, not-running Music.app. Deliberately skipped a live
`play` test -- unlike a Calculator window, unexpected audio is a more
intrusive surprise than needed for this round; unit coverage stands in.
210 TS tests total, `make check` green end to end.

**Same day, asked to read the real conversation log and check what's
actually working:** found and fixed four real bugs, none caught by any
existing test since all four need real phrasing or real speech, not
fixtures. "Can you open Facebook?" and "what's playing" were both
falling through to `converse`'s general-reply fallback because
`launcher`/`media`'s intents only declared `converse` while the lane
classifier read them as `act`/`reflex`/`see` -- fixed with multi-lane
manifests (`wardrobe`'s own precedent), except `now_playing`, where a
prompt-based fix was tried first, found to regress 3 unrelated cases on
the full lane benchmark (97.8% → 91.1%, confirmed clean), and reverted
in favor of the same manifest-lane approach. `shopping_list`'s own
examples used "coffee" in two places, pulling any unrelated
coffee-mentioning `tasks` request into the wrong skill live ("remind me
to drink coffee at 9am" → misrouted) -- swapped to "butter." Also fixed
a small trailing-punctuation cosmetic bug ("Added: X..") found in the
same log.

The very first bug from this SOAK's first real conversation -- "Ponta
Delgada, Açores" transcribed as "Ponta del Gada, Zoris" -- got a real
fix too: `senses/ears` now passes Whisper a vocabulary hint
(`--prompt` + `--carry-initial-prompt`), tested clean (exact phrase
correct, diacritic included, English calls before/after unaffected).
Tried swapping to a multilingual Whisper model first; two different
synthetic-voice tests came back inconclusive-to-worse, not shipped.
Full detail, including the prompt-regression lesson, in DECISIONS.md's
ADR-026.

211 tests, `make check` green, lane benchmark confirmed back at 97.8%
after the revert (checked twice, clean both times).

**Same day, the actual root cause behind the "weather: tomorrow's
weather" bug reported above:** `core/factExtraction.ts` wrote extracted
facts straight to `memory.upsertFact()` with zero review, a gap that
predated Phase 6's gate (built in Phase 5b) and was never closed even
after the gate existed. Fixed: `extractAndRememberFacts` now proposes
each fact to the gate (`MEMORY_WRITE`) instead of writing directly; the
extraction prompt gained three counter-examples for the failure patterns
actually observed (a request to the assistant, a task/reminder, and the
topic of a question, none of which are facts about the owner); all 23
existing facts deleted from the real DB rather than curated, since none
were ever reviewed in the first place. 213 tests, `make check` green.
Full detail in DECISIONS.md's ADR-027.

**Same day, asked to test more rigorously and verify the dashboard shows
everything with Playwright, "as if you were me":** ran a fresh isolated
`core`+`ui` instance (scripted fake ears feeding real reported phrasing,
scratch DB) and drove the real dashboard with Playwright end to end --
transcript, skill health (all 8 skills), approval queue, approve/reject
round-trip (confirmed via `audit_log`, not just the UI), system status,
Orb, console errors. Two real things came out of it:

1. **Thought Stream and Error Log didn't backfill on a fresh tab** --
   same class of gap ADR-023 already fixed once for Transcript, never
   generalized to these two panels. `core/ws.ts`'s own docstring says
   the live channel is push-only by design, so a fresh tab needs a
   REST snapshot; that existed for transcript/approvals/events but not
   these two. Fixed with a new `core/dashboardHistory.ts` -- a small
   in-process ring buffer (50 thoughts, 20 errors, matching the
   client's own caps), deliberately *not* stored in the `events` table
   `Memory.recall()` reads from (routing/error telemetry leaking into
   conversation recall is a real risk, not a hypothetical one -- see
   finding 2 below). Two new endpoints (`/api/thoughts`, `/api/errors`),
   `use-jarvis.ts` seeds both on mount the same way it already does for
   transcript/approvals. Verified live: reloaded the tab after real
   routing decisions and a real error had already happened, both panels
   now show them immediately instead of "No routing activity yet."

2. **NIM was genuinely unreachable during this test** (confirmed
   directly: `curl` to the NIM endpoint timed out at 10s) -- the same
   failure Pedro's own pasted transcript showed for "Can you open
   Facebook?" This forced every `converse`-lane call, including lane
   classification itself, through the local `qwen2.5:0.5b` fallback.
   Live evidence this session: that fallback frequently misclassified
   ordinary utterances ("add butter to the shopping list", "Can you
   open Facebook?") as lane `see` instead of `converse`/`act`, so the
   correct skill was never even considered by `dispatch` -- filtered
   out before scoring, not a low-confidence miss. Also reproduced the
   general-conversation fallback echoing raw recalled-memory text
   (formatted `[owner] ...\n[jarvis] ...`) verbatim as a spoken answer
   on one turn, and fact extraction on the same tiny model produced
   mostly garbage (5 of 6 extracted facts nonsense, including literally
   extracting the extraction prompt's own placeholder syntax
   `project.<name>.status` as a fact key) -- all safely caught as
   pending approvals by ADR-027's fix rather than corrupting memory,
   confirming that fix holds up under exactly the failure mode it was
   built for. **Not fixed this session** -- root cause is NIM
   availability plus this machine's own resource pressure (98% RAM,
   100% CPU with the full stack up), and the right fix (retry/backoff
   tuning, a better local fallback, or a non-LLM lane-classifier
   fallback) is real design work, not a same-session patch. Logged in
   `docs/BACKLOG.md` for a real look.

213 tests still (dashboardHistory has no new test file yet -- it's a
plain ring buffer, exercised live via the Playwright pass above; add a
unit test if it grows any real logic), `npx tsc --noEmit` clean in both
`core` and `ui`, `make check` green.

**Same day, asked to brainstorm and then build dashboard features for
more real SOAK test data:** five features, all built and live-verified
same session so testing could start the next day -- a dashboard "test
console" that injects a typed line into the exact same handling path a
real transcribed utterance goes through; a 👍/👎 on each spoken response
(real labeled data, never model-set); live, dashboard-editable
Tasks/Shopping panels (toggle/delete write straight to the skills' own
`ctx.store` tables); and an aggregated metrics widget (utterances
today/this week, lane distribution, skill hit rate, no-skill-matched
rate) computed by a new, separately-unit-tested pure function
(`core/metrics.ts`). `core/main.ts`'s utterance handling became one
shared `handleUtterance(text)` function so a real and an injected
utterance are indistinguishable once they land. Full detail in
DECISIONS.md's ADR-029.

Live-verified with Playwright against a fresh isolated instance, not
just unit tests: typed console input dispatched for real; a dashboard
checkbox toggle and a dashboard delete both confirmed against direct
DB reads, not just the UI; a 👎 click confirmed in `event_feedback`;
metrics numbers hand-checked against what actually happened. Found and
fixed in the same pass, not before: the dashboard's side columns had
no way to reveal content taller than the viewport once the new Metrics
widget pushed past the bound -- would have shipped invisible otherwise.
Also confirmed, twice more, that the ADR-028 lane-classifier-under-
degraded-conditions gap is still open (unrelated to this session's
changes) -- still not fixed, now with two more live reproductions on
record in `docs/BACKLOG.md`.

224 tests, `make check` green.

**Same day, Pedro's own first real `make dev` session with the new
dashboard, real voice via the wake word:** asked to dig into
`data/jarvis.db` to see what needs improving. The new `routing_stats`
table (shipped hours earlier) turned this from "guess from response
phrasing" into "read exactly what dispatch decided" for the first
time. Four real bugs found and fixed, all confirmed with real data, not
assumed:

1. `shopping_list`'s `remove_item`/`clear_list` were `converse`-only --
   "delete milk sugar from the shopping list" classified as `act`,
   "remove or delete milk sugar" classified as `see`, both silently
   missed the skill (`routing_stats` confirmed `NO MATCH` for both).
2. **The real, serious one:** when dispatch fell through from (1),
   `converse`'s fallback *claimed to have deleted the item* -- twice,
   with different phrasing each time. Neither deletion ever happened;
   the garbage item was still sitting in the real DB. Same class of bug
   as the earlier "converse hallucinated capabilities" fix, now shown
   to extend to concrete, checkable claims about the owner's own data,
   not just abstract capability claims. `core/persona.md` gained an
   explicit rule against this, with a test confirming it reaches the
   model.
3. "Add milk and sugar to the shopping list" stored as one item with a
   literal embedded newline -- the extraction prompt had no protocol
   for more than one item. Pedro tried to correct it explicitly and
   got the identical bug again. Fixed: one item per line, one row per
   item.
4. "Drive to Lagoa" transcribed as "Drive to La Goa" -- same root cause
   and fix as the earlier "Ponta Delgada" bug, added to the same
   Whisper vocabulary hint.

`system_health` also given the same multi-lane backstop as a
preventive measure (it already broke once, ADR-024, with no structural
safety net of its own -- only a classifier prompt example, which
ADR-026 already proved can regress from unrelated changes).
`tasks`/`brief`/`weather` are still `converse`-only with no direct
evidence of breakage -- left alone, flagged in `docs/BACKLOG.md` rather
than guessed at.

The real, corrupted production shopping list was repaired: the two
garbage newline-merged rows deleted, replaced with clean "Milk" and
"Sugar" (restoring what Pedro actually asked for), "water" untouched.
Live-verified, not just unit-tested: replayed Pedro's exact failing
phrasing against a fresh isolated instance and confirmed both now
reach the real skill (honest "couldn't find X" responses, not
hallucinated success). Full detail in DECISIONS.md's ADR-030.

226 tests, `make check` green.

**Same day, the owner offered five free-tier API keys (Cerebras,
OpenRouter, Groq, Google AI Studio, Mistral) and asked for them to be
tested live and wired in ahead of `ollama`:** all five tested directly
against their real endpoints before any code was written (this session
had already been burned three times guessing model names that turned
out deprecated). Cerebras authenticates but has no usable free quota
(HTTP 402 on every model) -- no provider written for it, kept out of
the codebase entirely rather than left as dead config. The other four
all work: `groq` (~200ms, fastest), `mistral` (~380ms), `google`/Gemini
(~1.6s, thinks before answering), `openrouter` (slowest, free models
route through a shared upstream pool). New fallback order for both
`converse` and `reason`: `nim` → `groq` → `mistral` → `google` →
`openrouter` → `ollama`/`offline-fallback` -- `ollama` moved from
second to last per the owner's explicit call (its `qwen2.5:0.5b` is
worse than any of the four real remote models). `reason` gained a real
fallback chain for the first time; it previously went straight from
`nim` to a static "can't reach it" message.

15 new tests (241 total), `make check` green. Live-verified against the
real `Registry`, not just unit tests: with `nim` unreachable at the
time (same live flakiness already documented in ADR-026/028/030), a
real `converse` request, a real strict-JSON-mode request (the lane
classifier's exact shape), and a real `reason` request were all
correctly answered by `groq` after falling through -- the new chain
already saved a real request during this same session. Full detail in
DECISIONS.md's ADR-031.

**Same day, Pedro's second real `make dev` session with the new
provider chain live:** routing itself worked well throughout --
`shopping_list.clear_list`, `launcher.open_url`, and an honest
capability refusal all correctly dispatched or fell through as
intended. One real bug: "weather for tomorrow" dispatched correctly to
`weather.current_weather`, then hung on `ctx.ask()` -- the skill has no
forecast capability at all and silently ignored "tomorrow," asking for
a city instead of saying so. Fixed: a `FORECAST_PATTERN` check up
front now refuses honestly ("I can only tell you the current weather
right now, not a forecast for another day") without ever calling
`ctx.ask()`. Also confirmed via the real DB: the owner has never
actually completed the "what city" flow successfully yet -- no
`location.city` fact exists, so that question will keep coming up
until he answers it once and approves the resulting `MEMORY_WRITE`.
242 tests, `make check` green. Full detail in DECISIONS.md's ADR-032.

**Same day (2026-08-05/06), asked to reverse the English-only rule
(bilingual PT-PT/English conversation, documentation only -- see
CLAUDE.md § 0.1 and ADR-033) and then to research and build the
highest-value, lowest-risk items for real SOAK testing:** picked
hybrid recall and real Spotify control.

Hybrid recall (`core/memory/rrf.ts` + `core/memory/keywordSearch.ts`,
fusing SQLite FTS5 keyword search with the existing vector search by
Reciprocal Rank Fusion) surfaced a genuinely major, previously-
undetected bug while being wired in: `core/main.ts` had only ever
called `Memory.appendEvent()` for real conversation, never `Memory.
remember()` -- meaning **semantic recall had never actually indexed a
single real utterance or response in production since Phase 4**,
silently, with no error (`assembleContext()`'s own graceful-degradation
design made this indistinguishable from "nothing relevant was ever
said"). Fixed with a new `Memory.indexEvent()`, called fire-and-forget
right after each conversation-turn `appendEvent` (same latency
reasoning as fact extraction, CLAUDE.md § 7). Confirmed live against a
fresh scratch DB: `memory_vec`/`events_fts` row counts actually match
real conversation now, where they would have stayed at zero before.

Spotify control: `core/executors/media.ts` and `skills/media/index.ts`
now detect which app is actually running (`System Events`) and target
that one, defaulting to Music.app as before when neither is running.
Found and fixed a real lint violation along the way -- even a
type-only import from an executor into a skill trips CLAUDE.md § 5b's
rule; fixed by duplicating the small `MediaApp` union in the skill
file instead, same pattern already used for `MediaCommand`.

Also found live, during the same verification pass, not caused by
tonight's changes: "I don't eat peanuts, I'm allergic" mis-dispatched
to `shopping_list.remove_item` -- a real embedding-example collision
(confirmed via `routing_stats`: the lane classification itself was
correct), same bug class as the "coffee" collision ADR-026 already
fixed once. Not fixed this session -- logged in `docs/BACKLOG.md`
rather than guessed at.

15 new tests, 257 total, `make check` green. Full detail in
DECISIONS.md's ADR-034.

**Same day, corrected the Spotify default** (owner uses only Spotify,
never Music.app) and then proceeded with the Gmail MCP integration
from the 2026-08-05 research: real `core/mcp/` architecture
(`McpRegistry`, Google's standard OAuth authorization-code flow,
`MCP_TOOL_CALL` as a new, deliberately uniform capability -- every MCP
tool call requires approval, never auto-run from a server's own
self-declared "read-only" hint), a `gmail` skill that discovers the
real tool name/argument shape at runtime rather than hardcoding a
guess (genuinely unverifiable without a live connection), and
`bench/gmail_authorize.ts` for the owner's one-time setup.

Two real bugs found live while verifying, both fixed same day:
`core/skills/loader.ts` kept its own separate `VALID_CAPABILITIES`/
`VALID_LANES` lists from `shared/types.ts`'s own union types -- adding
the new capability to the type alone wasn't enough, the skill loaded
disabled until this second list was updated too. Fixed for good, not
just patched: both lists are now `Record<Capability/Lane, true>` keyed
by the full union, so a future drift is a compile error, not a silent
disabled skill. Skills also don't auto-discover from the filesystem --
`core/skills/registered.ts` is a hand-maintained list; `gmail` didn't
load at all until added there.

25 new tests, 284 total, `make check` green. Live-verified everything
reachable without the owner's own Google Cloud Console setup: core
boots cleanly with zero Gmail credentials present, "check my email"
correctly routes to the `gmail` skill (not some other skill by
accident), and responds honestly that Gmail isn't connected yet. The
real authorized connection is blocked on the owner running the setup
in `README.md`'s new "3c" section. Full detail in DECISIONS.md's
ADR-035.

**Same SOAK, next day (2026-08-06):** owner completed the OAuth setup.
First attempt hit Google's `403 access_denied` on the consent screen
itself (OAuth client in "Testing" status, owner's account not yet on
the Test users list) -- fixed on the owner's side via Cloud Console,
not a code issue. Second attempt succeeded; refresh token stored.

Live verification immediately past that found two more real problems,
both from *actually* connecting instead of stopping at "credentials
present":
- **A real bug in `core/mcp/registry.ts`'s `register()`:** it recorded
  the connection before awaiting `listTools()`, so a `listTools()`
  failure left the server permanently half-registered --
  `hasServer()` true, tool cache stuck empty. Fixed by reordering so a
  failure there means the server never registers at all. New
  regression test added.
- **The actual cause of that failure: README's setup steps were
  incomplete.** A raw `fetch()` against the real Gmail MCP endpoint
  (bypassing the SDK to see the true HTTP status/body) showed Google's
  own error: the **Gmail MCP API** (`gmailmcp.googleapis.com`) needs
  enabling in Cloud Console *separately* from the "Gmail API" README
  already mentioned -- two different APIs, easy to conflate. README's
  step 4 now lists both. Also found, and worth remembering rather than
  re-debugging blind next time: Google's `tools/list` endpoint
  returned HTTP 403 with a *fully valid* tool-catalogue body (status
  and body disagreeing) -- only `tools/call` gave an unambiguous
  answer. Confirmed reproducible twice, not a network blip.

285 tests total, `make check` green. **Still open:** owner needs to
enable "Gmail MCP API" and let it propagate; the actual authorized
`tools/call` against Gmail, and therefore `skills/gmail` end to end,
remains unverified. The real tool catalogue captured during this
session (visible in DECISIONS.md's ADR-036) suggests
`findSearchTool`/`guessQueryArgName` will resolve correctly once a
call succeeds, but that is analysis, not verification -- a follow-up
live run is still needed. Full detail in ADR-036.

**Same day, follow-up:** owner enabled "Gmail MCP API," then also
"Gmail API" on a second pass. `tools/list` now succeeds cleanly (13
real tools, confirmed matching the analysis above). But every actual
data call -- `search_threads`, `list_labels`, tried separately --
fails identically with `"The caller does not have permission"`,
despite a verified-correct, correctly-scoped OAuth token
(`gmail.readonly` + `gmail.compose`, checked via Google's own
`tokeninfo` endpoint). Three real fixes in a row (test users, Gmail
MCP API, Gmail API), symptom unchanged -- stopped per CLAUDE.md § 2
and searched for the exact error instead of guessing a fourth Cloud
Console setting. Found it: a publicly reported, currently-open bug in
Google's own Gmail MCP connector, same error string, same shape,
unrelated to this project or account
([anthropics/claude-ai-mcp#229](https://github.com/anthropics/claude-ai-mcp/issues/229),
[#424](https://github.com/anthropics/claude-ai-mcp/issues/424)).
Gmail integration is now code-complete, tested, and live-connected --
OAuth, registry, tool discovery all confirmed real -- but not usable
for actual searches until Google fixes their end. No code change
needed: `skills/gmail` already speaks the failure honestly instead of
crashing or faking a result. `docs/BACKLOG.md` updated to say so
plainly instead of the old "owner setup incomplete" framing. Full
detail in ADR-037.

**Same day, next task: the standing "peanuts" bug.** Asked to build
real benchmark infrastructure before touching `DISAMBIGUATION_SYSTEM`
rather than patch on a hunch. Found and fixed a real, separate gap
first: `tsconfig.json` never included `bench/**`, so `make check` had
never actually type-checked any bench script -- `bench_skill_routing.ts`
had already drifted from `SkillContext`'s real shape (missing `mcp`)
with nothing catching it. Fixed both.

Built `bench/bench_disambiguation_fallback.ts`, forcing disambiguation
onto the real degraded model (`qwen2.5:0.5b`) instead of the healthy
one, since that's what the live bug actually needed. Baseline: 42.9%,
bug reproduced cleanly. Two prompt fixes tried against it -- a worked
counter-example, then a shorter single rule -- **neither fixed a single
degraded-model case**, and the second one **regressed two unrelated,
previously-correct cases** on the healthy-model benchmark. Both
reverted; confirmed via `git diff` that `dispatch.ts` is byte-for-byte
unchanged from before this session. Also found, warming the model up
first still isn't enough to beat production's 3s timeout --
`qwen2.5:0.5b` measured ~29.7s cold-load on this machine, which can't
hold both it and the embedding model resident at once. Confirmed this
fails safely (an honest spoken error, never a crash) by reading
`core/main.ts`'s own try/catch, not assuming it.

Net result: no prompt change shipped (both real attempts were
benchmark-rejected, exactly the outcome ADR-026's own discipline exists
to catch before it ships) but real, reusable diagnostic infrastructure
kept, and the true scope of the problem is now sharper and merged into
ADR-028's already-open item rather than treated as two separate small
bugs. Full trail in ADR-038; `docs/BACKLOG.md` updated to match. 285
tests unchanged, `make check` green.

**Same day: bilingual PT-PT/English, the real implementation (ADR-039).**
Asked to work the full open-items list from the last status review, in
order, deciding independently, asking only on genuine forks. Asked 3 up
front: ship with the only installed PT-PT voice (Joana, female) or wait
for a male one -- **ship now**; one voice per whole reply or per
segment -- **whole reply**; add PT-PT manifest examples to all 9 skills
now or wait for real usage -- **all now** (owner's explicit call,
overriding the incremental default this session would have picked).

Built and live-tested: `senses/ears` swapped to multilingual Whisper
(`small`, `-l auto`, confirmed via `--help` before assuming) --
transcribed a real PT sentence and a real EN sentence correctly via a
scratch `whisper-server` fed real `say`-generated audio. Found and
documented (not fixed after two real attempts) one limitation: an
English loanword inside a Portuguese sentence gets heard as a similar
Portuguese word ("commit" -> "comité"); a vocabulary-hint fix that
worked for a similar problem before (ADR-026) didn't help here.
`senses/voice` gained `language.py` (boring word/diacritic scoring, no
new dependency) picking one voice per whole reply -- first version
misfired on an English sentence mentioning one Portuguese place name,
fixed by requiring PT evidence to outweigh English evidence rather than
any diacritic being an automatic override. `core/persona.md` gained a
bilingual section; no skill's own `persona.md` needed touching
(inheritance already covered it, checked not assumed). All 9 skill
manifests gained real PT-PT paraphrase examples.

Built `bench/bench_router_lane_pt.ts` (PT version of the Phase 3 lane
benchmark) before touching anything -- found a real, measured gap:
**77.8%** PT accuracy vs. English's 97.8%. All 10 failures matched an
existing English disambiguation rule in `LANE_CLASSIFIER_SYSTEM` that
had no Portuguese example of the same distinction. Added the missing
PT-PT examples next to their English counterparts (data, not prompt
instructions -- CLAUDE.md § 4 still holds), re-ran both benchmarks per
ADR-038's fresh lesson about verifying a shared-prompt edit both
directions: **PT rose to 100%, English held at 97.8%** (identical to
the pre-change baseline, no regression). Extended `bench_skill_routing.ts`
with 6 real PT dispatch cases: **93.3%**, clears the 90% DoD bar; the
one miss is the same class of disambiguation-margin noise the English
suite already has one of, deliberately not chased into
`DISAMBIGUATION_SYSTEM`.

29 Python tests (up from 28), 285 TS tests unchanged, `make check`
green. **Owner-required, not yet verified:** real accuracy against the
owner's actual voice/accent, and whether Joana's voice quality is
acceptable for daily use -- everything tested so far is synthetic audio
or text-level benchmarks. Full detail in ADR-039; `docs/BACKLOG.md`'s
bilingual entry marked built with what remains.

**Same day, item 2 of the status-review list: degraded-mode lane
classification (ADR-040).** Asked directly how to handle the known,
open ADR-028 gap. Before proposing anything, re-verified this same
day's own earlier, more alarmed finding (a ~30s cold-load figure from
ADR-038) live: a script matching `core/main.ts`'s exact try/catch,
against a genuinely cold model, answered within the existing 3s budget
twice in a row -- the 30s figure was a one-off disk-cache artifact, not
real steady-state behavior. Corrected both ADR-038's and this earlier
entry's own record rather than let a wrong number stand. The real,
confirmed failure mode is ADR-028's original one: fast, but wrong
("add butter to the shopping list" -> `see`).

Offered 3 options (fail honest / no-model heuristic / leave as-is);
owner chose the heuristic -- keep some real capability during a total
outage rather than fail outright. Built `core/router/laneHeuristic.ts`
(boring bilingual regex rules, same spirit as `reflex`'s own
`RulesProvider`, defaults to `converse` when unsure since that fails
softer than a wrong `reflex`/`see`/`act` guess). `classifyLane` now
tracks which provider actually answered and prefers the heuristic over
trusting `ollama`'s own JSON specifically -- every other provider
unchanged. Live-verified against the real `OllamaProvider`, not just
fakes: the exact documented bug case now resolves correctly, in both
English and Portuguese.

294 tests (up from 285), `make check` green. Still open, not attempted:
`disambiguate()`'s own equivalent gap (the "peanuts" misroute) --
needs real per-skill logic, a bigger ask than lane classification's
fixed 5 categories. Full detail in ADR-040.

**Same day, item 3: `clipboard` skill (ADR-041).** First of the Tier 1
backlog items, `pbpaste`/`pbcopy` -- built-in, no research needed unlike
Focus Mode or Home Assistant (still open, the latter needs asking the
owner whether he even has smart-home devices). Both read and write
route through `SHELL_EXEC`, not a green auto-run as the backlog note
first sketched -- clipboard content is arbitrary and could be
sensitive, same reasoning `FS_READ`'s whitelist already uses.

Found and fixed a real bug the same way as the others today: ran the
new skill through `bench_skill_routing.ts` before calling it done, and
`write_clipboard` ("copy this for me," "put this on my clipboard")
turned out unreachable -- the lane classifier reads "copy"/"put" as
command verbs (`act`), but the intent was declared `converse`-only.
Confirmed the real cause (not guessed) by inspecting real embedding
candidates and the real classified lane directly before fixing: same
pattern already named in ADR-026/ADR-030. Declared both lanes, verified
93.8% on the benchmark, up from 90.6%.

11 new tests, `make check` green. Live-verified the real `pbcopy`/
`pbpaste` round trip (including emoji) outside the fakes. `docs/
BACKLOG.md`'s clipboard item marked built.

**Same day, next Tier 1 item: `capture_screenshot` added to the same
skill.** `screencapture -i -c` -- interactive selection, straight to
clipboard, no file touches disk. Found a real gap live, not assumed
fixed: a non-interactive test capture exited 0 but the clipboard held
stale text afterward, not image data -- this machine's Screen Recording
permission likely isn't granted yet, and `screencapture` gives no
distinguishing exit code for that case, so both the executor and the
skill's speech say "sent," never "captured." Owner-required: grant the
permission, confirm live once done.

Needed both `act` and `see` lanes, not just `act` -- "grab a screenshot
of this for me" classified as `see` (confirmed via a real embedding
check first: 0.958 match, filtered out purely by lane mismatch, not an
embedding problem). Same fix pattern as `write_clipboard` earlier
today. `make check` green; also corrected a stale ~29.7s figure still
sitting in this file's own "Known issues" section (already fixed in
the SOAK-1 log above, missed here until now).

**Same day, last Tier 1 item confirmed with the owner first: Do Not
Disturb / Focus toggle (ADR-042).** Asked two things before building:
smart-home devices (owner has some, but Home Assistant stays
deprioritized, not built) and whether to keep going today (yes). Built
on `docs/BACKLOG.md`'s own 2026-08-04 research (AppleScript has no
clean Focus-mode property) -- the real answer is Shortcuts.app's own
"Set Focus" action via `shortcuts run`, the only Apple-supported
automation surface left for this. Owner needs to create two named
shortcuts once (`README.md`'s new "3d").

Two real bugs found live: the natural single-word reply ("on"/"off"
alone) to this skill's own follow-up question wasn't recognized, only
compound phrases were -- fixed, caught while writing this skill's own
tests. Separately, a direct shell `shortcuts run` returns almost
instantly, but the exact same call through this file's own `execFile`
hung with no output past 15+ seconds -- stopped manually, documented as
a likely TCC permission-dialog gap rather than resolved, since there's
no way to see or click a system dialog from this side.

12 new tests, `make check` green. This is the least-verified of
today's four features on purpose, not by oversight -- the owner hasn't
created the real shortcuts yet, and the `execFile` hang means even the
underlying mechanism needs a real, watched first run. Full detail in
ADR-042.

**Same day, a real ask: stop building, review everything (ADR-043).**
Asked directly for a full-codebase quality/security/efficiency
analysis, not new features -- the whole ~10.8K-line codebase, not just
recent work (confirmed the scope explicitly before starting: whole
codebase, not just today or this SOAK). Two parallel audits (security,
quality/efficiency); one got cut off mid-task by a session limit and
was resumed from its own transcript rather than restarted, no work
lost. Every Critical/High finding was re-verified by reading the real
code myself, not taken on an agent's word.

Found and fixed the same day: a **critical** dashboard vulnerability
(no host binding, wildcard CORS, no WebSocket origin check -- together,
any webpage the owner had open in another tab could forge an approval
with zero interaction, defeating the whole "owner is the only
executor" model) and a **high** gap (the HMAC signature `Gate.decide()`
creates was never actually verified before executing, contradicting
every executor's own docstring). Both fixed, both covered by new,
real tests (a live HTTP server + WebSocket client for the dashboard
fix, not fakes). 9 more findings reported (medium/low: an
undocumented, unenforced `FS_READ` whitelist; a real grammar bug
pinned as "correct" in `skills/media`'s own tests; an entire dead file;
duplication across 5 skills; two untested-but-testable files; a
non-timing-safe nonce comparison) -- not yet acted on, left for the
owner to prioritize.

332 tests total (up from 329), `make check` green. Also confirmed,
not just assumed: command injection is correctly defended everywhere
(argv arrays throughout, zero shell-string interpolation), the audit
log is genuinely append-only at the DB level, OAuth/MCP tokens are
never logged, secrets hygiene is clean repo-wide. The two real bugs
were narrow, specific gaps, not evidence of a weak foundation overall.
Full detail in ADR-043.

**Same day, continued through the rest of the review (ADR-044): all 9
remaining findings fixed, none deferred.** Timing-safe nonce
comparison; a dead file removed (`conversation/cli.ts`); a real
grammar bug fixed (`skills/media` spoke "didn't turned Do Not Disturb
on" on rejection, pinned as correct in its own tests); the extraction+
NONE pattern shared across 5 skills (new `skills/_shared/extract.ts`);
two coverage gaps closed (`dashboardHistory.ts`, `SkillRegistry.
loadAll()`); and the biggest piece, `FS_READ`'s whitelist actually
implemented (`core/skills/fs.ts`, a real `ctx.fs` enforcing CLAUDE.md
§ 5's denylist plus a per-wiring allowed-roots check).

Writing tests for the last two surfaced three more real bugs, not just
coverage gaps: a duplicate manifest id silently overwrote the earlier
skill in `SkillRegistry`; a symlink inside an allowed `ctx.fs` root
pointing outside it bypassed a lexical-only containment check (fixed
with `realpathSync`); and `skills/launcher`'s directories-only filter
was silently lost migrating off raw `readdirSync` (fixed by having
`listDir` return type info, not just names). Also found, unrelated:
`core/skills/scaffold.ts`'s `make new-skill` template never got the
`mcp` field `SkillContext` gained in ADR-035 -- a newly scaffolded
skill's test would have failed to compile.

359 tests total (up from 332), `make check` green throughout -- each
fix verified individually before moving to the next. Live-verified
`ctx.fs` against the owner's real project directory and a real
`~/.ssh` denial, not just the fakes. Nothing from the original review
left open. Full detail in ADR-044.

---

### Phase 8 — complete, 2026-08-06

Camera sessions + `look`. Full plan (Context + Tasks 1-4) approved
before starting; see the plan's own research notes for the real
findings behind it (NIM vision as primary provider on this hardware,
not local Qwen3-VL -- ADR-001's 8GB-RAM finding generalizes; camera
on/off has to be a real multi-lane skill, not the dead `RulesProvider`
regex rules; `CameraEvent` folds into `ServerEvent`, replacing the
unused `{type:"camera", active:boolean}` placeholder).

**Task 1 built and tested — `senses/eyes`, the camera daemon.** Same
shape as `senses/ears`: `config.py`, `capture.py` (`OpenCvCameraDevice`,
real `cv2.VideoCapture`), `session.py` (the `IDLE -> ARMED -> CAPTURE ->
ARMED -> IDLE` state machine, `SPEC.md` § 6 / ADR-010 -- pure class,
injected `CameraDevice` and clock), `main.py` (Unix socket daemon loop +
background self-triggered timeout thread), `fakes.py`, 19 tests, no
camera/network required. `launchd/com.jarvis.eyes.plist` shipped as a
template only (not wired into `make install-daemon` this phase, same as
`senses/voice` today -- runs via `make dev`).

Three real bugs caught by careful re-reading before ever running a
test, not by test failure -- worth recording as real quirks:

- A leftover `field(default_factory=list)` line in a plain (non-
  `@dataclass`) class -- `field()` is only valid inside a `@dataclass`
  body. Copy-paste residue from drafting `Frame` as a dataclass first.
- **The real one, worth remembering generally:** `CameraSession.
  __init__`'s first draft used `idle_timeout_s: float = IDLE_TIMEOUT_S`
  -- a directly-imported config constant as a parameter *default*.
  Python binds a default value once, at function-definition (import)
  time, so a test's `monkeypatch.setattr("senses.eyes.config.
  IDLE_TIMEOUT_S", ...)` would never reach an already-bound default --
  the monkeypatch changes the module attribute, but the function's
  signature already captured the old value. Fix: `X: float | None =
  None` sentinel parameters, resolved via fresh `config.ATTR` lookups
  inside `__init__`'s body. Same reasoning as `core/gate/gate.ts`'s own
  injectable-`now`-callback pattern, just a Python-specific trap on top
  (a closure reads a name each call; a default parameter reads it once,
  at def time). Any future `senses/*` module taking a config value as a
  parameter default should use this pattern from the start.
- A second-order bug from fixing the above: two lines still referenced
  the raw (now possibly-`None`) parameter instead of the resolved local
  variable, which would `TypeError` on `None + float` the first time a
  caller relied on the default.

`ruff check` and `.venv/bin/pytest senses/eyes/` both run clean (19
passed); full `make check` green. Committed as `812077d`.

**Task 2 built and tested — core camera wiring, `MEMORY_WRITE`
observations, vision providers.** Full reasoning in ADR-045; summary:

- Real `CameraHandle` (`core/skills/camera.ts`) wired to `eyes` over the
  same request/reply correlation shape `conversation/ipc.ts` already
  uses for `ask()`. Capability-gated at the `core/main.ts` dispatch call
  site (a skill only gets the live handle if its own manifest declares
  `CAMERA` and `eyes` is connected) -- `eyes` is optional at boot,
  unlike `ears`/`voice`.
- `CameraEvent`'s three variants folded into `ServerEvent`; a real gap
  found building it (`camera.captured` never declared the `path` field
  eyes always sent) fixed in both `shared/types.ts` and the `ui`
  mirror.
- `MEMORY_WRITE`'s executor is now `payload.kind`-dispatched
  (`fact`/`observation`), matching `shell.ts`'s own action-dispatch
  shape -- the two existing fact-writing callers updated for the one
  new required field.
- **`NimProvider.vision()`, live-confirmed model id.** Queried the real
  `/v1/models` catalog with the owner's own key, found
  `meta/llama-3.2-11b-vision-instruct`, then smoke-tested it end to end
  against a real generated JPEG through `/chat/completions` before
  writing any code against it -- correctly read back both the
  background color and the text in the test image. Not guessed, per
  this project's own repeated "don't trust a provider's model name
  without checking it live" lesson (Cerebras, OpenRouter, Google AI
  Studio).
- **`OllamaProvider.vision()` turned out to already exist**, built ahead
  of schedule in Phase 3 (`moondream`) and never tested or wired into
  the `see` lane -- added the missing tests and the `routeVision()`
  wiring rather than rebuilding it.
- New `routeVision()` (`core/router/router.ts`): same fallback/trace
  shape as `routeChat()`, simplified for a single non-streaming result.
  `see` lane order: `nim` then `ollama`, matching ADR-001's hardware
  finding.
- **A real design change from the plan's own sketch, caught while
  building Task 1's `main.py`:** `CameraSession.close()` does **not**
  take a "frames to keep" list. `eyes`'s own idle/absolute-timeout
  self-close can fire with no request from `core` at all, at any point
  after a capture -- there's no reliable moment to tell it "wait, keep
  this one" before the file may already be gone, especially since a
  `MEMORY_WRITE` approval can sit pending far longer than the 120s idle
  default. Fixed by moving durability earlier instead: a skill that
  wants to keep what it saw copies the frame to `data/observations/`
  immediately after capture, before ever proposing the write. Full
  reasoning in ADR-045.

374 tests total (up from 359), `tsc`/`ruff`/ESLint/UI build all green.
One stale test fixed in the same pass (`factExtraction.test.ts` still
asserted the pre-`kind` payload shape). Committed as `99ea64a`.

**Task 3 built and tested — `skills/look`.** Three intents:
`open_camera`/`close_camera` (multi-lane -- `["converse", "act",
"reflex"]`, the proven `launcher`/`media` pattern) and `describe` (`see`
lane, `requiresCamera: true`). `describe` copies the captured frame to
`data/observations/` immediately (before anything is proposed --
ADR-045's reasoning), speaks the vision reply right away, then
fire-and-forget proposes remembering it. `close_camera` has no direct
way to reach "the current session" from `CameraHandle` alone (`open()`
only ever returns a *new* `CameraSession` object) -- resolved by relying
on eyes' own idempotent re-arm (confirmed already built in Task 1):
calling `open()` again when already armed returns the live session
without touching the device, so `close_camera` checks `ctx.camera.state`
first (skip entirely if already idle) and otherwise re-opens then closes
that same live session.

Found while wiring the skill: `Router.see()` had no way to tell a skill
*which* provider actually served a vision request, but `Observation`
requires a `provider: string` field -- fixed by having `see()` return
`VisionResult & { provider: string }`, sourced from `routeVision()`'s
own trace callback.

`core/skills/tests/fakes.ts` gained `fakeCamera(frames)` (the helper
`docs/SKILLS.md` § 7 already named) and an optional `camera` override on
`fakeSkillContext`. 10 new tests, all passing first run -- no bugs found
writing them this time, unlike Tasks 1-2. `make check` green throughout.
Committed as `7b208c9`.

**Task 4 built — dashboard camera indicator.** `use-jarvis.ts` tracks
the three `camera.*` `ServerEvent` variants into a `CameraDashboardState`
(state/reason/expiresAt/lastCaptureAt/lastClosedCause); `status-bar.tsx`
renders it for real -- `CAMERA: ARMED · 87s`, a live countdown against
the real `expiresAt` `eyes` reported, replacing the hardcoded `CAMERA:
IDLE` string that was there since Phase 7. `tsc`/lint clean on both
`core` and `ui/`. Committed as `31cd22c`.

No committed Playwright spec exists for this dashboard yet -- Phase
7's own live-DoD verification (this same log, earlier) used Playwright
as a plain devDependency driving real headless Chromium via a
throwaway script against a real running `core`, not a checked-in test
file (no `playwright.config.ts` in this repo). Same approach planned
for this phase's own self-run verification pass, next, rather than
introducing new permanent E2E infra as a side effect of one indicator.

**Self-run verification pass — done, four real bugs found and fixed.**
Every check below was run against the real stack, not fakes: a real
`senses/eyes` subprocess, the real macOS camera, real NIM/Ollama vision
calls, and the real dashboard driven by Playwright against a real
running `core`. Full bug-by-bug detail in ADR-045's addendum; summary
here.

- **`senses/eyes` standalone, real subprocess.** Real Unix socket, real
  client connection, a real `arm` request that genuinely tried to open
  the camera and got an honest `CameraPermissionError` back over the
  wire (permission not yet granted at that point) -- exactly the
  designed failure path, not a crash. SIGTERM shutdown traceback
  confirmed as the same accepted, documented behavior `senses/ears`
  already has (not a new bug).
- **Vision providers, side by side, same real test image.** NIM
  (`meta/llama-3.2-11b-vision-instruct`) answered correctly and fast.
  Ollama (`moondream`) returned **empty output** on the skill's actual
  production prompt (a multi-instruction description+honesty prompt),
  twice, consistently -- but answered correctly on a simpler
  single-sentence prompt. Real, measured confirmation of what ADR-001
  only hypothesized from hardware alone: this machine's local vision
  path is fragile, not just slower. NIM-primary was already the
  decision; this is the live data point behind it.
- **The full stack, live, via Playwright.** Stood up real `eyes`, real
  `core` (fake `ears`/`voice` stub servers standing in for the
  microphone specifically -- reusing the real `senses/ipc.py` protocol,
  so `core`'s own connection logic was still fully real), and the real
  dashboard, then drove `open_camera` → `describe` → reject → 
  `close_camera` and a second real `describe` with a targeted question
  through to a real idle-timeout close, all through the dashboard's
  test console (SOAK 1's own "indistinguishable from real speech"
  design). Confirmed live: the camera indicator ticks a real countdown
  and returns to idle; a rejected `MEMORY_WRITE` observation proposal
  clears from the queue with zero `observations` rows written; the
  ephemeral session frame is gone from `data/frames/` after an
  unapproved close.
- **Four real bugs found this way, all fixed same session** (full
  detail in ADR-045's addendum): an epoch-seconds/epoch-milliseconds
  unit mismatch on the wire (`expiresAt` showed "0s" for a session with
  600s left); `describe` silently unreachable for "what is this"
  because of the classified-lane-filters-before-matching order in
  `dispatch.ts` (same class of bug as `media.now_playing`,
  ADR-026/030) -- worse, the general-conversation fallback then
  fabricated a plausible-sounding answer with no camera involvement at
  all, silently; the vision prompt ignored the owner's actual question,
  so "answer a question about what is visible" (ROADMAP.md's own DoD
  wording) wasn't really implemented; and idle/absolute timeout closed
  the camera without ever *announcing* it, contradicting SPEC.md § 6
  and the DoD directly. None of these were reachable from the unit
  test suite -- each needed the real process boundary (a real wire
  message, a real lane classification, a real vision call, a real
  timeout firing) to surface at all.
- **Two more real findings, deliberately left open** (scope discipline,
  full detail in `docs/BACKLOG.md`): a rejected/expired observation's
  durable image copy is never cleaned up (disk leak, not a security
  issue); the dashboard test console's fire-and-forget utterance
  handling can theoretically cross-wire `camera.ts`'s single-request
  correlator under sub-second scripted pacing -- confirmed not
  reachable from real voice (ears' loop is sequential), so treated as a
  known test-console limitation, not a production bug.
- Also fixed in passing: `make dev` never actually started
  `senses.eyes.main` despite Task 1.7's own plan committing to that;
  `data/observations/` wasn't gitignored.

**Owner-required, explicitly not attempted:**
- The ten real test images for description-accuracy (ROADMAP.md's DoD)
  -- needs real objects/lighting/framing only Pedro can provide. (What
  *was* verified live: a real capture of a real person in a real room
  produced an accurate, correctly-hedged description -- a good sign,
  not a substitute for the full ten-image check.)
- Judging whether the local-vs-NIM vision quality/latency tradeoff
  feels right in real day-to-day use, beyond this session's one-shot
  side-by-side.
- Real end-to-end voice tests (actual spoken "turn on the camera" /
  "what am I holding", not the test console) -- everything this session
  verified through the test console is architecturally the same path a
  transcribed utterance takes, but the owner's own voice/mic/accent
  hasn't touched any of this yet.
- "Close the camera during analysis pre-empts within 2s"
  (ROADMAP.md's own DoD wording) was not verified and, on inspection,
  isn't really implemented as a true interrupt -- `ears`'s own loop
  processes one utterance at a time, so a real spoken "close the
  camera" can't literally arrive *during* an in-flight `describe()`
  call the way the DoD wording implies; there's no cancellation
  mechanism in `skills/look`. Flagging honestly rather than claiming
  this is done -- if genuine mid-analysis barge-in matters, it needs
  real design work (a `cancel()` implementation, per `docs/SKILLS.md`
  § 4's optional hook, currently unused by any skill in this project).

**A real, deliberate deviation from ROADMAP.md's own Phase 8 bullet,
already decided and documented before this pass (ADR-045, this
phase's plan): "see lane: local Qwen3-VL → NIM VLM fallback" is not
what got built.** NIM is primary, Ollama (`moondream`, not Qwen3-VL --
smallest Qwen3-VL variant needs more than this 8GB machine already
struggles to give a text model, per ADR-001) is the secondary,
benchmarked-not-assumed-working path. This session's live vision
comparison (above) is the first *measured* confirmation of that call,
not just the hardware hypothesis it was originally based on.

`make check`: 384 tests (`node --test`), 48 (`pytest senses/`, all
three daemons -- 19 of them `senses/eyes`), `tsc`/`ruff`/ESLint/UI
build all green throughout every commit this phase. Commits:
`812077d`, `450902e`, `99ea64a`, `a7c0320`, `7b208c9`, `c5dcb3a`,
`31cd22c`, `981a467`, `7835c97`, `b47d539` on `phase/08-camera-look`.

**Post-completion: real bugs from Pedro's own live `make dev` session,
2026-08-07.** Phase 8 was reported complete and awaiting Phase 9
approval; instead Pedro spent real time actually talking to the running
system and hit real, reproducible bugs, then asked for them fixed
directly plus a product change (open/close apps shouldn't need approval)
-- CLAUDE.md § 2's error-handling process, not Phase 9 scope, so this
stayed on `phase/08-camera-look` rather than opening a new phase branch
for bug fixes.

Diagnosed from the real `data/jarvis.db` and `/api/events`/`/api/thoughts`
of Pedro's actual running session (not reproduced synthetically first):

1. **No skill answers "what can you do."** Three separate real phrasings
   that night ("dá-me uma lista das funcionalidades," "what functionalities
   do you can do for me," "what skills do you have") all correctly
   classified as `converse`, but with nothing to actually answer, the
   disambiguator picked the least-wrong of an irrelevant shortlist every
   time (`shopping_list.list_items` once, `tasks.list_tasks` twice) --
   "The shopping list is empty." is not an answer to "what skills do you
   have." Fixed with a new `skills/about` (fixed text, no model call).
2. **Weather lane misroute, same root cause as this phase's own
   `look.describe` bug, different skill.** "Give me the weather right
   now, em Ponta Delgada, Açores." classified as `see`; `weather.
   current_weather` was `converse`-only, so `dispatch.ts`'s lane filter
   dropped it before the embedding match ever ran. General conversation
   caught the fallthrough and made it worse: it parroted an unrelated
   prior forecast-refusal line from its own context window instead of
   answering or admitting it didn't know. Fixed by declaring `["converse",
   "see"]`, matching the `look.describe`/`media.now_playing` precedent.
3. **A real `ctx.ask()` timeout left no durable trace.** The generic
   fallback ("Something went wrong handling that...") was only ever
   broadcast live over WS, never written to `events` -- invisible on a
   dashboard reload. Traced by cross-referencing `/api/errors` (had the
   raw error), `/api/events` (silent on it), and timing math (~31s after
   the utterance, matching `ask()`'s 30s default) before the gap was
   even visible. Fixed: the fallback path now calls `memory.appendEvent`
   like every other response.
4. **Product change: `APP_CONTROL`, a new green capability.** Owner
   request -- opening/closing an app, project, or website no longer
   needs a per-action approval click; only a genuinely destructive
   action (none exist yet) stays gated. Full reasoning, plus a real
   latent bug this exposed (`Gate.propose()`'s green tier never actually
   called the registered executor -- fixed) and a second live-caught bug
   (`close_app` classified as `reflex`, misrouted to `media.pause_music`,
   fixed the same way as everything else this phase: declare the lane it
   actually lands on) -- all in ADR-046.

**Live-verified end to end, not just unit-tested:** stood up a fresh,
fully isolated `core` instance (its own DB, its own ports, fake `ears`/
`voice` stub servers reusing the real `senses/ipc.py` protocol) so none
of this touched Pedro's actual running session, then drove it directly
over the real WebSocket/HTTP API (no browser needed for these fixes).
Confirmed live: `about` answers correctly; the exact failing weather
utterance now reaches `weather.current_weather`; the `ask()`-timeout
fallback is now a real, persisted `events` row; `open Calculator` /
`close Calculator` both execute for real (`osascript`/`open`, process
confirmed present then gone) with zero pending approvals either time.

**A real mistake made and immediately fixed during this pass:** a
`pkill -f "next dev"` meant to stop only an isolated test dashboard
instance also matched and killed Pedro's own real dashboard dev server
(his `core` process was never affected). Caught within the same turn by
checking the specific PID before believing the pattern-match was safe;
restarted his dashboard on its original port before continuing, and
every process kill after that point in this session was by exact PID,
never by name/pattern again.

25 new tests. 399 total, `make check` green throughout. Committed as
`57bbe3b` (code) on `phase/08-camera-look`; docs in this same commit
plus ADR-046. `phase/08-camera-look` merged to `main` 2026-08-06
(`make check`: 401 tests green).

**Real end-to-end voice + camera test, 2026-08-07.** Owner authorized
real mic/speaker/camera testing end to end (`CLAUDE.md` § 1's
self-run tier, extended to cover what a fake genuinely can't stand in
for). Acoustic loopback via macOS `say` through real speakers, picked
up by the real continuous wake-word listener, against a real `make dev`
stack — same methodology as Phase 1/2's own live tests.

*Passed, real, unscripted:* `"Hey Jarvis, turn on the camera"` →
wake word (score 0.999) → dispatch → `"Camera's on."` `"Hey Jarvis...
what is this, can you describe it"` → real frame capture → real NIM
vision call → spoken description of the actual room the webcam was
pointed at → `MEMORY_WRITE` (`kind: "observation"`) correctly proposed
and left pending, never auto-approved. `"Hey Jarvis, turn off the
camera"` → `"Camera's off."` → `data/frames/` correctly emptied
(ephemeral session frame deleted on close).

*Three real bugs found, none fixed tonight (found during owner-
requested testing, not part of a planned phase — logged per `CLAUDE.md`
§ 0.7 rather than fixed ad hoc; owner to decide priority against Phase
9):*

1. **`senses/ears` hung indefinitely on a second wake-word capture in
   the same running session.** First utterance (`open_camera`) worked;
   the very next one (`describe`), triggered ~15s later in the same
   `make dev` session, never produced a `"heard"` line or an error —
   confirmed genuinely stuck (not just slow) via `sample`, still
   unresolved after 260+ real seconds, well past both
   `MAX_RECORDING_FRAMES`'s 32s hard cap and `WhisperServerTranscriber`'s
   10s HTTP timeout, either of which should have fired regardless of
   silence/noise. Root cause not fully pinned down live — machine was
   under real, severe memory pressure at the time (`vm_stat`: ~64MB
   free physical pages, consistent with ADR-001's already-documented
   8GB-M1 constraint), which may starve the audio callback/worker
   thread enough to prevent `ContinuousAudioSource`'s frame count ever
   reaching its cap; a second, narrower theory (`arm()` not taking
   effect before `_process_frame`'s early-return-if-`!armed` check, a
   real race between `run_wakeword_forever`'s thread and
   `_process_loop`'s worker thread) was not ruled out. Recovered by
   restarting the whole stack, not by fixing the daemon in place —
   needs real, focused reproduction (not under this session's own
   heavy concurrent load) before a fix is attempted blind.
2. **`core` has no reconnect logic if `ears` (or presumably `voice`)
   dies mid-session — found as a direct side effect of #1.** Sending
   `SIGTERM` to the stuck `ears` process to recover from bug #1 should
   have let `core` and a fresh `ears` reconnect; instead `core`'s own
   utterance-handling loop (`core/main.ts`'s bare
   `for await (const message of readLines(earsSock))`, the last thing
   in `main()`) went silently idle forever — no error, no log line, no
   retry, confirmed via `sample` showing `core`'s HTTP/WS server (port
   8787) still fully responsive throughout while the ears-reading path
   never advanced. `connectWithRetry` is only called once, at boot.
   Anything that kills the `ears` or `voice` connection after startup —
   a daemon crash, `launchd` restarting it, the bug above — currently
   requires restarting `core` itself to recover, silently. No dashboard
   indicator surfaces this either. Worth fixing before this is depended
   on daily.
3. **Durable observation copies (`data/observations/*.jpg`) have no
   cleanup path on reject or expiry.** By design (ADR-045), `look`
   copies the captured frame to `data/observations/` immediately, before
   the `MEMORY_WRITE` proposal is even created, so the image survives
   `eyes`'s own idle/absolute-timeout session deletion while approval is
   pending — correct and deliberate. But nothing ever deletes that copy
   if the approval is rejected or simply expires (`DEFAULT_EXPIRY_MS`,
   5 min) — confirmed live: tonight's real observation photo's approval
   expired unactioned (owner chose to let it expire naturally rather
   than decide, to observe the real behavior) and the JPEG is still on
   disk. Every `describe` that isn't approved within 5 minutes leaves a
   real photo on disk permanently — a real privacy/storage gap, not
   theoretical, and in tension with `SPEC.md` § 7's "nothing is
   persisted until approved" spirit even though the DB row itself
   correctly never gets written.

Also reconfirmed, not new: fact-extraction noise (already flagged,
`docs/BACKLOG.md`) — two more `MEMORY_WRITE` (`fact-extraction`)
proposals fired during this same short test session (`"prefs.camera =
exists"` and one more), both expired unactioned like the observation
above.

All three findings added to `docs/BACKLOG.md`'s Annoyances section
with full detail. No code changed for any of them that night — it was
a test-and-report pass, per the owner's own request to test everything
live and then get a professional assessment before deciding what's
next.

**Bugs #2 and #3 fixed and live-verified, 2026-08-08** (owner reviewed
the report, asked to proceed with best judgment rather than defer
either). Bug #1 (the `ears` hang) stays open — real root cause unclear,
plausibly tied to that specific night's heavy concurrent memory
pressure rather than a reproducible code defect, needs focused
reproduction before a blind fix.

- **`core/senseConnection.ts`** (new): wraps a sense's Unix socket so a
  dropped connection reconnects with backoff (500ms → ×1.5, capped
  10s) and resumes `readLines`-ing transparently, instead of the
  silent permanent stall bug #2 found. `core/main.ts` now builds
  `earsConn`/`voiceConn`/`eyesConn` through this wrapper; `eyesConn`
  only exists once `eyes` has actually connected at least once (its
  optional-at-boot behavior is unchanged), but from that point on gets
  the same reconnect treatment as ears/voice. New `sense.connection`
  `ServerEvent` (`shared/types.ts` + `ui/src/lib/types.ts` mirror) makes
  a drop/reconnect dashboard-visible for the first time. 4 new tests
  (`core/tests/senseConnection.test.ts`, fully faked sockets).
  **Live-verified**, not just unit-tested: an isolated `core` instance
  against a real Python fake-`ears` server (reusing `senses/ipc.py`)
  that intentionally drops its connection after one message and
  re-listens on the same socket path a second later, simulating a
  daemon crash+restart. Real log sequence confirmed:
  `core: heard "first message before drop"` → `core: said "..."` →
  `core: ears disconnected, reconnecting...` → `core: ears reconnected.`
  → `core: heard "second message after reconnect"` → `core: said "You're
  back online. What can I help you with?"` → once the fake daemon
  process exited for good, real capped exponential backoff retries
  logged (500ms, 750ms, 1125ms, 1687.5ms, 2531.25ms, 3796.875ms, ...).
- **`core/gate/gate.ts`**: new private `cleanupObservationFile()`,
  called from all three paths that can end a `kind: "observation"`
  `MEMORY_WRITE` proposal without an approval (the `propose()` timeout,
  `decide()`'s own expiry-recheck, and an explicit reject) — best-effort
  `unlink` of `data/observations/*.jpg`, silent on an already-missing
  file, untouched for `kind: "fact"` payloads or an approved
  observation. 6 new tests (`core/gate/tests/gate.test.ts`, real temp
  files, not mocked — the cleanup itself is real `node:fs/promises`
  `unlink`, not injected, a deliberately narrow/low-risk exception to
  the "fake outside-world calls" convention given how contained this
  is).

`make check`: 410 tests (up from 401 at Phase 8's own close), `tsc`/
`ruff`/`pytest`/ESLint/UI build all green throughout.

**Backlog organized and analyzed; GitHub added as the second real MCP
server, 2026-08-08.** Owner asked for the full backlog (ROADMAP Phases
9-13 plus every `docs/BACKLOG.md` track, including a new Personal
Knowledge Brain idea logged that day) organized and analyzed toward
making JARVIS more capable across "qualquer tecnologia." Presented the
organized picture; owner chose generalizing the MCP tool layer over
continuing straight to Phase 9. Full reasoning, decisions, and
consequences in `DECISIONS.md`'s ADR-047 — short version:

- Explored first, not assumed: the MCP plumbing built for Gmail
  (ADR-035) was already fully server-agnostic. What was missing was a
  second real example and a non-Google auth path.
- **GitHub's official remote MCP server** registered in
  `core/mcp/setup.ts` — a personal access token through the *existing*
  generic Keychain helper, no new OAuth module needed (real-checked via
  web search before building: free, PAT-based, same HTTP transport
  `core/mcp/registry.ts` already speaks).
- **`skills/_shared/mcpTool.ts`** (new): extracted the mechanical half
  of an MCP-backed skill (connectivity check, ok/rejected/expired/error
  handling) out of `skills/gmail/index.ts`, which was refactored to use
  it the same day — proven reuse, not a speculative abstraction.
- **`skills/github`** (new): one intent, `list_repos`, same
  non-guessing discipline as Gmail (pattern-matches the real tool
  catalogue at runtime, never a hardcoded tool name).
- `docs/SKILLS.md` gained a new § 5b documenting the MCP-backed-skill
  pattern (previously undocumented anywhere but code comments); README
  gained § 3d (GitHub PAT setup), renumbering the old Focus-toggle
  section to § 3e.
- 17 new tests (427 total, `make check` green). Live-verified against
  an isolated `core` instance with no PAT configured yet: graceful
  degradation confirmed (same shape Gmail's own missing-secret path
  already has), and a real "what are my repos" utterance injected over
  the real WebSocket correctly dispatched to `github.list_repos` and
  spoke the honest not-connected fallback.
- **Owner-required, not yet done:** a real GitHub PAT in Keychain
  (README § 3d has the steps) and confirming a real `tools/list` call
  against live data — the first real end-to-end proof of the
  `MCP_TOOL_CALL` pipeline against a third party, since Gmail itself
  never got that far (ADR-037).

**Permanent benchmark regression gate, 2026-08-08 (owner asked to keep
progressing on anything not needing him, tracking what does).**
`docs/BACKLOG.md`'s own "permanent benchmark gate" idea, built for real:
`bench/_shared/regressionGate.ts` compares a fresh benchmark run against
a recorded baseline (`bench/baseline.json`), not just each script's fixed
absolute floor — the exact gap that let real accuracy regress silently
twice before (ADR-024, ADR-026) while still clearing the floor. Wired
into all three routing-accuracy benchmarks (`bench_router_lane.ts`,
`bench_router_lane_pt.ts`, `bench_skill_routing.ts`); `make bench-gate`
runs all three in sequence. `bench_skill_routing`'s baseline (88.6) is
deliberately set at the low end of its documented natural variance
(ADR-038's disambiguation-reliability wobble, not a bug) so the gate
doesn't cry wolf on normal runs. `bench/update_baseline.ts` is the one
deliberate way to record a new baseline after a confirmed real
improvement — never automatic, same "a trust decision needs a human,
not a script" reasoning the MCP-tiering entries already established.

Deliberately **not** wired into `make check` — these benchmarks make
real network/model calls and spend real API quota, which `make check`
has never done (CLAUDE.md § 3: no network, no models loaded). The gate's
own comparison *logic* is fully offline-testable though: 8 new tests
(`bench/tests/regressionGate.test.ts`), `bench/**/*.test.ts` joined
`make check`'s glob. 435 tests total, `make check` green throughout. Not
live-run against real API calls tonight (would spend quota for no new
information — the comparison logic itself is what needed proving, and
it's proven offline); first real run happens naturally the next time a
`laneClassifier.ts`/`dispatch.ts`/manifest-examples change needs
benchmarking.

**Reviewable routing-misses list, 2026-08-08 (ADR-049).**
`docs/BACKLOG.md`'s thevickypedia-inspired idea: a real, queryable list
of what the owner actually said on every `no_skill_matched` decision,
not just a count — the exact thing that would have made closing gaps
like ADR-026's coffee collision a matter of reading a list instead of
re-reading a whole conversation log by hand.

`routing_stats` never stored the utterance text, only that a miss
happened — fixed by adding an `event_id` column and joining against
`events` at read time (single source of truth, no duplicated text).
This is the project's **first real schema migration on an
already-populated table** — `ALTER TABLE ADD COLUMN` isn't idempotent on
its own (a second run throws "duplicate column name"), so
`core/memory/db.ts`'s new `ensureRoutingStatsEventIdColumn()` checks via
`PRAGMA table_info` first, runs on every `openDb()` call. Live-verified
carefully given this touches real production data: copied the owner's
actual `data/jarvis.db` (39 real `routing_stats` rows) to a scratch
location, ran the real migration against the copy twice (confirming
idempotency), confirmed all 39 rows survived untouched, and confirmed
`recentRoutingMisses()` correctly returns them with an honestly-`null`
utterance (they predate this column, so there's genuinely nothing to
join — shown as unknown, never guessed). The real `data/jarvis.db` file
itself was never touched directly; the migration will apply naturally
the next time `core` boots against it.

New `Memory.recentRoutingMisses(limit)` and `GET /api/routing-misses`
(`core/http.ts`), most-recent-first. `core/main.ts` now passes
`eventId: utteranceEvent.id` into `recordRoutingStat` so every miss
from here on has its real text. No dashboard UI panel built for this
yet — deliberately out of scope, the backend gap was the actual ask;
flagged in `docs/BACKLOG.md` as a natural follow-up.

5 new tests (440 total), `make check` green throughout.

**Batched, idle-triggered fact extraction, 2026-08-11 (ADR-050).** The
approval-fatigue finding kept recurring across real sessions (6
proposals from 8 utterances, 13/17 rejected, 3 more expired unactioned,
5/6 garbage under degraded-model conditions) -- fixed at the root
instead of patched at the UI: `core/factExtractionScheduler.ts` batches
extraction over an idle window (debounce, 20s default, plus a 6-utterance
safety cap for a never-quiet session) instead of running once per
utterance. Fewer LLM calls, and better precision -- the model judges "is
this durable" from a short recent window with real context instead of
one isolated line. No Gate/dashboard changes: each fact in a batch still
becomes its own individual approval, exactly as before; only *how often
extraction runs* changed. 9 new tests (449 total). Live-verified against
a real timed window, not just fake-clock unit tests: two real utterances
injected 1.5s apart over a real isolated `core`'s WebSocket, confirmed
zero approvals fired individually and both appeared together ~8s after
the second one.

**The 2026-08-07 `ears` "hang" (bug #1), re-investigated and closed,
2026-08-11/12 (ADR-051).** Reproduced the original scenario again (real
`say`-driven wake word, back-to-back utterances) under comparable real
memory pressure -- and confirmed via `vm_stat` that this machine sits
close to that most of the time, not just that one specific night. Same
`sample` picture as before (no thread in the whisper HTTP call, steady
low CPU). The test the original investigation never ran: fired a
*third* wake word without restarting anything -- it triggered and
completed immediately, proving `busy_lock` was already free. The
"hung" second capture had already finished, silently, with an *empty*
transcription (never emitted, per `transcribe.py`'s own honest-silence
rule) -- structurally indistinguishable from a hang to an observer
watching for a log line that was never coming. Root cause of the empty
transcription: `say`'s synthesized speech with no pause after "Hey
Jarvis" starves the wake-word falling-edge detector of runway, same
family as the already-documented "It is."/"and the camera." truncation
cases, just severe enough to lose the whole utterance this time -- a
known sensitivity of scripted acoustic testing, not a concurrency bug.

The original "memory pressure" and "race condition" theories are now
understood to be unconfirmed red herrings, not causes -- `docs/
BACKLOG.md`'s entry corrected in place to say so rather than leaving a
disproven explanation on record.

**Real, fixed gap found from doing this correction properly:** a
wake-word capture that transcribes to nothing gave the owner zero
feedback -- the wake ack fires, then silence, genuinely indistinguishable
from a hang without the third-wake-word test above. Fixed: `Ack` gained
`fire_no_speech()` (`senses/ears/ack.py`, a distinct `Pop.aiff` +
notification, not `Tink.aiff` again and not an error sound), wired
through `capture_and_transcribe`'s new `on_empty` callback for the
wake-word path only (the hotkey path already has physical key-release
feedback). 2 new tests (50 pytest total), `ruff` clean, `make check`
green throughout.

**Screen Recording permission confirmed granted, 2026-08-12.** Owner
asked to confirm live whether `core`'s own process (not just an
interactive shell) can actually use `screencapture` — re-ran the exact
test that found this gap on 2026-08-06 (`core/executors/screenshot.ts`'s
own docstring), through a real `node`-spawned child process matching
the executor's own invocation shape: the clipboard now holds real image
data, not stale text. Permission gap is closed. `skills/clipboard`'s
`capture_screenshot` is fully functional now (the `-i` interactive-select
path still needs a real owner drag to fully confirm, can't be scripted);
OCR-on-screenshot is no longer permission-blocked, just not yet built
(real Vision-framework research still needed, unchanged).

**`tasks` on real Reminders.app, 2026-08-12 (ADR-052).** Owner confirmed
he wants tasks synced via iCloud, not a JARVIS-only private list. Real
design question surfaced first, not decided alone: a system-app write is
`SHELL_EXEC`'s (yellow, per-call approval) shape by default, but that
would undo this same night's own approval-fatigue fix. Presented against
`APP_CONTROL`'s own precedent (narrow, immediately visible, trivially
reversible → green); owner chose the same shape. New `REMINDERS`
capability (green, `CLAUDE.md` § 5), `core/executors/reminders.ts`
(JXA -- real syntax verified live against the owner's actual Reminders
.app before writing code, owner text passed as a safe `execFile` argv
element, never interpolated into the script -- a real command-injection
risk otherwise).

`add_task` confirmed fully working end to end: a real utterance injected
over a real isolated `core`'s WebSocket created a real Reminders.app
item, independently verified outside `core`, then cleaned up.
`list_tasks`/`complete_task` hit a real, carefully isolated hang --
narrowed through six progressively simpler live repros to exactly this
boundary: list-level operations and reading a brand-new item's own
properties both return in under a second; re-fetching an *existing*
reminder's properties (`.name()`, `.id()`) never returns, timing out at
exactly the configured 15s with empty stderr. Same signature
`focusMode.ts` already documented for Shortcuts.app (a TCC Automation-
permission dialog a non-interactive process can't see or click) -- but
**not confirmed** as the same cause here, since every repro used a
backgrounded test process, not a real interactive `make dev` session,
which may behave differently. Shipped anyway: the executor code is
correct, degrades honestly (a genuinely informative error now --
`.message` alone turned out useless, `.stderr` has the real reason,
fixed mid-investigation), and has an explicit timeout so a stuck
permission dialog fails the gate instead of hanging it forever.

17 new tests (465 total), `make check` green throughout. **Owner-
required:** try "what are my tasks" for real via `make dev`; if it
hangs, grant the Automation permission dialog if one appears.

---

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
  exact documented misroute now resolves correctly. **Still open:**
  `disambiguate()`'s equivalent gap (the "peanuts" misroute, ADR-038,
  two prompt-wording attempts tried and benchmark-rejected) -- needs
  real per-skill logic, a bigger ask than lane classification's fixed 5
  categories, not attempted.
