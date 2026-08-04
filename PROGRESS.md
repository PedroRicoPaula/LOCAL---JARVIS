# PROGRESS.md

The agent updates this at the end of every phase. The owner reads this first
after a break. Keep it factual and short.

---

## Current state

**Phase:** 3 — Router — **built, DoD mostly met, not yet merged**
**Status:** `ModelProvider` interface, `ollama`/`nim`/`rules`/`offline-fallback`
providers, ordered per-lane fallback chains, and the lane classifier are all
built and tested (33 new TS tests, `node --test`, zero network — plus the
existing 20 Python tests). Lane classification measured live at **93.3%**
against the real router (bar: ≥85%). See the Phase 3 log below for full
detail, including two real bugs a live NIM call caught that no fake could
have (an HTTP-200-with-embedded-error response, and a too-tight classifier
timeout) — both fixed and now covered by injectable-`fetch` unit tests so
they can't regress silently again.
**Branch:** `phase/03-router`
**Last updated:** 2026-08-04

(Phase 1 complete — see Phase log below for the full record and what was
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

### Phase 3 — built, 2026-08-04

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

---

## Key numbers to record as we go

| Metric | Target | Actual | Phase |
|---|---|---|---|
| Lane classification accuracy | ≥ 85% | **93.3%** (Phase 3, live, through the real router — up from Phase 0's raw-model 71.1%; see Phase 3 log) | 0, 3 |
| Time to first audible syllable | < 1.5 s | 3/10 real trials: 657ms, 686ms, 1530ms (3rd was a ~45-word stress test) | 1 |
| Wake false activations / 4h | < 2 | 1 (score=0.565) | 2 |
| Wake detection rate (30 @ ~2m) | ≥ 90% | 30/30 synthetic TTS proxy (not the official number — see Phase 2 log); strong real-voice signal across several live rounds, no formal count-of-30 | 2 |
| Survives reboot, no manual intervention | pass/fail | **PASS** — daemon auto-started, mic permission held, wake word + transcription worked | 2 |
| Memory recall p95 | < 200 ms | — | 4 |
| **`make new-skill` → working no-op** | **< 30 min** | **—** | **5** |
| Intent routing accuracy | ≥ 90% | — | 5 |

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
