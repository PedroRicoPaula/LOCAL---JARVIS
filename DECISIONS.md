# DECISIONS.md

Architectural decision records. Append only. If a decision is reversed, add a
new ADR that supersedes the old one — do not edit history.

Format: Context → Decision → Consequences.

---

## ADR-001 — `converse` / lane-classifier model
**Status:** accepted — no local candidate viable on this machine; routed to NIM

**Context.** Hardware is a MacBook Air M1, **8 GB unified memory** — below
the 16 GB floor `README.md`'s original model-tier table assumed. Chosen by
benchmark, not reputation, per `bench/bench_local.py` and (once local was
ruled out) `bench/bench_nim_lane.py`.

**Local candidates tried (Ollama, `bench/bench_local.py`):**

- `gemma3:4b` — warmup exceeded the 180s timeout; the 3 subsequent case
  calls all hit clean 30s timeouts despite `ollama ps` reporting the model
  loaded (100% GPU, stable PID — not an OOM-restart loop this time, just no
  response in time).
- `qwen3:8b` — observed repeated `llama-server` subprocess restarts roughly
  once a minute over a ~35 minute window (new PID, near-zero RSS each time)
  while benchmarking alongside `gemma3:4b` — classic OOM-eviction thrashing,
  not a slow-but-working model.
- Conclusion: **8 GB is not enough headroom to run even a 4B-class chat
  model reliably via Ollama on this machine**, alongside macOS and normal
  background load. This is real, observed data, not a guess — see
  `PROGRESS.md` for the raw session log. Not re-tested with a sub-2B model;
  see "Left open" below.

**NIM candidates tried (`bench/bench_nim_lane.py`, reuses the same 45-case
set and system prompt as `bench_local.py`; JSON-validity/accuracy bars
unchanged, no p95 bar — see that file's docstring for why):**

| Model | Valid JSON | Lane accuracy | Latency (median / p95) | Verdict |
|---|---|---|---|---|
| `meta/llama-3.2-3b-instruct` | — | — | 4.7s–15.5s, wildly variable | **Unusable.** Degenerates under NIM's `response_format: json_object` mode — e.g. raw content `{"/reflex/stop/0.99/0.99/0.99/...` repeated to the token limit. Confirmed with a direct one-off call, not just the loop. Aborted after 14/45 cases; the failure mode was already unambiguous and further cases would only have burned rate-limit budget. |
| `meta/llama-3.1-8b-instruct` | **100%** | **71.1%** (32/45) | **709ms / 1019ms** | Best real option. Clean JSON throughout, latency good enough to be genuinely usable. Below the 85% accuracy bar — see failure analysis below. |

**Decision.** Route lane classification (and, for now, general `converse`
traffic) to NIM using **`meta/llama-3.1-8b-instruct`**, per the fallback
ROADMAP.md's Phase 0 Definition of Done already sanctions: *"If no local
model clears that bar, record it and route lane classification to nim — an
acceptable outcome, not a failure."* The owner explicitly approved leaning on
NIM for speed during this session, with the rate limit respected (see
[[project-nim-key-and-limits]] memory) and a pause-and-resume if the budget
is hit.

The local-calibrated bars (valid JSON ≥ 90%, lane accuracy ≥ 85%, **p95 <
900ms**) do not transfer as-is to a remote provider — the latency bar in
particular assumes a network-free call. `bench_nim_lane.py` keeps the
JSON/accuracy bars (still meaningful) and drops the latency bar in favour of
just reporting the number. 1019ms p95 is worse than the local target but is
not disqualifying for a lane that was always going to be async-ish once
routed remotely.

**Failure analysis — why 71.1% and not disqualifying.** 12 of the 13 misses
on `llama-3.1-8b-instruct` are defensible confusions on genuinely ambiguous
cases or on a convention the system prompt never actually teaches:

- 3 of the 6 `reflex` misses are the camera phrases — *"turn on the
  camera," "close the camera," "open your eyes"* — classified `see`/`act`
  instead of `reflex`. `SPEC.md` § 6 deliberately puts camera on/off in the
  `reflex` lane so it can pre-empt anything in flight, but `bench_local.py`'s
  `SYSTEM` prompt never says so — its `reflex` line only lists "stop, repeat,
  cancel, what time is it." A model with no special knowledge of this
  project's convention has no way to get that right.
- The other misses (*"does this shirt go with these trousers"* → converse,
  *"is this resistor the right one"* → reason, *"read this label for me"* →
  converse, etc.) are reasonable alternate readings of genuinely short,
  under-specified utterances — exactly the kind of ambiguity `docs/SKILLS.md`
  § 3's disambiguation step exists to catch, not something a lane-classifier
  prompt can fully resolve alone.

**Action for Phase 3 (not done now — out of scope for a model-selection
phase):** add the camera-control phrases as explicit `reflex` examples in the
router's real system prompt. That alone likely recovers 3–6 points of
accuracy. Re-benchmark then rather than chasing the number now with more NIM
calls.

**Left open, not blocking:** a sub-2B local model (`qwen3:1.7b`,
`llama3.2:1b`) was never tried — 8 GB might handle something that small.
Worth a cheap try during SOAK 1 if `converse` latency/cost via NIM ever
becomes annoying in practice; not worth spending more time on before Phase 1
exists to actually feel the difference.

**Consequences.**
- `converse` is not local for now, contrary to `SPEC.md` § 1's "local by
  default" design goal. This is hardware-driven, not a design change — the
  `ModelProvider`/lane-fallback architecture (ADR-008) is exactly what makes
  this a config choice, not a rewrite, and it can flip back the day a small
  local model proves out or the machine changes.
- `converse` now shares NIM's rate limit with `reason`/`see`-fallback. The
  router's 30 rpm bucket (`SPEC.md` § 3) was sized assuming `converse` stayed
  local; Phase 3 should revisit whether that ceiling still holds once
  `converse` traffic (much higher volume than `reason`) is added to it.
- Privacy posture changes: `converse`-lane utterances now leave the machine.
  Acceptable under NVIDIA's free-tier development/research terms (ADR-002)
  for personal use, but worth restating plainly here since `SPEC.md` § 1 led
  with "voice never leaves the machine."

---

## ADR-002 — `reason` provider
**Status:** accepted — confirmed live 2026-08-03 via `bench/nim_smoke.sh`

**Context.** Heavy reasoning needs a model larger than this machine can host
(confirmed short on RAM even for local `converse` candidates — see ADR-001).
**Decision.** NVIDIA Build (NIM) free tier, OpenAI-compatible, ~40 RPM.
Default model: `meta/llama-3.3-70b-instruct`.
**Consequences.**
- Free, no card, no expiry, 80+ open models including DeepSeek / Qwen / GLM.
- Adds 80–150 ms network latency from Europe. Acceptable: this lane is async.
- NVIDIA's terms restrict the free tier to development, testing, research and
  evaluation — personal use qualifies; serving end users or business
  transactions does not. **This system must never be wired into a customer-
  facing product on this tier.**
- Free-tier terms change. Mitigated by ADR-008.
- No paid provider is built or configured anywhere in the system. See ADR-009.

**Smoke test result (`bench/nim_smoke.sh`, 2026-08-03): 7/7 passed.**
Credential valid (Keychain `jarvis-nim-key`), catalogue reachable (102 models
visible), chat completion in 6974ms (full generation time for a 70B model,
not just network latency — comfortably inside the `reason` lane's 3–15s
budget from `SPEC.md` § 9), strict JSON mode works, streaming works (26 SSE
chunks), and 12/12 rapid requests were accepted with no 429 — consistent with
the owner's confirmed **40 rpm** account ceiling, above the router's planned
30 rpm bucket (`SPEC.md` § 3).

**Owner instruction, recorded here because it should shape Phase 3's router
implementation, not just this ADR:** use NIM deliberately, not by default —
reserve it for requests that actually need `reason`/`see`-fallback, never
route something a local model or a rule could handle to it. This is already
the lane design's intent; treat it as confirmed, not aspirational.

---

## ADR-003 — STT: whisper.cpp
**Status:** accepted, model choice amended 2026-08-03 (Phase 1)

**Decision.** whisper.cpp with Metal, `language=en`.
**Consequences.** Offline, free, permanent. Better on Apple Silicon than
CTranslate2-based alternatives. English-only operation raises accuracy
materially versus Portuguese.

**Amendment — model downsized, `large-v3-turbo` → `small.en`.** The
original pick assumed model size mainly trades off against accuracy.
Measured on this machine (M1, 8 GB — the same one ADR-001 already found
short on headroom): whisper.cpp processes a fixed ~30 second context
window per call regardless of actual utterance length — confirmed by
timing a 0.4s "Hi" against a 1.7s sentence and getting the same ~2.05s,
warm-model, either way. Encode cost is therefore roughly proportional to
*model size*, not audio length, and `large-v3-turbo` (809M params) cost
~2.05s per utterance even with the model resident in memory — over the
Phase 1 DoD's entire 1.5s budget on its own, before VAD, capture or TTS.
`small.en` (244M params, quantized q5_1): **~0.46-0.64s** warm, same
machine. Accuracy on the 20-sentence Phase 1 test set was
indistinguishable between the two — both transcribed every test sentence
correctly, including numbers, technical terms and proper nouns. No
accuracy trade was actually made; `large-v3-turbo`'s extra capacity wasn't
buying anything on inputs this short and clear. See `PROGRESS.md`'s Phase
1 log for the full investigation, and `senses/ears/whisper_server.py` for
why a resident server process (not one `whisper-cli` call per utterance)
was also necessary — reloading the model cold added another ~1.15s on top
of the fixed-window cost. `WHISPER_MODEL` in `senses/ears/config.py` is
one line if a future phase's accuracy needs outgrow `small.en` — larger
models remain a config change, not a rewrite, same pattern as ADR-008's
provider fallback.

---

## ADR-004 — TTS: `say` then Piper
**Status:** accepted

**Decision.** macOS `say` in Phase 1; Piper from Phase 2.
**Consequences.** `say` has near-zero latency and zero setup — right for proving
the loop. Piper sounds better. Piper is GPL-3.0 since the MIT repo was archived
in Oct 2025; fine for personal use, relevant only if ever distributed.

---

## ADR-005 — Wake word: openWakeWord
**Status:** accepted

**Decision.** openWakeWord with the pretrained `hey_jarvis` model.
**Consequences.** Zero training required. Its Speex noise suppression is
Linux-only, so macOS gets none — budget half a day for threshold tuning.
`livekit-wakeword` exports openWakeWord-compatible ONNX and reports better
metrics; it is the drop-in upgrade if tuning fails.

---

## ADR-006 — Code harness: Aider
**Status:** accepted

**Context.** The `act` lane needs an agent loop. Writing one is a project.
**Decision.** Aider, pointed at the router's `reason` provider.
**Consequences.** Git is the trust boundary: every change is a commit, every
commit is revertible and diffable. This *is* the HITL mechanism for code — it
removes an entire subsystem from the build. Alternatives if Aider disappoints:
Goose, OpenHands, Cline. All are model-agnostic and take any OpenAI-compatible
endpoint.

---

## ADR-007 — Store: SQLite
**Status:** accepted

**Decision.** SQLite with `sqlite-vec`. Not Postgres.
**Consequences.** Zero infrastructure, zero daemon, trivial backup (copy a
file). Single-writer is not a constraint here — only `core` writes. Revisit only
if concurrent writers appear.

---

## ADR-008 — No single provider dependency
**Status:** accepted

**Context.** Free tiers change without notice. Published limits for NVIDIA's
free tier already contradict each other across sources because they shifted
during 2026.
**Decision.** Every lane has an ordered provider list with at least one
`free-local` fallback. Adding a provider is one file plus one config line.
**Consequences.** Slightly more work up front. The system survives any single
provider changing its terms, and a paid provider becomes a config change rather
than a migration.

---

## ADR-009 — Paid providers deferred
**Status:** accepted · supersedes the provisional stub in v0.1

**Context.** The owner initially planned to buy a Claude Pro/Max subscription to
obtain an API key. That is not how those products work, and the current priority
is a system that works completely on free infrastructure.

**Decision.** No paid provider is built, stubbed or configured. The
`ModelProvider` interface exists and is sufficient; adding a paid adapter later
is one file plus one config line, per ADR-008. Nothing in any phase's Definition
of Done may require a paid key.

**Facts to preserve for when this is revisited:**
- A Claude Pro/Max subscription does **not** include API or Console access.
  Anthropic's help centre is explicit: a paid subscription enhances the chat
  experience but does not include the API or Console. Programmatic access
  requires Claude Console with separately purchased prepaid credits.
- Pro/Max *does* cover interactive Claude Code for the owner's own work. That is
  a different thing from this system calling an API, and it is not blocked by
  this ADR.
- **Trap:** if `ANTHROPIC_API_KEY` is set in the environment, Claude Code uses
  API billing instead of the subscription. If a key is ever added here, it lives
  in an isolated shell scope loaded only by the Jarvis launchd job — never in
  `~/.zshrc`, never exported globally.

**Consequences.** One less moving part. The system is provably free-tier-only,
which is also the cleanest position under NVIDIA's development-use terms.

---

## ADR-010 — The camera is a voice-controlled session
**Status:** accepted · refines v0.1

**Context.** The owner's requirement: say "turn on the camera", state what is
needed, get an answer, and have it shut down. Not ambient. Not always on.

**Decision.** The camera is a session with an explicit state machine:
`IDLE → ARMED → CAPTURE → ARMED → IDLE`, specified in `SPEC.md` § 6.

Invariants that are not negotiable:
- **ARMED is not recording.** Arming the camera captures nothing. A frame is
  taken only when a request is made. This is the difference between a tool and
  a surveillance device.
- Every follow-up request **re-captures**; frames are never reused. The owner
  has usually moved something, which is the whole point in the workbench case.
- The indicator is on for the entire ARMED session, not only during capture.
- Two announced timeouts: 120 s idle, 10 min absolute. Configurable, not
  removable.
- Frames are deleted on close unless an approved `observation` references them.
- "Close the camera" is a `reflex`-lane command and pre-empts anything in flight.

**Consequences.** Continuous local VLM inference was never viable on a laptop,
so this costs nothing technically. It also produces a better product: an
assistant that comments unprompted becomes tiring rather than useful, and one
whose camera state is always unambiguous is one you can leave running.

---

## ADR-011 — The owner is the source of truth for quantities
**Status:** accepted · supersedes the estimate-range design in v0.1

**Context.** v0.1 proposed storing vision-derived calorie estimates as ranges
with confidence. The owner proposed something better: he states the food and
the quantity himself and confirms everything before it is written.

**Decision.** No model ever produces a number that is stored as fact.

| Who | Does |
|---|---|
| Vision | Identifies. "Looks like grilled chicken, white rice, green salad." |
| Owner | Quantifies and confirms. "180g chicken, 150g rice, 80g salad." |
| Lookup table | Converts. Confirmed food + confirmed grams → calories, macros. |
| Model | Never touches the number. |

Nothing is written until the owner has heard it read back and agreed. An item
with no declared quantity is logged without one; it is never estimated.

Nutrition data comes from local static datasets — Open Food Facts (open data,
good European and Portuguese barcode coverage) and USDA FoodData Central (public
domain, strong on raw and generic foods). Downloaded once, queried offline. A
lookup miss is reported to the owner, not filled in by a model.

**Consequences.**
- The hardest correctness problem in the original design disappears entirely.
  Vision does the thing it is reliable at (identification) and nothing else.
- Daily totals become legitimate, because every number is declared or measured.
  The v0.1 prohibition on totalling applied to estimates; there are no longer
  any estimates in this path.
- The `Estimate` type remains in `shared/types.ts` for genuinely uncertain
  things — a vision identification's confidence, a coach's inferred pattern —
  and still has no `value` field.
- The same contract governs `workbench`: confirm the component, then advise.
  "I think that's a 220 ohm, confirm?" before "your LED will draw about 15 mA",
  never after.

---

## ADR-012 — Skills come before the dashboard
**Status:** accepted

**Context.** The owner's stated goal is a system of skills, well structured. In
v0.1 the skill host was Phase 7, after the gate and the dashboard.

**Decision.** The skill host moves to Phase 5, before both. Its first skill,
`brief`, needs only `MEMORY_READ`, so it requires no gate and proves the
interface at zero risk.

**Consequences.** The interface that everything else plugs into gets exercised
by real use before the gate and the UI are built around it, so their designs are
informed rather than speculative. The phase's acceptance criterion is a
stopwatch: `make new-skill` to a working no-op skill in under 30 minutes. That
number, more than any other in this project, predicts whether it has ten skills
in a year or three.

---

## ADR-013 — `ctx.ask` is a platform primitive
**Status:** accepted

**Context.** Every skill worth having is conversational: identify, ask, confirm,
correct, write. If each skill implements its own question-and-wait loop, they
will all differ and all be subtly broken.

**Decision.** `ctx.ask(question, opts)` — speak a question, await a spoken
answer, with timeout — is provided by the skill host, not by skills.

**Consequences.** The confirmation loop in `docs/SKILLS.md` § 5 becomes the
default shape of a skill. Interruption, timeout and cancellation are handled
once, correctly, in one place.

---

## ADR-014 — Phase 1 IPC and VAD: native whisper.cpp VAD, plain Unix sockets
**Status:** accepted

**Context.** `SPEC.md` § 2 specifies `ears` and `voice` as separate processes
talking over "a local Unix socket," without pinning the wire format. ROADMAP's
Phase 1 checklist lists Silero VAD as a separate line item from whisper.cpp,
which read as "two ML components" going in.

**Decision.**
- **IPC:** newline-delimited JSON over `AF_UNIX` `SOCK_STREAM`, shared helper
  in `senses/ipc.py` (`listen`/`accept_one`/`connect`/`send_line`/`read_lines`).
  Message shape mirrors `ServerEvent`/`ClientEvent` in `shared/types.ts` for
  consistency, even though it's a different transport. `ears` and `voice` are
  servers (they sit and wait, matching their `launchd, always on`/`idle`
  description in `SPEC.md` § 2); whatever orchestrates them — the throwaway
  `senses/echo_bridge.py` in Phase 1, `core/` from Phase 3 — is the client
  that connects out to both.
- **VAD:** `whisper-cli`'s built-in `--vad`/`--vad-model` flags (confirmed via
  `whisper-cli --help`) run the same Silero VAD model ADR-003 already calls
  for, natively inside the same binary that does STT. No second ML runtime
  (`torch`/`onnxruntime`) in `senses/ears` at all.

**Consequences.**
- One fewer heavy Python dependency on a machine that Phase 0 already proved
  has no headroom to spare (ADR-001). This wasn't a nice-to-have — see the
  Phase 1 log in `PROGRESS.md` for what this machine does to a stray large
  dependency.
- `senses/ears/transcribe.py` shells out to `whisper-cli` rather than using a
  Python binding — matches the project's existing preference for proven
  native tools over C-extension wrappers (Aider/git in ADR-006 is the same
  pattern applied to the `act` lane).
- The IPC protocol is intentionally the simplest thing that could work
  (blocking single-client accept, no reconnection state beyond "wait for the
  next `accept()`"). Revisit if Phase 3's `core/` ever needs multiple
  concurrent consumers of `ears`' output — not needed yet, not built yet.

---

## ADR-015 — Phase 2 wake word: real-time audio, silence detection, ack
**Status:** accepted

**Context.** ROADMAP's Phase 2 checklist is three lines (openWakeWord,
threshold tuning, ack) but making `ears` continuously listening — not just
recording while a key is held — touches real-time audio architecture, not
only which library to call.

**Decisions.**
- **ONNX, not openWakeWord's tflite default.** `tflite-runtime` has no
  solid Apple Silicon wheel; `Model(inference_framework="onnx")` works
  cleanly once the onnx model variants are fetched via
  `openwakeword.utils.download_models(...)` (they aren't bundled — confirmed
  by trying to load before downloading and getting a clean `NO_SUCHFILE`).
- **The real-time audio callback does nothing but enqueue.** First
  implementation ran wake-word scoring and RMS/silence bookkeeping directly
  inside `sounddevice`'s `InputStream` callback. This produced a real,
  reproducible bug: live testing (not just fakes) showed detection firing
  correctly but the subsequent auto-stop silently never completing — no
  error, no crash, just nothing, for 15-20+ seconds past where an 8-second
  hard cap should have fired. Isolated single-purpose test scripts showed
  the same logic working correctly and quickly (frames counted at the
  correct ~80ms cadence, auto-stop firing in ~1.2s once actually
  instrumented) — the difference was everything else running at once
  (`whisper-server`, `voice`, `echo_bridge`, the hotkey listener thread).
  Real-time audio callbacks are expected to return in a few milliseconds;
  running ONNX inference and float math inside one, with several other
  threads contending for the GIL, is exactly the kind of thing that misses
  its deadline under load even when it works fine in isolation. Fixed by
  making `_on_block` do a single `queue.put()` and nothing else; a
  dedicated worker thread drains the queue and does all the real work. See
  `PROGRESS.md`'s Phase 2 log for the full diagnostic trail — this cost
  real debugging time and is worth remembering as a pattern (isolation
  testing can hide contention bugs) not just a one-off fix.
- **Wake-word detection fires on the falling edge (phrase finished), not
  the rising edge (phrase started) — amended after Pedro's first live test
  round.** The original design armed the command recorder on the very
  first frame crossing threshold. Live testing (not synthetic — see
  `PROGRESS.md`'s Phase 2 log) showed this reliably captured the tail end
  of "jarvis" itself as the start of the recorded command, producing
  transcriptions like `"HRVs are you listening to me?"` instead of the
  actual command. Synthetic TTS tests never caught this because they used
  phrases with an artificial pause baked in between wake word and command.
  Fixed by having `wake_word.watch()` track the peak score through the
  above-threshold region and fire once it drops back down (with a
  frame-count safety cap in case it never does) — recording now starts
  after the wake phrase has acoustically finished, at the cost of the ack
  firing slightly later (still sub-second).
- **`whisper.cpp`'s non-speech placeholder output must be filtered, not
  trusted as text.** Also found live: a wake-word capture with no real
  speech in it transcribed to the literal string `"[BLANK_AUDIO]"`, which
  would have been spoken back to the owner verbatim. `SPEC.md` § 0.5's "no
  model ever produces a number that gets stored as fact" is about
  quantities specifically, but the same instinct applies here — a model's
  internal bookkeeping tokens are not utterances and must never be treated
  as one just because they arrived as a non-empty string.
- **Energy-based (RMS) silence detection for wake-word-triggered capture,
  not a second VAD pipeline.** Push-to-talk's end-of-speech signal is the
  key release; wake-word mode has none. A simple consecutive-low-RMS-frames
  counter (with a short grace period before it starts counting, and a hard
  max-duration cap regardless) is "boring" and needs no new dependency —
  same reasoning as ADR-014's "don't add a second ML runtime to `senses/
  ears`" applied one level further.
- **Reflex ack is a system sound + notification, not spoken TTS.**
  `SPEC.md` § 3's reflex budget is <300ms; a played sound is faster than
  waiting on `say` to synthesize anything, and ships with macOS
  (`/System/Library/Sounds/*.aiff`, `afplay`, `osascript -e 'display
  notification'`) — no new dependency. A persistent menu-bar indicator
  (closer to "always visible" than a transient notification) was considered
  and deferred to `docs/BACKLOG.md` — real additional scope (a small
  menu-bar app) that nothing currently requires.
- **`LaunchAgent`, not `LaunchDaemon`, for the "survives reboot" DoD item.**
  Daemons run as root outside the user session and can't hold the
  Microphone/Accessibility/Input Monitoring grants Phase 1 already needed —
  matches the existing precedent at `~/Library/LaunchAgents/
  homebrew.mxcl.ollama.plist`. Confirmed the install/uninstall mechanics
  work (`make install-daemon` correctly substitutes the repo's absolute
  path and `launchctl load`s it) but the loaded daemon itself sat with zero
  output and an unusual process state — almost certainly waiting on a
  Microphone permission grant for the launchd-invoked python binary, which
  is a *different* binary identity than Cursor (the interactive dev-mode
  grant target) and has never been granted anything before. Expected, not a
  bug; flagged plainly rather than left for Pedro to discover blind — see
  `PROGRESS.md`'s Open Questions.
- **`main()` installs a SIGTERM handler that raises `KeyboardInterrupt`,
  reusing the existing shutdown path instead of a second one.** Found
  running the 4-hour false-activation test: `kill <pid>` (SIGTERM) killed
  `ears` but left `whisper-server` orphaned, because Python's default
  SIGTERM disposition terminates immediately without unwinding the stack —
  the `try/finally` that stops `whisper-server` only ever ran for Ctrl+C
  (SIGINT), which Python does convert into a catchable
  `KeyboardInterrupt`. This matters beyond a stray process during manual
  testing: `launchd` sends SIGTERM on every `KeepAlive` restart and on
  `launchctl stop`/`unload`, so the unpatched daemon would have leaked a
  `whisper-server` process on every single restart cycle — directly in the
  path of the reboot DoD test. Verified fixed by starting the daemon,
  sending SIGTERM, and checking `ps`: both processes now exit together.
- **`on_wake` checks `busy_lock.locked()` before setting `wake_event`,
  rather than relying on `finally: wake_event.clear()` to discard stray
  re-triggers after the fact.** Found in Pedro's second live round: saying
  "hey jarvis" deliberately mid-sentence made the daemon stop and start a
  new capture right on the heels of the first, duplicating/fragmenting the
  transcript. The existing `finally`-clear (see the falling-edge bullet
  above) only discards a re-trigger that's already set *before* that
  `finally` runs; a detection landing in the gap between
  `wake_event.clear()` and `busy_lock.release()`, or immediately after,
  survives and fires a spurious capture instantly. Moving the check to the
  point of detection instead of the point of cleanup closes the window
  rather than racing to sweep up after it. Also extracted the previously
  inline `on_wake` closure into `make_wake_handler()` so this logic — the
  second real bug the fakes-based test suite couldn't have caught, both
  found only through Pedro's own live usage — is unit-testable going
  forward instead of living only in `main()`.
- **`SILENCE_FRAMES_TO_STOP` raised from 10 frames (800ms) to 25 (2.0s),
  `MAX_RECORDING_FRAMES` from 100 (8s) to 200 (16s), both made
  env-overridable.** Found in Pedro's third live round, after confirming
  the retrigger fix above actually worked: with the duplicate-capture bug
  gone, he still reported the daemon "stops listening while I'm still
  talking." 800ms of silence is shorter than an ordinary thinking or
  breath pause in unscripted speech, so auto-stop was disarming mid-
  sentence and silently dropping everything said after — no error, no
  visible cue, which is why it presented as the daemon losing him rather
  than a threshold being too tight. This is exactly the kind of value
  ADR-005 already flagged as needing real-voice tuning rather than a
  static guess; env vars exist so it can keep moving without a redeploy.
- **`MAX_RECORDING_FRAMES` raised again, 200 (16s) → 400 (32s).** Fourth
  live round confirmed the 2.0s silence fix works (multi-clause sentences
  with natural pauses now come through complete), but longer (~40-word)
  test sentences were hitting this cap instead — cut in roughly the same
  place on repeated attempts of the same sentence, not randomly, pointing
  at the hard ceiling rather than a silence-detection issue. 32s is
  generous headroom for a genuinely long command while still bounding a
  stuck-mic worst case.
- **`_on_sigterm` now switches itself to `SIG_IGN` before raising
  `KeyboardInterrupt`.** Found live: a `make dev` Ctrl-C that looked clean
  (traceback printed, prompt returned) had actually left `ears.main` and
  `whisper-server` both running and still scoring audio a full CPU-minute
  later — a second, independent daemon competing for the same mic, which
  is why one test showed the same utterance transcribed twice slightly
  differently (one instance dropped it for "no bridge connected," the
  other delivered it). Root cause: the `Makefile`'s
  `trap 'kill 0' EXIT INT TERM` sends SIGTERM twice per Ctrl-C — the INT
  trap's `kill 0` triggers shell exit, which fires the EXIT trap's
  `kill 0` again — and the second delivery was landing mid-cleanup
  (often inside `whisper_server.stop()`'s `process.wait()`), raising a
  second `KeyboardInterrupt` that aborted cleanup before `whisper-server`
  was confirmed dead. Ignoring SIGTERM once the handler has already fired
  makes the redundant second delivery a no-op instead of a second
  interrupt. Verified on an isolated port: double SIGTERM now produces one
  traceback, both processes gone.

**Consequences.**
- `senses/ears/audio_capture.py`'s `ContinuousAudioSource` is meaningfully
  more complex than Phase 1's per-utterance `MicAudioSource` it replaced —
  justified by being the only viable shape for "always listening," not
  complexity for its own sake.
- Two independent trigger sources (hotkey, wake word) now share one
  capture pipeline behind a single `threading.Lock`; a trigger arriving
  while the other is already capturing is logged and dropped, not queued —
  simultaneous use is an edge case not worth solving now.
- `ConnectionHolder` (in `senses/ears/main.py`) decouples "is bridge/core
  connected" from "are we capturing": an utterance transcribed with nobody
  connected is logged and dropped rather than erroring, since `ears` must
  keep listening regardless of whether anything downstream exists yet to
  receive it.

---

## ADR-016 — Removed the post-Phase-2 soak; verification splits into self-run and owner-required tiers

**Status:** accepted

**Context.** `ROADMAP.md` originally scheduled 🛑 SOAK 1 right after Phase 2
(wake word): two mandatory weeks of daily use before Phase 3 could start.
After Phase 2 actually closed, Pedro asked why — if the phase's checks
already passed — a calendar-time gate was still required before continuing,
and proposed instead: run whatever verification the agent can run itself at
each phase, and save the extended real-daily-use soak for whenever JARVIS
has something actually worth living with day to day.

**Decision.**
- **Removed the soak between Phase 2 and Phase 3.** Its stated purpose
  (`ROADMAP.md`: "find out whether Phases 1–2 are pleasant to use") doesn't
  hold much weight yet at that point in the build — Phase 2's `ears` only
  echoes back what it heard through a throwaway bridge; there's no response,
  no action, no UI. "Is this pleasant to use daily" is a weak question to
  ask of something with no real utility yet. The remaining soak (after
  Phase 7 — memory, a working skill system, a UI to drive it from) already
  matches what a meaningful "live with it" test needs, and is renumbered
  SOAK 1 as the sole mandatory pause in the roadmap.
- **This does not remove verification, it relocates the burden.** Every
  phase's Definition of Done now explicitly splits into a *self-run* tier
  (fakes, synthetic inputs, scripted CLI/HTTP calls, live smoke tests
  against real components, and — from Phase 7 onward — Playwright driving
  the actual running dashboard) and an *owner-required* tier (genuinely
  needs Pedro's voice, body, or elapsed real time). See `CLAUDE.md` § 1.
  Phase 2 itself is the proof this works even without a formal soak: five
  live rounds of real speech (not a synthetic bench script) found and fixed
  five real bugs — a wake-word retrigger race, a premature silence cutoff,
  an undersized max-recording cap, a `[BLANK_AUDIO]` transcription leak,
  and a double-SIGTERM process leak — all inside the phase itself, none of
  them needing a two-week wait to surface.
- **Owner-waived DoD items are still recorded as waived, not silently
  treated as passed.** Phase 2 closed with the 30-activation count
  functionally demonstrated but not formally tallied — written down as
  exactly that in `PROGRESS.md`, same as Phase 1's word-accuracy waiver.
  Removing the soak doesn't lower this bar.

**Consequences.** Phase 3 can start immediately once its own checks pass,
without a calendar gate. The tradeoff is real and accepted deliberately:
Phases 3–7 (router, memory, skill host, gate, dashboard — roughly 9.5 weeks
at the roadmap's own pace) now build on each other with no owner-driven
real-world pause until Phase 7 closes. If something foundational needs to
change based on real use, it surfaces later and costs more to unwind than it
would have under the old schedule. Mitigated, not eliminated, by requiring
the self-run tier to actually execute (not just get planned) at every phase,
the same live-testing discipline that already caught five real bugs in
Phase 2 without any soak in place.
