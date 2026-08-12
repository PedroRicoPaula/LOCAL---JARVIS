# Phase 1 — complete, 2026-08-03

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
