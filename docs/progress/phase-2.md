# Phase 2 — closed, 2026-08-04

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
