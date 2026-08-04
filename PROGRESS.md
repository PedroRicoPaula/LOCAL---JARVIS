# PROGRESS.md

The agent updates this at the end of every phase. The owner reads this first
after a break. Keep it factual and short.

---

## Current state

**Phase:** 2 — Wake word
**Status:** in progress — code complete, `make check` green, verified live
with real acoustic detection end-to-end (speaker-to-mic loopback). The
DoD's three measured checks (30 activations at ~2m, 4-hour false-activation
run, reboot survival) all need Pedro over real time — see "Open questions
for the owner."
**Branch:** `phase/02-wake-word`
**Last updated:** 2026-08-03

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

### Phase 2 — in progress, 2026-08-03

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
- 30 deliberate activations at ~2m, his real voice — see above.
- `make install-daemon`, then an actual reboot, for "survives reboot
  without manual intervention." The loaded daemon will almost certainly
  need Microphone/Accessibility/Input Monitoring granted again — confirmed
  this myself (see "Surprised me"): the daemon loaded and ran but sat with
  zero output, consistent with waiting on a permission grant for the
  launchd-invoked python binary, which macOS has never seen before (a
  different identity than Cursor, the interactive dev-mode grant target).
  I unloaded it again after confirming the install mechanics work, rather
  than leave a silently-stuck process running.

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
  further tuning doesn't need a code change. Not yet re-verified live —
  needs a fourth round on long, natural-paced sentences.

---

## Key numbers to record as we go

| Metric | Target | Actual | Phase |
|---|---|---|---|
| Lane classification accuracy | ≥ 85% | 71.1% (NIM `llama-3.1-8b`; no local candidate viable — ADR-001) | 0 |
| Time to first audible syllable | < 1.5 s | 3/10 real trials: 657ms, 686ms, 1530ms (3rd was a ~45-word stress test) | 1 |
| Wake false activations / 4h | < 2 | 1 (score=0.565) | 2 |
| Wake detection rate (30 @ ~2m) | ≥ 90% | 30/30 synthetic TTS proxy (not the official number — see Phase 2 log); real-voice run pending retest after retrigger-race fix | 2 |
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
- [ ] Phase 2's three DoD numbers all need you, over real time — see the
      Phase 2 "Left over" entry above for exactly what and why:
      1. Threshold tuning (`WAKE_WORD_THRESHOLD` in
         `senses/ears/config.py`, currently the untuned default 0.5).
      2. 30 deliberate "hey jarvis" activations at ~2m (≥90% detection).
      3. A 4-hour unattended background run (<2 false activations).
      4. `make install-daemon`, then reboot, for "survives reboot." Expect
         to grant Microphone/Accessibility/Input Monitoring again — I
         confirmed the daemon loads but sits waiting on that, same
         permission dance as Phase 1 but for a different binary identity.
      `make dev` still works for all of this — no need to install the
      daemon just to tune the threshold or count activations, only for the
      final reboot check.

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
- This machine's `/usr/local` Homebrew is Intel/Rosetta, shadowing the
  native arm64 one at `/opt/homebrew` in PATH. `senses/ears/config.py`
  points at the native `whisper-cli` explicitly so the project is correct
  regardless, but any *other* brew-installed tool used ad hoc (not through
  this project's own config) may silently be the slower Rosetta build.
  `which -a <tool>` before trusting one's provenance.
