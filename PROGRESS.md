# PROGRESS.md

The agent updates this at the end of every phase. The owner reads this first
after a break. Keep it factual and short.

---

## Current state

**Phase:** 7 — Dashboard — **closed, merged to `main`**
**Status:** `core/ws.ts` + `core/http.ts` give `core` a live WebSocket
channel and REST backfill (`/api/events`, `/api/skills`,
`/api/approvals`) on one port (`JARVIS_DASHBOARD_PORT`, default 8787).
`Gate` now extends `EventEmitter`; `core/main.ts`'s dispatch loop
broadcasts real `transcript`/`thought` events, not synthetic ones. `ui/`
is a fresh Next.js + shadcn/ui project (own `package.json`) with the
Figma reference's dark/cyan visual language carried over: approval queue
(expand-to-see-payload, approve/reject), live thought stream, transcript,
timeline over `events`, skill health panel, a static camera indicator
(Phase 8 will make it live). All four DoD checks verified live —
Playwright driving real Chromium against the real running `core` process,
not the MCP tool (unavailable this session) and not fakes. 137 TS tests +
20 Python tests, `make check` green, `next build`/`next lint` clean.
Next: 🛑 **SOAK 1** (see ROADMAP.md — two weeks of daily use before Phase
8).
**Branch:** `main`
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

---

## Key numbers to record as we go

| Metric | Target | Actual | Phase |
|---|---|---|---|
| Lane classification accuracy | ≥ 85% | **93.3%** (Phase 3, live, through the real router — up from Phase 0's raw-model 71.1%; see Phase 3 log) | 0, 3 |
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
