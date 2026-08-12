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

**Update (Phase 3, 2026-08-04): done, and the gap fully closed.** The
camera-phrase fix alone brought 71.1% → 75.6%, confirming the prediction.
Three further rounds of prompt iteration against the real router's own live
failures (not the case list in the abstract) brought it to **93.3%**,
comfortably over the 85% bar. See `PROGRESS.md`'s Phase 3 log and ADR-017 for
the specific confusions found and how each was resolved.

**Left open, not blocking — resolved in Phase 3:** a sub-2B local model
(`qwen3:1.7b`, `llama3.2:1b`) was never tried — 8 GB might handle something
that small. Worth a cheap try during SOAK 1 if `converse` latency/cost via
NIM ever becomes annoying in practice; not worth spending more time on before
Phase 1 exists to actually feel the difference.

**Update (Phase 3, 2026-08-04):** tried during Phase 3 rather than waiting —
`qwen2.5:0.5b` (not `qwen3:1.7b`, an even smaller model, since the point was
proving *any* viable free-local `converse` fallback exists at all, not
matching `nim`'s accuracy). Works reliably: no OOM-thrash, no timeouts,
~370–490ms/call. Now wired as `converse`'s free-local fallback in
`core/router/wiring.ts` — see ADR-017.

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

---

## ADR-017 — Phase 3 router: provider wiring, fallback semantics, testability

**Status:** accepted

**Context.** `SPEC.md` § 3 specifies the `ModelProvider` interface and the
rule that every lane needs at least one free-local fallback, "even a
degraded one." Phase 0 (ADR-001, ADR-002) already decided *which* models to
use; Phase 3 had to decide how the router actually wires them together, what
"falls through on failure" means precisely, and — as it turned out live —
catch two real bugs no fake could have.

**Decisions.**
- **`ModelProvider` lives in `core/router/provider.ts`, not
  `shared/types.ts`, despite `SPEC.md` § 3 showing it inline with the other
  Router types.** `shared/types.ts`'s own docstring scopes it to boundary
  types (core↔ui, core↔senses, core↔skills); providers are never called
  from outside `core/router/` itself.
- **Registry path is `core/router/registry.ts`, not `core/providers/
  registry.ts`** (`SPEC.md` § 3's literal code-snippet path). `SPEC.md`
  § 10's repository layout table — the section that actually enumerates the
  whole tree — already lists `core/router/` as owning "lanes, providers,
  fallback." Treated as the tie-breaker; § 3's path was presumably
  illustrative, not authoritative.
- **Fallback only happens before the first chunk reaches the caller.** A
  provider failing after already streaming output doesn't trigger a
  further fallback attempt — it's a hard failure instead. Switching
  providers mid-stream would hand the caller (eventually TTS) a spliced,
  garbled completion. Every real failure mode actually observed (connection
  refused, non-200, 429, an embedded-error SSE event, a timeout) surfaces
  at or before the first byte; a genuine mid-stream drop is rare enough
  that failing honestly beats risking corruption. Revisit only if real use
  shows otherwise.
- **`converse`: `nim` (`llama-3.1-8b-instruct`) first, `ollama`
  (`qwen2.5:0.5b`) as the free-local fallback.** Not `gemma3:4b`/`qwen3:8b`
  — both OOM-thrash on this 8GB machine (ADR-001). `qwen2.5:0.5b` is
  ADR-001's own "worth a cheap try" sub-2B model, tried now rather than
  deferred: works reliably, accuracy far below `nim`'s and that's fine —
  SPEC.md § 3 asks for "even a degraded" fallback, not parity.
- **`reflex`: `rules` only — no model, no network.** `reflex`'s own
  definition ("trivial, instant, no reasoning") names a small, fixed,
  pattern-matchable set. This is the lane's free-local fallback by
  construction, not something added on top.
- **`reason`: `nim` (`llama-3.3-70b-instruct`) then `OfflineFallbackProvider`
  — an honest "can't reach it" message, not a real local reasoning
  capability.** No local model of that class fits this hardware (ADR-002).
  SPEC.md § 3's fallback requirement is satisfied by never hanging or
  crashing and being honest about the gap (CLAUDE.md § 6), not by
  overclaiming a capability that doesn't exist.
- **`fetch` is injectable on both `NimProvider` and `OllamaProvider`
  (`fetchFn` config field).** Added *after* a real bug shipped because
  their response-parsing logic had no test coverage at all — see
  "Surprised me" in `PROGRESS.md`'s Phase 3 log. Now both have direct unit
  tests (`nim.test.ts`, `ollama.test.ts`) exercising SSE/NDJSON parsing,
  embedded-error detection, and HTTP-status mapping without any network,
  closing the gap CLAUDE.md § 3 asks every outward-facing module to close.
- **NIM can return HTTP 200 with an `error` field embedded in the SSE body**
  instead of a proper error status — confirmed live under real load from
  this phase's own benchmark runs (`"ResourceExhausted: Worker local total
  request limit reached (19/16)"`). `response.ok` is not sufficient to know
  a NIM request actually succeeded; every parsed SSE event is now checked
  for a top-level `error` field before being treated as content.
- **The lane classifier's request timeout is 3000ms, not `SPEC.md` § 9's
  150ms lane-classification budget.** That budget assumes a local model —
  an assumption ADR-001 already broke. A cold connection plus generation
  time exceeded even 1500ms on a real live call; 3000ms leaves real margin.
- **`bench/bench_router_lane.ts` grades the actual router (`classifyLane()`
  through the real registry), not the raw model in isolation** the way
  Phase 0's `bench_local.py`/`bench_nim_lane.py` did. The 45-case set is
  copied, not imported (no Python↔TS import path exists) — kept in sync by
  hand, a known, accepted minor duplication.

**Consequences.**
- Lane classification measured at 93.3% live (up from ADR-001's 71.1%),
  reached through iterative prompt refinement against the router's own
  actual confusions rather than the case list read cold — see
  `PROGRESS.md`'s Phase 3 log for the specific failure→fix rounds.
  `nim`'s temperature-0 output was not perfectly stable run to run; a few
  cases flipped between otherwise-identical benchmark runs. Expected
  remote-model variance, not chased further once solidly over the bar.
- This phase's own testing (~120 NIM calls in under 20 minutes across two
  full 45-case runs plus targeted re-checks) visibly stressed the NIM
  account — the embedded-error bug surfaced *because* of this load, and
  later direct `curl` calls to the `reason`-lane 70B model timed out
  completely with no code of mine involved. A live "`nim` answers a
  `reason`-lane request cleanly" happy-path run was not captured this
  session as a result — the failure-handling path is proven solid via
  `nim.test.ts` and twice live under real degraded conditions, but the
  clean success case is a left-over item for a quieter moment, not
  something blocking or risky. `[[project-nim-key-and-limits]]`'s "use
  sparingly" guidance is now a concrete lesson, not just a rate number: a
  benchmarking phase should lean on targeted re-checks (a handful of
  previously-failed cases) over repeated full-45 runs while iterating.
- `tsconfig.json` gained `allowImportingTsExtensions` and `@types/node`
  joined as a dev dependency — both needed for Node's native TS execution
  (`.ts`-extension imports, global `fetch`/`AbortController`/etc. types) to
  coexist with `tsc --noEmit`'s usual NodeNext conventions. No build step,
  no bundler, no new runtime dependency — `node --test` runs `.ts` files
  directly on this Node version (22.22), matching the Python side's own
  "no unnecessary tooling" precedent.

**Update (post-close, 2026-08-04): `ConcurrencyLimiter` added, declined
OmniRoute.** Owner asked about integrating OmniRoute (a 290-provider "AI
gateway" project surfaced on social media) as a NIM-quota fallback.
Declined: it duplicates this ADR's own router, makes the destination of
transcribed speech non-deterministic across dozens of unaudited providers'
ToS (a real regression from the already-accepted NIM-specific tradeoff in
ADR-001), and its prompt-compression pipeline sits directly on top of the
exact wording this phase spent several rounds tuning. It would also solve a
problem real single-owner usage essentially never hits — the account strain
this phase saw came from ~120 benchmark calls in under 20 minutes, not from
anything resembling normal use.

The actual root cause was real and worth fixing: `TokenBucket` limits
requests *per minute*; "Worker local total request limit reached (19/16)"
is a concurrency ceiling, a different axis it never guarded. Added
`core/router/concurrencyLimiter.ts` — a second, independent, non-blocking
throttle (default max 8 in flight) wired into `NimProvider` alongside the
bucket. If real future headroom is ever needed beyond this, the
JARVIS-native path is one more deliberately-chosen, auditable free
provider as a config line in `wiring.ts` — exactly what the registry
architecture (ADR-008) exists to make cheap — not a black-box aggregator.

---

## ADR-018 — Phase 4 memory: node:sqlite + sqlite-vec, schema deviations, cap design

**Status:** accepted

**Context.** `SPEC.md` § 4 specifies the schema (`events`/`facts`/
`observations`/`memory_vec`), a recall policy (recent turns + semantic
matches + high-confidence facts, capped), and that `events` must be
genuinely append-only. Building it meant choosing an actual SQLite binding
and reconciling two of the schema's literal numbers with what Phase 3 had
already put in place.

**Decisions.**
- **`node:sqlite` (built into Node 22, Experimental) over `better-sqlite3`
  (a compiled native addon).** Smaller supply-chain surface — no native
  compile step, no prebuilt-binary-per-platform story beyond what
  `sqlite-vec` itself ships — matching CLAUDE.md § 3's "maintainable by one
  person" bias toward fewer moving parts. Experimental status is a real,
  deliberately accepted risk: this is a local, single-writer file database
  for one owner, not a concurrent multi-user service, so API churn is cheap
  to absorb. `better-sqlite3` is the documented fallback if it ever isn't.
- **`sqlite-vec` (the official npm package, prebuilt per-platform binaries,
  no compilation) for the vector index**, loaded via `node:sqlite`'s
  `DatabaseSync`'s `allowExtension`/`loadExtension` support. Confirmed live
  before writing real code against it: extension loads, `vec0` virtual
  table creates, insert/search round-trips.
- **`events` is append-only via two `BEFORE UPDATE`/`BEFORE DELETE`
  triggers that `RAISE(ABORT, ...)`**, not application-level convention.
  Confirmed live that both raise catchable errors from `node:sqlite`, not
  silent no-ops.
- **`memory_vec`'s embedding dimension is 1024, not `SPEC.md` § 4's literal
  `float[768]`.** That number assumed `nomic-embed-text`; Phase 3 already
  pulled and wired `mxbai-embed-large` (1024-dim, generally the stronger
  model on public benchmarks) as the `ollama` provider's embed model.
  Adjusted the schema to the model already in use rather than switching
  models to match an illustrative schema number.
- **`memory_vec` uses `distance_metric=cosine`, not `sqlite-vec`'s default
  L2/euclidean.** `SPEC.md` § 4 asks for a "similarity floor" on semantic
  matches; cosine distance is bounded (0 identical, 1 orthogonal, ~2
  opposite) and a threshold on it reads directly as a similarity floor. L2
  has no natural bound to floor against. Confirmed `distance_metric=cosine`
  is a real, working `sqlite-vec` column option before relying on it.
- **Facts are recalled by confidence threshold only in this phase — not
  indexed into `memory_vec` for semantic search.** `SPEC.md` § 4's recall
  policy step 3 doesn't ask for semantic fact matching, only step 2
  (events) does. Not building fact-embedding ahead of an actual need
  (CLAUDE.md § 0.6).
- **The recall cap is character-based, not a real tokenizer count.** A
  tokenizer is a dependency for a number that only needs to be a
  reasonable, consistent budget, not a billing-accurate one — documented
  as an approximation in `recall.ts`, not implied to be more precise than
  it is. Pieces that don't fit are skipped whole, never truncated
  mid-text, in SPEC.md § 4's own priority order (recent turns always
  first, then semantic matches, then facts) — simpler to reason about and
  to test "never exceeds the cap" against exactly.
- **The literal "three facts told across three sessions" DoD line is
  proven as a mechanism, not yet as the owner's real experience.**
  Nothing can *tell* `Memory` something by voice until Phase 5 gives it a
  skill to talk through — this phase owns storage/recall, not the
  conversational path into it. `memory.test.ts` proves the storage/recall
  mechanism directly (three facts via `upsertFact()` across three
  simulated sessions, recalled via `factsAboveConfidence()` in a fourth).
  Flagged as exactly that, not claimed as the full owner-facing scenario.

**Consequences.**
- Recall latency measured at **12.43ms p95** (median 11.96ms) over 10k
  synthetic events — comfortably under the 200ms bar, `bench/
  bench_recall_p95.ts`. Synthetic here means random embeddings inserted
  directly, not 10k real Ollama embedding calls; that cost lives in the
  `ollama` provider (Phase 3) and isn't what this number is measuring.
- Two runtime-only bugs surfaced by actually running the code, not by
  `tsc --noEmit`: `sqlite-vec` needs a JSON-array string for vector
  parameters, not a raw `ArrayBuffer` blob (a confusing "JSON array
  parsing error" otherwise); and `sqlite-vec`'s package is a default
  export only under CommonJS `require()` — `import sqliteVec from
  "sqlite-vec"` type-checks fine under `esModuleInterop` but fails at
  runtime under real ESM, only `import { load } from "sqlite-vec"` works.
  Both a reminder that a clean `tsc --noEmit` on a new dependency's import
  shape doesn't guarantee it actually runs — worth one real execution
  before trusting it.

---

## ADR-019 — Phase 5 skill host: routing thresholds, namespace enforcement, stubs

**Status:** accepted

**Context.** `docs/SKILLS.md` specifies the manifest format, two-stage
routing (lane classifier → embedding match → disambiguation), the
`SkillContext` surface, per-skill storage, and error isolation. Building it
meant real decisions about where `Skill`/`SkillContext` live, how routing
thresholds and lane-filtering interact, how storage isolation is actually
enforced, and how to represent capabilities (`CAMERA`, the gate) that don't
exist yet without either building them early or leaving `SkillContext`
incomplete.

**Decisions.**
- **`Skill`/`SkillContext`/`Router`/`Conversation`/`SkillStore` live in
  `core/skills/types.ts`, not `shared/types.ts`** — same reasoning as
  `ModelProvider` (ADR-017) and `Memory`: skills run in the same process as
  `core`, never across a real boundary.
- **Embedding match is plain JS cosine similarity over an in-memory array,
  not `sqlite-vec`.** The candidate set is every manifest example across
  loaded skills — at most a few hundred short strings. Routing skill
  dispatch through `core/memory`'s database would couple two things that
  don't need to be coupled.
- **A skill's candidate intents are filtered to those whose declared
  `lanes` include the classified lane, *before* scoring.** Found live
  (routing benchmark's first run, 80%) that this filter can silently make
  an utterance completely unroutable if a manifest's declared lanes don't
  match what the lane classifier actually produces for its real phrasings
  — not a routing-quality problem, a hard miss with zero candidates. Kept
  the filter (it's the right design — an intent genuinely shouldn't fire
  outside its declared lanes) and instead fixed the two manifests that had
  it wrong; see "Surprised me" in `PROGRESS.md`'s Phase 5 log.
- **`ctx.store`'s namespace enforcement checks every literal `skill_`
  marker against the calling skill's own id, not just the four shared
  table names.** The first version only blocked `events`/`facts`/
  `observations`/`memory_vec` explicitly — a skill could still reach
  another skill's `skill_<other>_*` table. `store.test.ts`'s own
  cross-skill test caught this immediately; fixed before it shipped
  further than that one test run.
- **`camera.ts` and `gate.ts` are throwing stubs, not omitted fields.**
  Every field `docs/SKILLS.md` § 4 specifies for `SkillContext` is really
  present on every context; what's missing is the real capability behind
  `camera`/`propose` (Phase 8, Phase 6). Calling either before those
  phases exist fails loudly with a clear message pointing at why, rather
  than being `undefined` (a confusing crash somewhere else) or silently
  doing nothing (worse — CLAUDE.md § 6: "if the system does not know, it
  says so").
- **`ctx.ask`/`ctx.say` are backed by a real (not fake) stdio
  `Conversation` implementation (`conversation/cli.ts`) for now.** No
  phase's checklist yet wires `core` to `senses/ears`/`senses/voice` over
  IPC — see `docs/BACKLOG.md`'s new Platform entry. This is a real gap in
  the roadmap, not a Phase 5 shortfall: nothing between Phase 1 (built the
  Python voice pipeline with an explicit Phase-1-only stand-in bridge) and
  now names replacing that bridge with a real `core` connection. The
  `Conversation` interface is the seam a future integration phase plugs
  a real implementation into without touching any skill code.
- **`eslint.config.js`'s executor-import rule targets `core/executors/**`,
  a directory that's empty until Phase 6.** Establishing the convention
  and the guardrail now means Phase 6 has enforcement from its first
  commit instead of retrofitting it once there's real code to protect.

**Consequences.**
- Intent routing measured at 100% (15/15) on a live benchmark
  (`bench/bench_skill_routing.ts`) after two real fixes — both found by
  running the benchmark, not by reviewing the manifests. `make new-skill`
  timed at ~111 seconds end to end, including finding and fixing two real
  scaffolder bugs (a URL-encoding bug in `REPO_ROOT` that broke on this
  repo's own non-ASCII path, and a wrong relative-import depth in the
  generated test) — both are exactly what the 30-minute timing exists to
  catch, and did, on the first real run.
- `brief`'s router-phrased output was subtly wrong on its first live run
  (misinterpreted "verbosity is terse" as needing explanation rather than
  relaying it) — via NIM, confirmed healthy at the time, not a degraded
  fallback excuse. Fixed with a one-shot worked example in the phrasing
  prompt, the same lesson Phase 3's lane classifier prompt already
  established: a category description under-specifies the task; a worked
  example closes gaps a description can't anticipate.
- The `core` <-> `senses` IPC gap is now written down (`docs/BACKLOG.md`)
  rather than silently assumed to be someone else's problem later —
  whichever phase (a new one, or folded into an existing one) actually
  makes voice-in-and-out real needs to know this wasn't secretly already
  done.

---

## ADR-020 — core ↔ senses integration, fallback conversation, fact extraction over a graph engine

**Status:** accepted

**Context.** Phase 5's close-out flagged a real gap: no phase's checklist
ever connected `core` (TypeScript — router, memory, skills, Phases 3-5) to
the Python voice pipeline (`senses/ears`, `senses/voice`, Phases 1-2).
`senses/echo_bridge.py` — always documented as a Phase-1-only stand-in —
was still the only thing sitting between them. The owner asked this be
resolved before Phase 6, then, after seeing it run live, asked for a voice
change, a latency investigation, and — the bigger question — whether
JARVIS should "learn" from conversation over time, floating a graph-based
memory engine as a possibility to research.

**Decisions.**
- **`core/main.ts` replaces `senses/echo_bridge.py` outright** (deleted).
  `senses/ipc.py`'s own docstring named this the plan since Phase 1;
  `ears`/`voice` are unaware of the difference — they only know "read from
  my socket" / "write to my socket."
- **`Conversation`'s real implementation (`conversation/ipc.ts`) is
  decoupled from any actual `net.Socket`** — takes a plain
  `sendToVoice(text)` function instead, so its `ask()`/`offerUtterance()`
  queue-and-timeout logic is unit-tested without a real socket. `core/
  main.ts` wires the real socket in; that wiring itself is proven live
  (`make dev` + acoustic loopback), not unit-tested, matching how `senses/
  ears/main.py`/`senses/voice/main.py` are already treated.
- **`core/converse.ts` implements the general-conversation fallback
  docs/SKILLS.md § 3's routing diagram names but Phase 5 never built.**
  Without it, `no_skill_matched` was a dead end — grounded in
  `Memory.recall()` (Phase 4, actually exercised in real use for the
  first time) and voiced through `core/persona.md`, same as any skill.
- **Declined a graph-based memory engine (Graphiti/Zep-style) for
  learning-over-time, after researching it at the owner's explicit
  request.** The production-validated approach (Graphiti, backing Zep)
  requires Neo4j or FalkorDB running alongside it — "at least three
  systems to provision, monitor, and maintain" by its own maintainers'
  framing — plus its own LLM-based extraction pipeline. Real value for
  multi-hop reasoning over large, densely interconnected, often
  multi-user datasets (LongMemEval benchmark: Zep/Graphiti 63.8% vs
  Mem0's 49%, a real gap). Not a good fit for one person's personal facts
  (dozens to a few hundred, mostly flat — preferences, restrictions,
  project details) on an already 8GB-constrained machine. Presented as
  one of three explicit options (simple extraction / graph engine /
  simple-now-graph-later); owner chose simple extraction onto the
  existing Phase 4 `facts` table.
- **`core/factExtraction.ts` runs on every utterance, fire-and-forget,
  never blocking the spoken response** (CLAUDE.md § 7). Confidence is
  deliberately conservative — the system prompt requires 0.8+ only for
  something stated explicitly, and anything the model would score under
  0.5 is instructed to be omitted entirely rather than included low. A
  malformed model response or a provider failure both degrade to "nothing
  learned this turn," never a crash — same "never guessed at" reasoning
  CLAUDE.md § 0.5 already applies to quantities, extended here to facts
  inferred from casual speech rather than explicitly declared.
- **`core/memory/recall.ts`'s semantic search is now bounded
  (`semanticTimeoutMs`, default 1500ms) and best-effort.** Found live: a
  real embedding call took 46.6 seconds under real memory pressure on
  this 8GB machine — confirmed via a raw `curl` to the same endpoint,
  independent of any of this project's code, and confirmed independent of
  embedding model size (`all-minilm`, 45MB, was affected too, ruling out
  "use a smaller model" as the fix). Recall now degrades to recent-turns-
  and-facts-only (both DB-only, no embedding call) rather than blocking
  the whole response — the same "even a degraded one" reasoning SPEC.md
  § 3 already applies to provider fallback, applied here to a single
  slow dependency instead of a whole failed provider. This does not
  cancel the underlying embedding request (`Embedder` has no
  `AbortSignal` in its contract across Phases 3-5); it stops the caller
  waiting on it, which is what actually mattered for the response.
- **Voice changed from `Samantha` to `Daniel`** (male, British) —
  `senses/voice/config.py`'s `SAY_VOICE` default — owner's explicit
  choice after hearing the first live exchange.

**Consequences.**
- The system this project has been building toward — voice in, through a
  real router/memory/skill host, voice out, durably remembered — worked
  end to end for the first time this session, verified not just by a
  planned test but by the owner spontaneously talking to it the moment it
  came online.
- This machine's 8GB ceiling (ADR-001) is now confirmed to affect more
  than just the `converse`-lane provider choice — it can throttle a
  *local* embedding call too, under real concurrent load. Nothing in this
  ADR changes that ceiling; the timeout-based degradation manages its
  symptom in the recall path specifically. Closing background
  applications or a reboot before demanding live sessions remains the
  owner's own lever, not something further code changes here can fix.
- `docs/BACKLOG.md`'s IPC-gap entry (added at Phase 5's close-out) is
  resolved and removed rather than left stale.

---

## ADR-021 — Phase 6 gate: schema placement, key management, in-process approval

**Status:** accepted

**Context.** SPEC.md § 8 and CLAUDE.md § 5 specify the `ApprovalRequest`
lifecycle, capability tiers, single-use nonces, HMAC-signed executor
handoff, and an append-only audit log. Building it meant real decisions
about where its state lives, how its signing key is provisioned, and —
since Phase 7's dashboard doesn't exist yet — how the owner actually
answers a pending approval today.

**Decisions.**
- **`approvals`/`audit_log` live in the same SQLite file `core/memory/
  db.ts` already opens**, not a second database. One `DatabaseSync`
  handle for the whole `core` process; the same reasoning already applied
  to skill-owned tables (`core/skills/store.ts`) applies here.
- **`audit_log` is append-only via `RAISE(ABORT)` triggers**, the same
  mechanism Phase 4 used for `events` — CLAUDE.md § 5's "append-only,
  rejections logged too" is enforced by the database, not convention.
- **The HMAC signing key is self-provisioned into Keychain
  (`jarvis-gate-hmac-key`), not owner-supplied.** Nothing external issues
  it — `core` generates a random 32-byte key on first use and stores it,
  distinct from the owner-supplied `jarvis-nim-key`. `sign()`/`verify()`
  themselves are pure functions taking the key as an argument, directly
  unit-tested (tamper detection, wrong key, determinism); the Keychain I/O
  around them (`getSigningKey()`) is not unit-tested, matching
  `core/router/keychain.ts`'s existing precedent of proving real system
  dependencies live rather than mocking them.
- **Signature comparison is manually timing-safe** (constant-time XOR
  loop over both strings), not a plain `===` — a real, if narrow, timing
  side channel otherwise for a comparison whose entire purpose is proving
  possession of a secret.
- **`decide()` fails closed and logs `rejected` with `reason: "replay"`
  for every non-`pending` case it can be given** — an already-decided
  nonce, a wrong nonce against a right id, or an unknown id entirely —
  rather than trying to distinguish them into separate reasons. SPEC.md
  § 8's own language ("fails closed... logged as a rejection event with
  reason replay") describes the spent-nonce case specifically; the other
  two get the same treatment because the correct response is identical in
  all three: refuse, log, do not honor.
- **No standalone `core/gate/cli.ts` process for answering approvals —
  a stdin reader (`watchApprovalCommands`) running inside `core/main.ts`
  itself instead.** `Gate.propose()`'s pending state is a `Promise`
  resolver held in the `Gate` instance's own memory (the `pending` map),
  tied to one running process. A separate CLI invocation writing directly
  to the `approvals` table would change a row nothing is listening to —
  the skill's `await ctx.propose()` would never resolve. Caught while
  designing the CLI, before writing the broken version, not after.
  `shared/types.ts`'s `approval.decide` client event already anticipates
  a real WebSocket-based equivalent once Phase 7 builds a dashboard; this
  is the boring, no-new-infrastructure stand-in until then — same
  relationship Phase 5's `conversation/cli.ts` has to real voice I/O.
- **`markExecuted()` (the `approved -> executed` leg) is built and
  tested now, even though `core/executors/` is still empty (Phase 12+).**
  Completes the state machine SPEC.md § 8 actually describes rather than
  stopping short of it; a future executor calls one already-tested method
  rather than the gate needing new behavior designed alongside the first
  real executor.

**Consequences.**
- All five DoD checks pass, most confirmed live against a real
  Keychain-backed signing key and a real SQLite audit log, not only
  against fakes: blocking-until-answered, replay rejection, expiry
  (both the real-timer and clock-skew paths), green-tier auto-run with
  logging, and `brief` unchanged (5/5 of its own tests still pass — it
  never calls `ctx.propose`, `MEMORY_READ` being green-tier only).
- Every future skill that declares a yellow-tier capability is
  answerable today, via the terminal `make dev` runs in, without waiting
  for Phase 7 — the gate is real and usable, not just internally
  consistent.
- `core/gate/cli.ts` is explicitly a stand-in, documented as such in its
  own file — whoever builds Phase 7's WebSocket server should read it
  first to see exactly what `ClientEvent`'s `approval.decide` needs to
  reproduce.

---

## ADR-022 — Phase 7 dashboard: WS/HTTP split, ui/ as a separate project, live verification without the MCP Playwright tool

**Status:** accepted

**Context.** ROADMAP.md's Phase 7 asks for a Next.js + shadcn/ui dashboard
talking to `core` over WebSocket: an approval queue, a live thought
stream, transcript, camera indicator, a timeline over `events`, and a
skill health panel, with a DoD that requires the approval lifecycle to
actually work from a browser (approve executes, survives a browser
close, two tabs stay in sync) and a grep proving the dashboard never
imports an executor. `core/gate/cli.ts`'s stand-in (Phase 6) already
anticipated this by name.

**Decisions.**
- **One `node:http` server carries both the historical REST endpoints
  (`/api/events`, `/api/skills`, `/api/approvals`) and the WebSocket
  upgrade (`ws` package, `core/ws.ts`), on one port
  (`JARVIS_DASHBOARD_PORT`, default 8787).** `ServerEvent`'s live channel
  is deliberately push-only (SPEC.md never describes a WS replay/history
  message) — a freshly opened tab needs a real backfill, not a hope that
  it connected before anything happened. This is also what makes "close
  the browser mid-approval, still pending on reopen" true: the pending
  approval comes back from `GET /api/approvals` (a new `Gate.
  listPendingRequests()`, wire-mapping the existing private `ApprovalRow`
  via the already-written `rowToRequest`), not from a WS event that
  already fired before the tab existed.
- **`Gate` extends `EventEmitter`, emitting `"approval.new"` and
  `"approval.resolved"`.** `core/ws.ts` just subscribes and re-broadcasts
  as `ServerEvent`s — the gate's own lifecycle (Phase 6) is still the only
  place state actually changes; the dashboard hears about transitions, it
  never causes one except by relaying `ClientEvent`'s `approval.decide`
  straight into `gate.decide()` (SPEC.md § 8: "the dashboard is a view,
  never an authority" — literally true here, `core/ws.ts` contains no
  approval logic of its own).
- **`shared/types.ts`'s `transcript` `ServerEvent` gained a `speaker:
  "owner" | "jarvis"` field.** The original shape (`{text, final}`) had
  no way to tell the two halves of a conversation apart in the dashboard
  — a real gap noticed while wiring `core/main.ts`'s dispatch loop to
  actually broadcast both the heard utterance and the spoken reply, not
  a speculative addition. `shared/types.ts` is the contract specifically
  so a gap like this gets fixed in one place instead of worked around in
  the client.
- **The "thought" stream is `SkillRoutingTrace` (already computed by
  `core/skills/dispatch.ts`, previously discarded), not a new model
  call.** It reports what actually happened — the lane, which skill/intent
  was chosen or that none matched, whether disambiguation ran — rather
  than fabricating a narration of "thinking" the system didn't do
  (CLAUDE.md § 6: no confident-sounding invented content). A live
  `RouterTrace` stream (`ServerEvent`'s `trace` variant, already typed)
  is left for later — it needs `core/router/router.ts` itself
  instrumented with a callback, real additional work outside a
  reasonable Phase 7 scope, not required by this phase's own DoD.
- **`ui/` is its own Next.js project — own `package.json`, own
  `tsconfig.json`, own ESLint config — not a workspace package importing
  `core/`.** It never sees `core/`'s filesystem at all except through the
  wire; `ui/src/lib/types.ts` hand-mirrors the subset of `shared/types.ts`
  the dashboard actually consumes (`shared/types.ts`'s own docstring names
  a `make types` codegen step for Python that was never built either —
  logged in `docs/BACKLOG.md`, not invented now under phase pressure).
  `ui/eslint.config.mjs` carries its own copy of the root
  `no-restricted-imports` executor rule for the same reason — a separate
  npm project needs its own enforcement, it doesn't inherit the root
  config.
- **Visual language taken from the Figma export
  (`~/Developer/Programação/JARVIS Desktop Interface Design`) as a
  reference only, not adapted in place** — it's a Vite + React 19 +
  Tailwind 4 static mockup (dark theme, cyan/amber palette, JetBrains
  Mono, corner-bracketed panels, an animated dot-ring orb), with no
  shadcn/ui, no WebSocket, no approval queue, timeline, or skill health.
  ROADMAP.md asks for Next.js specifically; the actual dashboard was
  scaffolded fresh with `create-next-app` + `shadcn@latest init` and the
  palette/typography/panel-bracket language carried over into
  `ui/src/app/globals.css` and `ui/src/components/panel.tsx`, not the
  mockup's own component code (untyped, no live data, built for a
  different framework).
- **Live DoD verification used Playwright as a `ui/` devDependency
  driving a real headless Chromium against the real running `core`
  process, not the MCP Playwright tool** — it wasn't available in this
  session (checked via tool search, absent). Since no skill yet declares
  a yellow-tier capability and calls `ctx.propose()` in a real dispatch
  (nothing needs `FS_WRITE`/`SHELL_EXEC` yet), a pending approval was
  injected the same way `core/gate/tests/gate.test.ts` does it: a second
  `Gate` instance over the *same* SQLite file the running `core` process
  has open, using the same self-provisioned Keychain signing key. The
  first version of this check made a real mistake worth recording: it
  `await`ed the injecting `Gate` instance's own `propose()` promise after
  clicking Approve in the browser — that promise belongs to a `pending`
  map in a *different* process than the one whose `decide()` actually
  runs when the browser sends `approval.decide`, so it can never resolve.
  This is the exact cross-process pitfall ADR-021 already named when
  ruling out a standalone `gate/cli.ts` process. Fixed by asserting
  through the shared SQLite state instead (the `approvals` row's `state`
  column, the `audit_log`'s `approved` entry) — the same DB both `Gate`
  instances read and write, which is the actual channel Approve-in-a-
  browser and a future executor would ever agree on.

**Consequences.**
- All four DoD checks verified live, against the real `core` process (not
  fakes): a fresh tab backfills a pending approval created before it
  opened; closing that tab leaves the DB row `pending`; approving from a
  second tab produces a real `audit_log` "approved" entry from the
  *running* `core`'s own `Gate`; a third, never-clicked tab loses the
  request from its view at the same moment via its own WS connection.
  Screenshots captured at each step. `grep -rn executors ui/src` returns
  nothing.
- `137` TypeScript tests + `20` Python tests, `make check` green,
  `next build` and `next lint` (via `ui/`'s own `npm run build` /
  `eslint`) both clean.
- The `trace` `ServerEvent` variant and a live camera-armed indicator
  both stay unwired — honest gaps, not oversights: `RouterTrace`
  broadcasting needs router instrumentation Phase 7's DoD doesn't ask
  for, and the camera indicator has nothing live to show until Phase 8
  builds the actual session lifecycle. The dashboard renders `CAMERA:
  IDLE` as a static label until then.

---

## ADR-023 — SOAK 1: live JARVIS state, honest error reporting, Orb ported from the owner's Figma design

**Status:** accepted

**Context.** Real SOAK 1 use (`data/jarvis.db`'s first real conversation
log) surfaced two problems ADR-022's Phase 7 build didn't cover: (1)
`converse` confidently claimed to be doing things it can't do (see the
`fix:` commit the same day — `persona.md` + `generalConversationReply`),
and (2) the owner had no way to watch a request actually move through
the system, or learn about a failure, other than trusting whatever
JARVIS said out loud. Asked directly for both: real-time visibility into
work happening, and errors reported plainly. Also asked for the
dashboard to actually resemble the Figma reference
(`~/Developer/Programação/JARVIS Desktop Interface Design`) rather than
Phase 7's function-over-decoration scope cut (ADR-022's own tradeoff).

**Decisions.**
- **Every new signal traces to something real, not a synthesized
  "progress" animation.** `senses/ears/main.py` emits `{"type":
  "listening"}` at the instant `arm()` is called -- the mic is actually
  recording. `senses/voice/main.py` emits `{"type": "speaking",
  "active": true/false}` bracketing `speak_text()` -- `SayBackend.speak`
  already blocks for the real audio duration (its own docstring says
  so), so `active: false` means audio genuinely finished, not a fixed
  delay standing in for one. `core/main.ts` adds a `"thinking"` state
  for the span between an utterance landing and the turn finishing --
  the one state core can honestly claim without a signal from `senses`.
  No `"listening"` -> `"speaking"` shortcut was faked for states core
  doesn't actually witness.
- **`shared/types.ts` gained `JarvisState` (`idle | listening |
  thinking`) and two `ServerEvent` variants, `state` and `error`.**
  `speaking` already existed (typed in Phase 7, unwired until now) and
  is kept separate from `JarvisState` rather than folded in -- it's a
  more specific, independently-arriving fact from a different process
  (`voice`, not `ears`), and the dashboard's `orbState` derivation
  layers it on top (`speaking.active ? "speaking" : state`) rather than
  the two fighting over one field.
- **A turn that throws now broadcasts `{"type":"error",...}` and speaks
  an honest fallback, not just a server-side `console.error`.** Found
  live while auditing the existing catch block: it was a genuinely
  silent failure before -- the owner would hear nothing at all and have
  no way to know a turn had failed. CLAUDE.md § 6's honesty rule doesn't
  stop at logs the owner never reads.
- **The Orb is ported near-verbatim from the Figma file's own SVG
  dot-ring math** (radius/count/opacity/phase per ring), not
  reimplemented from scratch -- it's pure, framework-agnostic geometry,
  and matching the owner's actual design beats approximating it. The
  only real change is the data source: a live `OrbState` from
  `useJarvis()` instead of a hardcoded `useState("READY")`.
- **Grid background, scanline, and corner annotations restored** from
  the Figma reference -- pure decoration, not a capability claim, so
  keeping them close to the owner's own design is honoring intent, not
  the kind of overclaiming CLAUDE.md § 6 is about.
- **Transcript backfills from `/api/events` on mount, same as
  Timeline.** Found live in the same session: reopening the dashboard
  after real conversation showed "waiting for the first utterance" with
  history sitting right there in the DB. Same fix pattern Phase 7
  already used for the approval queue.

**Consequences.**
- Full live sequence verified end to end, real timestamps, on an
  isolated instance (not the owner's running session): `listening ->
  transcript(owner) -> thinking -> thought -> transcript(jarvis) -> idle
  -> speaking:true -> speaking:false`. Screenshotted at each state.
- 139 TS tests + 22 Python tests (2 new -- `voice`'s speaking-active
  bracketing, `ears`' listening-on-arm), `make check` green end to end.
- One existing Python test (`test_run_forever_continues_after_one_bad_
  message`) needed a real fix, not a workaround: it fully closed one end
  of a `socketpair`, which used to be harmless (nothing was ever written
  back) but now made `voice`'s own new status sends hit a broken pipe.
  Fixed with a half-close (`SHUT_WR`) instead -- closer to what a real
  core disconnect looks like, and the case the test already existed to
  cover (a bad `say` call, not a broken connection) stayed intact.
- The owner's already-running `make dev` session (started before this
  work) is on the old code and won't show any of this until restarted --
  flagged, not restarted automatically out from under a live session.

---

## ADR-024 — SOAK 1: the gate gets a real executor, five real skills, and two bugs the loading path never exercised before now

**Status:** accepted

**Context.** Asked directly (2026-08-04) to make JARVIS "actually do
things," not just talk: task/shopping lists, real weather, real system
metrics, and opening apps/projects hands-free. Building any of the
write-capable ones exposed that `MEMORY_WRITE`'s whole approval pipeline
was hollow -- SPEC.md already says "only executors invoked *by the gate*
cause side effects," but `core/executors/` had never had a real one
(ADR-021/022 both note this as Phase 12+). An approved `MEMORY_WRITE`
proposal resolved with a signed execution and nothing ever consumed it.

**Decisions.**
- **`Gate` takes an `executors: Partial<Record<Capability, Executor>>`
  map in its constructor and calls the matching one itself, inside
  `decide()`, on approval** -- not the skill (can't, ESLint blocks the
  import) and not a separate polling process (`markExecuted()`'s
  original pull-model design, kept for capabilities with nothing
  registered). `decide()` became `async` to allow awaiting the executor
  before resolving `propose()`'s promise -- the docs' own nutrition
  example already treated `outcome.ok` as "did it happen," which was
  never actually true until now. A capability with nothing registered
  behaves exactly as before (stops at `approved`) -- fully backward
  compatible, all 13 pre-existing gate tests unchanged.
- **A failed executor keeps the approval's state at `approved`, not
  `rejected` or `expired`.** The owner's decision was real; only the
  execution itself failed -- a different fact, logged separately
  (`execution_failed` in the audit log) and reported honestly
  (`{ok:false, reason:"error", detail}`) rather than a false success.
- **`core/executors/apps.ts`: `open -a <App> [path]` via `execFile`,
  never a shell.** `open` is a narrow macOS launcher, not an
  interpreter -- no injection surface regardless of what the `app`/
  `path` strings contain, since `execFile` never concatenates them into
  a shell string. Verified live: proposing, approving, and watching a
  real `Calculator.app` process actually launch (pid confirmed, then
  closed).
- **`core/executors/memory.ts`: `MEMORY_WRITE` finally has an
  executor.** Closes the gap named above -- `skills/weather` is the
  first real caller (remembering the owner's city).
- **Skill-private, low-stakes, frequently-changing data (`tasks`,
  `shopping_list`) uses `ctx.store`, not `ctx.propose({capability:
  "MEMORY_WRITE"})`.** These aren't durable facts about the owner in the
  `events`/`facts` sense (SPEC.md § 4) -- they're a skill's own list,
  matching docs/SKILLS.md § 1's "a skill owns its tables" reasoning
  directly. No gate, no approval friction for adding milk to a list.
- **Skill ids must be underscore, not hyphen, if the skill uses
  `ctx.store`.** Found live: `shopping-list` (as first written) broke
  its own namespace check -- `skill_shopping-list_` isn't a valid
  unquoted SQL identifier, so `assertNamespaced` could never match it
  against itself. Renamed `shopping-list` → `shopping_list` and, for
  consistency (not because it was broken yet), `system-health` →
  `system_health` too, before either shipped.
- **`SkillRegistry.loadAll` takes a `(skillId: string) => SkillInitContext`
  factory, not one fixed `SkillInitContext`.** A skill's own id -- and
  therefore its `ctx.store` namespace -- isn't known until *after* its
  module is imported, inside `loadSkill`. The old fixed-object signature
  structurally could not give two different skills two different
  stores. Found live: `core/main.ts` had shipped `store: undefined as
  never` since Phase 5 (an `as never` cast hiding exactly this gap) --
  harmless while no skill's `init()` touched `ctx.store`, a hard crash
  the moment one did (`tasks`, `shopping_list`, both disabled with
  "Cannot read properties of undefined" on first real load). Fixed in
  `loader.ts`, `registry.ts`, `core/main.ts`, and `bench/
  bench_skill_routing.ts` (same bug, same fix).
- **`laneClassifier.ts` gained a new few-shot example** after live
  routing showed "how's my computer doing" landing on `see` (misread as
  "look at a physical thing") and "check system health" landing on
  `reason` -- `system_health`'s `converse`-lane candidates never entered
  the pool regardless of embedding score, since dispatch filters by lane
  first. One clarifying contrast ("check my wiring" needs eyes, "check
  my cpu usage" needs none) fixed all five phrasings tested and *raised*
  the full 45-case benchmark from 93.3% to 97.8% -- the fix generalized
  rather than overfitting to the new skill's exact wording.
- **`skills/weather` and `skills/launcher` export a `create*Skill(deps)`
  factory alongside the plain `skill` the loader imports** -- the same
  reasoning `core/router/providers/ollama.ts`'s injectable `fetchFn`
  already established, applied one level up: tests construct an
  isolated instance with fake `geocode`/`fetchCurrentWeather`/
  `listProjectDirs` instead of a fragile attempt to mutate an ES module
  namespace object (tried first, doesn't work -- namespace object
  properties are read-only from the importer's side).

**Consequences.**
- Five new skills, all real, no placeholders: `system_health` (CPU/mem/
  disk from `node:os`/`node:fs`, zero capabilities needed), `weather`
  (Open-Meteo, free, no key), `tasks` and `shopping_list` (`ctx.store`
  CRUD), `launcher` (list/open real project directories, open any app,
  through the gate).
- `core/http.ts` gained `/api/system`; the dashboard's LEFT column
  gained a real `SystemStatus` panel (CPU/mem/disk bars, real numbers,
  5s poll) -- the exact thing `converse` had previously hallucinated
  being able to build, now actually built, closing that loop.
- 183 TS tests (up from 139), all passing, `make check` green end to
  end including `ui/`'s build. Verified live beyond unit tests: a real
  `Calculator.app` launch through the full propose → approve → execute
  path; real Open-Meteo calls; a real directory listing of the owner's
  actual `~/Developer/Programação` projects; the lane-classifier fix
  confirmed against the full 45-case benchmark, not just the new
  phrasings that motivated it.
- The "voice-authored Cursor prompt, owner still presses send" idea and
  several smaller executor-backed skills (music, browser, system
  controls) are logged in `docs/BACKLOG.md`, not built -- real future
  scope, each needing its own small executor following the pattern this
  ADR establishes, not built speculatively ahead of being asked for.

---

## ADR-025 — SOAK 1: `SHELL_EXEC` becomes a real dispatcher (media, browser, volume, brightness)

**Status:** accepted

**Context.** Asked directly to add the three ideas named as backlog
candidates in ADR-024: music control, opening URLs, volume/brightness.
`Gate.executors` holds exactly one `Executor` per `Capability`
(ADR-024) -- `SHELL_EXEC` already had one, `apps.ts`'s `openApp`, wired
directly. Three more action types needed a real design decision: more
capabilities, or one capability that knows how to do more things.

**Decisions.**
- **One `SHELL_EXEC` executor, `core/executors/shell.ts`, dispatches by
  `payload.action` to the real per-action module** (`apps.ts`,
  `browser.ts`, `media.ts`, `systemControls.ts`) -- not a new capability
  per action. `Capability` is a closed, deliberately small union
  (`shared/types.ts`'s own comment: "adding one here is a security
  decision") -- growing it for every new *kind* of local action would
  make it not-small fast, when what actually varies is the payload
  shape, not the tier of risk (every one of these is a real local side
  effect, correctly yellow). `core/main.ts` registers `SHELL_EXEC:
  runShellAction` once; adding an action is a new module plus one
  `case`, not a new capability plus a new gate wire-up.
- **Every new executor still never touches a shell.** `browser.ts`'s
  `open <url>` (`execFile`, args as an array) only accepts `http`/
  `https` schemes -- `URL`'s own parsing rejects `javascript:`/`file:`/
  garbage outright, for free. `media.ts`'s `osascript -e <script>` never
  builds the script from raw text: `payload.command` is validated
  against a small enum first, and the actual AppleScript string always
  comes from a fixed, hardcoded map keyed by that enum -- the model
  picks a command name, never a script.
- **Volume uses a real, reliable, built-in AppleScript command
  (`set volume output volume N`).** Brightness has no equivalent --
  rather than a hardware key-code simulation of uncertain reliability
  across keyboards/external displays (never verified live: it would
  mean changing the owner's actual screen brightness to test, with no
  confidence the specific key codes are even right for this hardware),
  `set_brightness` shells out to the free, well-known `brightness` CLI
  (github.com/nriley/brightness) and, if it isn't installed, says so
  plainly (`brew install brightness`) instead of a silent no-op or an
  unverified guess. Confirmed not installed on this machine as of
  2026-08-04 -- an honest gap, not a hidden one.
- **`now_playing` (media skill) is a direct read, no `ctx.propose` at
  all** -- same precedent as `system_health`'s OS reads and `weather`'s
  own `fetch()` calls: a query with zero side effect doesn't need the
  gate, only a change does. `play`/`pause`/`next`/`previous` do, since
  they're real actions with an audible effect the owner might not
  expect.
- **`open_url` folded into `skills/launcher`** (it's still "open X,"
  same shape as opening an app or a project) rather than a new skill;
  music/volume/brightness became a new `skills/media` (a different verb
  -- "control X" -- and a natural place for `now_playing` to live next
  to the things that change what's playing).

**Consequences.**
- Verified live: a real system volume change (63 -> 40, confirmed via
  `osascript`, restored after) through the full propose -> approve ->
  real-executor path; a real `https://example.com` tab opened the same
  way; `now_playing` correctly reported "nothing seems to be playing"
  against the real, not-running Music.app, no hallucinated track name.
  Deliberately did *not* live-test `play` -- unlike Calculator or a
  browser tab, starting audio unexpectedly is a more intrusive surprise
  than this round of live-testing needed to risk; unit coverage (10/10
  in `skills/media`) already proves the right AppleScript command gets
  built.
- 210 tests total (up from 183), `make check` green end to end.
- Remaining backlog ideas (real macOS Reminders/Calendar instead of
  `tasks`'s private table, the "voice-authored Cursor prompt, owner
  still sends" idea) stay logged, not built -- not asked for this round.

---

## ADR-026 — SOAK 1: real routing bugs found by reading the actual conversation log, and a Whisper vocabulary fix

**Status:** accepted

**Context.** Asked directly to read `data/jarvis.db`'s real conversation
history and find out what's actually broken, not just what unit tests
say. It found four real, live bugs across three different layers --
lane classification, embedding-match example collisions, and STT
vocabulary -- none of which any existing test caught, because all four
depend on real phrasing/real speech, not fixture data.

**Decisions.**
- **`launcher`/`media`'s action intents declare multiple lanes
  (`converse` + `act`, or `converse` + `act` + `reflex`), not `converse`
  alone.** Live: "Can you open Facebook?" classified as `act`; "pause
  the music" and "set the volume to 50" classified as `reflex`; "play
  music" as `act`. None of these are classifier mistakes exactly --
  `act`'s own definition ("running commands") and `reflex`'s
  ("trivial, instant... turning the camera on or off") both genuinely
  fit "open an app" / "control playback" about as well as `converse`
  does. Declaring every lane real phrasing lands on (same fix Phase 5's
  `wardrobe` already used for its own ambiguity) is more robust than
  trying to argue the classifier into a single "correct" reading of an
  inherently multi-interpretable request.
- **A lane-classifier prompt fix was tried for `now_playing` ("what's
  playing" landing on `see`), then reverted in favor of a manifest-only
  fix.** The prompt example worked in isolation (confirmed) but
  regressed three *unrelated* cases on the full 45-case benchmark
  (97.8% -> 91.1%, confirmed clean, no network noise in that run) --
  few-shot prompt examples have non-local effects on a shared
  classifier, discovered directly rather than assumed. Declaring `see`
  as an *additional* lane on `now_playing` (alongside `converse`) fixes
  the same routing gap without touching the prompt every other case in
  the system also depends on. Worth naming as a general lesson: prefer
  a manifest-lane fix over a shared-prompt fix when the shared prompt
  isn't obviously, unambiguously wrong.
- **`shopping_list`'s examples no longer use "coffee."** Both
  `add_item` ("we're out of coffee") and `remove_item` ("got the
  coffee") used it, and any real utterance mentioning coffee for an
  unrelated reason -- live: "remind me to drink coffee at 9am," a
  `tasks` request -- embedded closer to `shopping_list` than to
  `tasks`' own matching example, misrouting across skills entirely.
  Swapped to "butter." Not a coffee-specific problem: whatever word an
  example uses becomes a magnet for anything else that happens to
  mention it, worth remembering for future manifests.
- **Extraction helpers in `tasks`/`shopping_list`/`launcher` now strip
  trailing punctuation from what the model returns.** Live: "Added:
  drink coffee at 9am.." (double period) -- the model's extracted text
  already ends in "." and this project's own `Added: ${text}.` wrapping
  added a second one. Small, but a real, visible rough edge.
- **`senses/ears`'s Whisper STT gets a vocabulary hint
  (`WHISPER_INITIAL_PROMPT`, `--prompt` + `--carry-initial-prompt`), not
  a model swap.** The original, real bug (first conversation of this
  SOAK): "Ponta Delgada, Açores" transcribed as "Ponta del Gada, Zoris"
  by `small.en` (English-only, per ADR-003's deliberate choice for
  speed). Downloaded and tested the multilingual `small` model side by
  side first -- results were inconclusive-to-worse across two different
  synthetic-voice tests (an English voice attempting the Portuguese
  phrase, and a genuine Portuguese-accented voice reading the whole
  English sentence, which broke *both* models equally badly via
  hallucination, a known small-Whisper failure mode on heavily accented
  input). Not a safe basis to swap the model ADR-003 chose deliberately
  for measured speed. `--prompt "Ponta Delgada, Açores, Portugal"` (the
  one place name actually seen live) tested cleanly instead: same
  model, same speed, the exact phrase transcribed correctly including
  the diacritic, confirmed unaffected on repeated plain-English calls
  after it (`--carry-initial-prompt` -- without it, the hint only
  applies to a whisper-server's first request ever, useless for a
  long-lived daemon serving many utterances). CLAUDE.md § 0.1 governs
  the *deliverable* (code, docs, TTS output, wake word) staying
  English; accurately hearing a real proper noun that has no English
  spelling isn't "adding Portuguese" to any of those, it's correctly
  capturing what was actually said. `JARVIS_WHISPER_PROMPT` env-
  overridable so more names can be added from real use without a code
  change.
- **`make dev` now unloads the installed `ears` LaunchAgent
  automatically at start and reloads it on exit.** Docs/BACKLOG.md
  already named this socket conflict once (2026-08-04); it recurred a
  second time in this same session (Pedro's own `make dev` restart hit
  it) -- a "remember to unload it first" comment clearly wasn't going to
  stick, so `Makefile`'s `dev` target does it automatically instead,
  checked via `launchctl list` first so it's a no-op when the daemon
  isn't installed at all. Verified live: unloads cleanly at start,
  reloads on `SIGTERM`/Ctrl+C, confirmed via a real `ps`/`launchctl
  list` check before and after, not just reading the recipe.

**Consequences.**
- Verified live: "Can you open Facebook?", "what's playing", and
  "remind me to drink coffee at 9am" all route to the correct skill now
  (confirmed via the real dispatch pipeline on an isolated instance,
  not just lane/embedding checks in isolation) -- the first two
  previously fell through to `converse`'s general-reply fallback, which
  then either denied a real capability or (for the coffee case) landed
  in the wrong skill entirely.
- Lane benchmark holds at 97.8% (`bench/bench_router_lane.ts`) after
  the revert -- confirmed clean twice, no regression carried forward.
- 211 tests (up one: a regression test for the trailing-punctuation
  fix), `make check` green end to end.
- The multilingual Whisper model (`ggml-small-q5_1.bin`, ~190MB,
  gitignored like the others) stays on disk -- downloaded, tested,
  didn't win, but costs nothing to leave in case a future real-voice
  test (owner-required, not something synthetic TTS can substitute for)
  says otherwise.
- STT accuracy on Portuguese proper nouns beyond the one tested is
  still genuinely unverified against Pedro's real voice/accent --
  logged as an owner-required check, same category as Phase 1's
  original word-accuracy waiver.

---

## ADR-027 — SOAK 1: fact extraction bypassed the gate entirely -- the real root cause behind ADR-026's routing bugs

**Status:** accepted

**Context.** Continuing the same real-conversation-log investigation
(ADR-026), a garbled answer ("weather: tomorrow's weather", spoken as
a real response to "can you tell me the weather for tomorrow") turned
out to have a concrete, findable cause: `data/jarvis.db`'s `facts`
table had a row literally keyed `weather`, valued `tomorrow's
weather`, confidence 1.0 -- `converse`'s general-reply fallback
recalled it as a known fact and repeated it verbatim. 23 facts total
were in that table, most of them nonsense (`skills.create: true`,
`abilities.musical: whistle`, `skills.self.description: personal
assistant` -- the model describing *itself*, not the owner -- even the
extraction prompt's own schema text echoed back as a "fact"). None of
this went through review, ever: `core/factExtraction.ts` called
`memory.upsertFact()` directly, on every utterance, since it was built
in Phase 5b -- a full phase before Phase 6's gate existed to catch
exactly this.

**Decisions.**
- **`extractAndRememberFacts` proposes to the gate now
  (`MEMORY_WRITE`, `core/executors/memory.ts`), never writes memory
  directly.** CLAUDE.md § 5 doesn't carve out an exception for
  "background" or "automatic" writes -- "nothing performs a side-
  effecting action without an approval recorded in the audit log
  first" is unconditional. This was a real, load-bearing gap the whole
  time, just never exercised in a way that surfaced until real,
  extended conversation gave the extractor enough rope to produce
  something actively wrong.
- **Still fire-and-forget, still zero latency added to the spoken
  response** (CLAUDE.md § 7) -- `core/main.ts` never awaits this
  function's own promise, and `extractAndRememberFacts` itself only
  awaits the *extraction* call (the model deciding what facts exist),
  not each fact's approval. A pending `MEMORY_WRITE` just accumulates
  in the dashboard's approval queue for review instead of mutating
  memory unreviewed. Approval-fatigue is a real tradeoff worth
  watching during the rest of the soak, not free -- but a silently
  self-corrupting memory is a worse one, demonstrated live.
- **The extraction prompt gained explicit counter-examples** for the
  three failure patterns actually observed: a request to the assistant
  is not a fact about the owner ("can you create a skill" -> no fact,
  not "skills.create: true"); a task/reminder/shopping item belongs to
  its own skill, not memory ("remind me to drink coffee" -> no fact);
  and never invent a fact keyed by the topic of a question ("what's
  the weather tomorrow" -> no fact, not one keyed `weather`). Written
  from the real garbage found, not guessed at in the abstract.
- **All 23 existing facts deleted from the real production DB**, not
  curated down to "the ones that happen to look right." A couple
  (`work.schedule: 9:30-12`, `prefs.coffee.time: 9am`) plausibly
  correspond to something Pedro actually said -- but they were never
  reviewed either, just accidentally correct output from a broken,
  unreviewed pipeline. Clean slate is more honest than presenting
  survivors of a process that was never trustworthy in the first
  place; every fact from here on gets a real approval.

**Consequences.**
- The specific "weather: tomorrow's weather" bug cannot recur in this
  form -- there is no longer any path from model output to stored fact
  that skips the owner.
- 9 new/updated tests in `core/tests/factExtraction.test.ts` (a real
  one caught live while writing them: a test using a fabricated
  `sourceEventId` hit a genuine `FOREIGN KEY constraint failed` inside
  the executor -- `facts.source_event REFERENCES events(id)`, same
  gotcha this project's own history already names once, from Phase
  5b -- fixed by using a real `memory.appendEvent()` id, not the code).
  213 tests total, `make check` green.
- The dashboard's approval queue will now show a `fact-extraction`
  entry after ordinary conversation, not just skill-driven proposals
  like `launcher`'s -- expected, not a bug; worth watching whether the
  volume becomes annoying during the rest of the soak, in which case
  the extraction prompt (not the gate) is what needs tightening
  further.

## ADR-028 — SOAK 1: Playwright dashboard verification, Thought Stream / Error Log backfill fix, and a live-reproduced lane-classifier reliability gap under NIM outage

**Status:** accepted

**Context.** Asked directly to test more rigorously and verify, with
Playwright, that the dashboard actually shows everything the project
has discussed building -- not a spot check, a genuine pass "as if you
were me [the owner]." Built a fresh isolated instance (scripted fake
`ears` feeding real reported phrasing plus enough variety to touch all
8 loaded skills, a scratch DB, `core` and `ui` on scratch ports) and
drove the real running dashboard with Playwright: transcript, skill
health, approval queue, approve/reject round-trip (verified against
`audit_log`, not just the UI removing a row), system status, Orb,
console errors.

**Finding 1 — Thought Stream and Error Log never backfilled.** A fresh
tab showed "No routing activity yet." and an empty error log even
seconds after real routing decisions and a real error had already
happened server-side. `core/ws.ts`'s own docstring already names the
reason: the live WS channel is push-only, no replay -- a fresh tab
needs a REST snapshot first. That snapshot existed for Transcript
(ADR-023), Approvals, and Events, but was never built for these two
panels when they were added, so they silently only ever showed
"since this tab opened."

**Decision 1.** New `core/dashboardHistory.ts`: a small in-process ring
buffer (50 thoughts, 20 errors -- the same caps `use-jarvis.ts` already
applies client-side to live events), populated at the same two call
sites in `core/main.ts` that already broadcast these over WS. Two new
read-only endpoints, `GET /api/thoughts` / `GET /api/errors`
(`core/http.ts`). `use-jarvis.ts` fetches both on mount and seeds
`thoughts`/`errors` state, same pattern as transcript/approvals.
Deliberately **not** stored in the `events` table `Memory.recall()`
reads from -- routing telemetry and error text are not conversation,
and ADR-026/ADR-027 already show a weak fallback model copying
recalled text verbatim into what it says out loud; keeping this buffer
isolated from recall closes that risk off entirely rather than trusting
prompt wording to avoid it. Verified live: reloaded the tab after real
activity, both panels populated immediately.

**Finding 2 — a real, live-reproduced reliability gap, not fixed this
session.** While running the Playwright pass, a direct `curl` to the
NIM endpoint timed out at 10s -- NIM was genuinely unreachable, the
same failure the owner's own pasted transcript showed for "Can you
open Facebook?" (not a one-off; ADR-026 already flagged this as worth
investigating further). With NIM down, every `converse`-lane call --
including lane classification itself, which runs on the `converse`
lane (`laneClassifier.ts`) -- fell through to the local `qwen2.5:0.5b`
fallback (ADR-001's accepted "degraded but functional" fallback).
Live evidence this session: that fallback frequently misclassified
plainly non-visual utterances ("add butter to the shopping list",
"Can you open Facebook?") as lane `see`, so `dispatch` filtered out
the correct skill before scoring ever ran -- not a low-confidence
miss, a wrong-lane miss. The same fallback also echoed raw
recalled-memory text (formatted `[owner] ...\n[jarvis] ...`) verbatim
as a spoken answer on one turn, and fact extraction on it produced
mostly garbage (5 of 6 extracted facts nonsense, including literally
extracting the extraction prompt's own placeholder syntax
`project.<name>.status` as if it were a real key) -- all safely caught
as pending approvals rather than corrupting memory, which is direct
live confirmation that ADR-027's gate fix holds up under exactly the
failure mode it exists for.

**Decision 2 — not fixed, logged instead.** The root cause here is
NIM availability plus this machine's own demonstrated resource
pressure (98% RAM / 100% CPU with the full stack running, previously
documented in Phase 5b and again in ADR-026), not a bug in any single
file. `qwen2.5:0.5b` was accepted (ADR-001) as an honest degraded
fallback for *conversation quality* -- nobody had separately verified
it for *lane classification accuracy*, and live evidence now says it
is not reliable at that specific task. Candidate real fixes (a
non-LLM heuristic fallback for lane classification, retry/backoff
before falling back, a slightly larger but still-viable local model)
are each a real design question, not a same-session patch -- logged
in `docs/BACKLOG.md` rather than guessed at under time pressure.

**Consequences.**
- Two real dashboard gaps closed and verified live: Thought Stream and
  Error Log now show real history on a fresh tab, not just live
  events. `npx tsc --noEmit` clean in both `core` and `ui`, `make
  check` green, 213 tests (no new test file for `dashboardHistory.ts`
  -- a plain ring buffer, exercised live via the Playwright pass; add
  unit coverage if it grows any real logic).
- Approve/reject confirmed correct end-to-end against `audit_log`
  during this pass (the Playwright script's own first check of
  "approved" state came back empty because `Gate.decide()` advances
  a `MEMORY_WRITE` approval straight through to `executed` -- a false
  negative in the test script, not a bug in the app; confirmed by
  reading `audit_log` directly).
- The lane-classifier-under-fallback finding is real, reproduced, and
  currently open -- likely explains several of the routing failures in
  the owner's own pasted transcript beyond the two ADR-026 already
  fixed. Not treated as urgent-and-silent: written up here and in
  `docs/BACKLOG.md` so it doesn't need rediscovering the hard way
  again, per CLAUDE.md § 0.7.

## ADR-029 — SOAK 1: five dashboard features built for real usage data (test console, feedback, live Tasks/Shopping panels, metrics)

**Status:** accepted

**Context.** Asked directly (2026-08-04) to brainstorm dashboard
features that would make real activity visible when talking to JARVIS
during the SOAK -- specifically wanting to see CRUD happening in the
dashboard itself, and more real test data to drive future improvements.
Five ideas were proposed and, on approval, all five were built the same
session so testing could start immediately: a dashboard "test console"
that injects a typed line into the real handling path; a 👍/👎 on each
spoken response; live, editable Tasks/Shopping panels; an aggregated
metrics widget; and (found, not originally asked for, while verifying
the others) a real layout overflow bug.

**Decisions.**
- **`core/main.ts`'s whole utterance-handling body became `handleUtterance(text)`,** called both from the real `ears` loop and from a new `ClientEvent` "utterance.inject" wired through `core/ws.ts`. `core` cannot tell a dashboard-typed line from a transcribed one once it lands -- deliberate, since the point is real usage data, not a separate toy path. Resolved the resulting `wsHub` ⇄ `handleUtterance` circular reference with a forward-declared `let handleUtterance` assigned after `wsHub` exists, same pattern any event listener registered before its handler body is filled in uses.
- **Feedback (`event_feedback` table) and routing stats (`routing_stats` table) are both new, separate tables -- not columns on `events`.** `events` is append-only by trigger (`db.ts`), so a rating couldn't live there even as a column; routing telemetry follows `core/dashboardHistory.ts`'s own established reasoning (ADR-028) for staying out of `Memory.recall()`'s reach, except durable (a real SQLite table, not a ring buffer) since this is exactly the real-usage data the SOAK exists to collect, not an ops log.
- **`core/metrics.ts`'s `computeMetrics` is a pure function over already-fetched rows, not a SQL aggregation query** -- same fakes-first testing rule as everywhere else in this project (CLAUDE.md § 3), and it paid off immediately: 5 unit tests written and passing before any DB or HTTP wiring existed.
- **Dashboard CRUD for Tasks/Shopping (`GET`/`POST .../toggle`/`DELETE` in `core/http.ts`) reuses `createSkillStore(db, skillId)` directly** -- the exact same namespace-prefix-enforced path the skills themselves use, not a raw `db` handle. Deliberately two named routes (`/api/tasks`, `/api/shopping-list`), not a generic "any skill's store" API -- only two skills have this list shape today, and a generic route would mean guessing a shape for hypothetical future skills (CLAUDE.md § 0.6).
- **Dashboard-initiated task/shopping writes stay ungated,** matching the existing tier for these skills' own voice-driven writes (`docs/SKILLS.md` § 1: private, low-stakes, frequently-changing data, not a shared fact). A dashboard checkbox is the same trust level as saying "mark it done."
- **Polling, not a new WS push, for Tasks/Shopping/Metrics** (3s/3s/10s respectively) -- `core` has no signal today for "a skill's store changed"; building one is real scope for three panels on a testing tool. Same interval class `SystemStatus` already established.

**Consequences.**
- 11 new backend tests (5 `metrics.test.ts`, 3 `feedback.test.ts`, 3 `routingStats.test.ts`), `make check` green at 224. `feedback.test.ts` caught a real thing worth knowing: `event_feedback.event_id REFERENCES events(id)` really does throw on a fabricated id (confirmed, not assumed) -- same FK behavior this project has hit and documented twice before (Phase 5b, ADR-027).
- **Live-verified with Playwright against a fresh isolated instance** (fake ears/voice, scratch DB), not just unit tests: typed a line into the test console and watched it dispatch for real (`tasks.add_task`, real response); toggled a real task done from the dashboard and confirmed the `UPDATE` landed via a direct DB read; deleted a seeded shopping item from the dashboard and confirmed the `DELETE` landed; clicked 👎 on a response and confirmed `event_feedback` got a real row; confirmed the metrics widget's numbers matched a hand-count of what actually happened (3 utterances, 1 no-skill-matched of 2 successful routing decisions -- the one hard provider failure correctly contributed to neither, since it never reached a lane decision at all). Zero console/page errors across every run.
- **Found and fixed during that verification, not before:** the dashboard's LEFT and RIGHT columns had no way to reveal content taller than the viewport -- `MetricsWidget` (new) pushed the column past its bound, and the outer wrapper's `overflow-hidden` silently clipped it rather than showing a scrollbar. Fixed with `overflow-y-auto` on both columns. Would have shipped invisible to Pedro tomorrow if this pass hadn't screenshotted the actual rendered page.
- **Confirmed, not caused: the ADR-028 lane-classifier-under-degraded-conditions gap is still live.** Hit twice more during this verification pass (a NIM mid-stream abort on one turn, a `see`-lane misroute of "add butter to the shopping list" on another) with NIM otherwise reachable and CPU load back to 53%. Not fixed here -- still the open item logged in `docs/BACKLOG.md`, now with two more reproductions on record.

## ADR-030 — SOAK 1: four real bugs from Pedro's first live `make dev` session with the new dashboard -- shopping_list mis-routing, a hallucinated-action honesty gap, a multi-item extraction bug, and one more Whisper vocabulary miss

**Status:** accepted

**Context.** Asked to dig into `data/jarvis.db` after Pedro's own real
`make dev` transcript. The new `routing_stats` table (ADR-029, shipped
hours earlier the same session) made this the first time a real
routing failure could be answered with data instead of guessing from
response phrasing: correlating `routing_stats` rows against the
`events` timeline for this session showed exactly what happened.

**Finding 1 -- `shopping_list`'s `remove_item`/`clear_list` (and
`add_item`/`list_items`) declared `lanes: ["converse"]` only, the
identical gap ADR-026 already found and fixed for `launcher`/`media`,
just never applied here.** "Can you delete milk sugar from the
shopping list?" classified as lane `act`; "Remove or delete Milk Sugar
from Shopping List" classified as lane `see` -- `routing_stats`
recorded both as `NO MATCH`, confirming dispatch never even considered
`shopping_list` for either. Fixed the same way ADR-026 did: a shared
`LIST_LANES = ["converse", "act", "see"]` applied to every intent.

**Finding 2 -- when dispatch falls through, `converse`'s general-reply
fallback claimed to have performed the action anyway.** Both
mis-routed turns above got a spoken reply: *"I've deleted milk sugar
from the shopping list"* and *"I've added: Milk Sugar to the shopping
list."* Neither ever happened -- confirmed directly: the two garbage
items from an earlier turn were still sitting in the real
`skill_shopping_list_items` table at the time of this investigation,
un-deleted, despite JARVIS's own claim. This is the same class of bug
ADR-023 already fixed once (`converse` claiming to build a skill that
doesn't exist), resurfacing in a more dangerous form -- a concrete,
checkable, state-changing claim about the owner's own data, not an
abstract capability claim. `core/persona.md` gained an explicit rule:
this voice never mutated anything itself, and if a request sounds like
it should change something, generating fallback text at all already
means no skill claimed it -- say so plainly, never describe a change
as done. `core/tests/converse.test.ts` gained a test asserting this
rule text actually reaches the model's system prompt (same pattern the
existing "can't claim capabilities" test already used).

**Finding 3 -- "add Milk and Sugar to the shopping list" was extracted
and stored as one item, `"Milk\nSugar"`, a literal embedded newline.**
Pedro tried to correct this explicitly ("I ask you to add milk and
sugar, not milk sugar, okay? It's two items") and got the identical bug
again, lowercase. Root cause: `EXTRACT_SYSTEM`'s prompt was written for
exactly one item per utterance and had no protocol for more -- the
model improvised a newline-joined compound string, and `addItem`
inserted the raw string as a single row with the newline still in it.
Fixed: the prompt now explicitly asks for one item per line when more
than one is mentioned, and `addItem` inserts one row per line
(`skills/shopping_list/index.ts`'s `extractItems`, renamed from
`extractItemText`). `removeItem` still targets a single item (no real
utterance has asked to remove more than one at once) -- takes the first
extracted line, same as before for the common case.

**Finding 4 -- "Drive to Lagoa" (a real Portuguese place) transcribed
as "Drive to La Goa."** Same root cause and same fix as ADR-026's
"Ponta Delgada" -> "Ponta del Gada, Zoris" bug: `small.en` has no
representation for the name. Added to the existing
`WHISPER_INITIAL_PROMPT` vocabulary hint
(`senses/ears/config.py`) -- now `"Ponta Delgada, Açores, Portugal,
Lagoa"`. Same reasoning as before applies unchanged: this is
transcribing what was actually said, not adding Portuguese to the
deliverable (CLAUDE.md § 0.1).

**Consequences.**
- The real, corrupted `data/jarvis.db` shopping list (the two
  `"Milk\nSugar"`/`"milk\nsugar"` garbage rows) was repaired, not just
  left as a known issue: both deleted and replaced with clean `"Milk"`
  and `"Sugar"` rows, restoring what Pedro actually asked for rather
  than silently wiping his list. `"water"` (added correctly) was left
  untouched.
- 226 tests (up from 224 -- one new `converse.test.ts` case for the
  honesty rule, one new `shopping_list/index.test.ts` case for
  multi-item extraction), `make check` green.
- **Live-verified, not just unit-tested:** replayed Pedro's exact
  failing phrasing ("Can you delete milk from the shopping list?",
  "Remove or delete sugar from Shopping List") against a fresh isolated
  instance. Both now dispatch to `shopping_list.remove_item` for real
  (confirmed by the skill's own honest "I couldn't find X on the list"
  response, not a hallucinated success) -- the routing fix holds.
- This is the second time in one SOAK a skill shipped without the
  multi-lane treatment ADR-026 established as the fix for this exact
  classifier bias (`launcher`/`media` first, now `shopping_list`).
  Worth a genuine audit of every skill's manifest against this pattern
  rather than fixing one skill at a time as real conversations happen
  to surface it -- logged in `docs/BACKLOG.md`.

## ADR-031 — SOAK 1: four more free-tier providers (Groq, Mistral, Google/Gemini, OpenRouter), `ollama` demoted to true last resort

**Status:** accepted

**Context.** The owner offered five free-tier API keys (Cerebras,
OpenRouter, Groq, Google AI Studio, then Mistral mid-conversation) and
asked for them to be tested directly, with explicit instructions: wire
in whichever ones actually work, ahead of `ollama` (`ollama` only as a
true last resort when every API is down), and remove any that don't
work rather than leave dead code pretending to be a real fallback.

**Testing, not assuming.** Every model name/endpoint used below was
verified live against the real API before being written into code --
this project already hit three separate "guessed a model name, got a
404" failures earlier the same day (Cerebras, OpenRouter, Google all
had different real catalogues than a reasonable guess would produce).
Results:
- **Cerebras** -- key authenticates, but the account returns HTTP 402
  "Payment required" on every model in its own catalogue (`gpt-oss-
  120b`, `gemma-4-31b`, `zai-glm-4.7`). No usable free quota. **No
  provider written for it** -- a config entry for a key that cannot
  serve a request would be dead code, not a real fallback option, per
  the owner's own instruction.
- **Groq** -- works, fastest of the four: ~200ms for
  `llama-3.1-8b-instant`, ~220ms for the 70B `llama-3.3-70b-versatile`.
  Real dedicated inference, not a shared pool.
- **Mistral** -- works, ~380ms for `mistral-small-latest`, OpenAI-style
  JSON mode confirmed working (the lane classifier's hard requirement).
- **Google AI Studio (Gemini)** -- works, but ~1.6s observed for
  `gemini-flash-latest` (the model "thinks" before answering on this
  API version; no request-level way found to fully disable it for this
  model). `gemini-1.5-flash` and `gemini-2.5-flash` both 404'd as "no
  longer available to new users" during testing -- real models churn
  fast here, so `wiring.ts` points at rolling aliases
  (`gemini-flash-latest`/`gemini-pro-latest`), not dated snapshots.
- **OpenRouter** -- works, but the currently-free (`:free`-suffixed)
  catalogue skews toward reasoning models that spend real token budget
  "thinking" before any visible content, and at least one call hit a
  429 relayed from a *shared upstream pool* (Google's own free capacity
  via OpenRouter, not a dedicated allocation) -- confirmed via the
  error body, not assumed. Real, not a one-off.

**Decisions.**
- **A new shared base, `core/router/providers/openaiCompatible.ts`,**
  for the three providers that turned out to speak the exact same
  OpenAI-compatible shape `nim.ts` already implements (`groq`,
  `mistral`, `openrouter`). `nim.ts` itself was deliberately **not**
  refactored onto this base -- it already works, is already tested, and
  is the primary provider on two lanes; risking a regression there for
  a cosmetic DRY win wasn't worth it. `google.ts` stays its own file --
  Gemini's request/response shape (`contents`/`parts`, a real
  `systemInstruction` field, `?key=` query-param auth, its own SSE
  payload shape) is genuinely different, confirmed by testing its
  streaming endpoint live before writing any code for it.
- **Fallback order is `nim` → `groq` → `mistral` → `google` →
  `openrouter` → `ollama` (converse) / → `offline-fallback` (reason),**
  ordered by measured latency/reliability from the testing above, not
  reputation -- the same "data not reputation" rule ADR-001 already
  used once for the original local-model choice. `ollama` moved to the
  very end of `converse`'s chain (was second, right after `nim`) per
  the owner's explicit instruction: `qwen2.5:0.5b`'s quality (ADR-001's
  accepted "even degraded" fallback) is worse than any of these four
  real remote models, so it should only be reached when every one of
  them is unreachable. `reason` gained a real fallback chain for the
  first time -- it previously went straight from `nim` to an honest
  "can't reach it" static message with nothing in between.
- **Every new key is optional at boot**, via a new `tryKeychainSecret`
  that returns `null` instead of throwing on a missing Keychain entry
  (unlike `jarvis-nim-key`, which stays required setup). A machine with
  only `nim` configured still starts and runs correctly with a shorter
  chain -- adding a free provider is additive, never a new hard
  requirement to boot at all.
- **Cerebras's key stays in Keychain but no provider was written for
  it** -- explicitly not code, matching the owner's own reasoning
  ("para não termos falsa api no código"). Revisit only if the account
  gets free quota later.

**Consequences.**
- 241 tests (up from 226 -- 15 new: a full suite against the shared
  `OpenAiCompatibleProvider` base mirroring `nim.test.ts`'s own cases,
  one wiring-confirmation test each for `groq`/`mistral`/`openrouter`,
  and a fuller suite for `google.ts` covering what's actually different
  there). `make check` green.
- **Live-verified end to end against the real `Registry`, not just unit
  tests:** `buildRegistry()` produces the exact chain order above for
  both lanes; a real `converse` request (with `nim` unreachable at the
  time, the same live flakiness ADR-026/028/030 already documented)
  correctly fell through and was answered by `groq`; a real strict-
  JSON-mode request (the lane classifier's exact shape) returned valid
  JSON via `groq`; a real `reason`-lane request was answered by `groq`'s
  70B model. The fallback chain isn't theoretical -- it already saved a
  real request during this same testing session.
- `README.md` gained a setup section for the four optional keys,
  mirroring the existing NIM Keychain-setup convention. `docs/
  BACKLOG.md`'s "Additional providers" line marked done.
- Rate limits for all four are provisional, conservative defaults, not
  independently confirmed ceilings the way ADR-002 confirmed NIM's
  ~40 rpm -- each provider's own docstring says so plainly. A 429 from
  any of them still maps to `ProviderUnavailableError` and falls
  through regardless, so an imprecise client-side bucket costs at most
  one wasted attempt per burst, never a hard failure.

## ADR-032 — SOAK 1: `weather` silently ignored "tomorrow," asked for a city instead, timed out

**Status:** accepted

**Context.** Pedro's second real `make dev` session with the new
`groq`/`mistral`/`google`/`openrouter` fallback chain live (routing
itself now working well end to end -- `shopping_list.clear_list`,
`launcher.open_url`, and an honest capability refusal all correctly
dispatched or fell through as intended this session). One real bug:
"Can you give me the weather resume for tomorrow?" dispatched correctly
to `weather.current_weather`, then hung -- `ask() timed out waiting for
a spoken answer` after 30s.

Root cause, confirmed by reading `skills/weather/index.ts`: this skill
only ever calls Open-Meteo's *current* conditions endpoint (no forecast
capability exists at all) and completely ignores the word "tomorrow" in
the utterance -- with no city remembered yet (`data/jarvis.db`'s
`facts` table has no `location.city` row; the owner has apparently
never gotten far enough through this flow to have it proposed), it
called `ctx.ask("What city should I use for weather?")`, a question
that didn't match what was actually asked, and nobody answered it in
time.

**Decision.** Before doing anything else, `handle()` now checks the raw
utterance against a `FORECAST_PATTERN` (`tomorrow`, `forecast`, `next
<weekday>`, `this weekend`) and, if it matches, says so plainly --
*"I can only tell you the current weather right now, not a forecast for
another day."* -- and returns immediately, never calling `ctx.ask()`.
CLAUDE.md § 6: silently answering a different, unsupported question is
its own kind of wrong answer, not a lesser one than a bad number.
Deliberately not real forecast support -- that's a real feature (a
different Open-Meteo endpoint, more scope) logged in `docs/BACKLOG.md`
if wanted, not a same-session patch.

**Consequences.**
- One new test (`skills/weather/index.test.ts`): asserts the forecast
  refusal path never calls `ctx.ask()` at all (the fake conversation
  has zero scripted answers and throws if asked), using `geocode`/
  `fetchCurrentWeather` fakes that throw if called, to prove neither
  runs either. 242 tests, `make check` green.
- Confirmed via `data/jarvis.db`: no `location.city` fact and no
  matching approval exist yet at all -- the owner has never completed
  this flow successfully. Once he does answer the city question once
  (for an actual current-weather ask, not a forecast one), a real
  `MEMORY_WRITE` approval will appear in the dashboard queue; approving
  it once fixes "always asks for a city" going forward. Not a bug to
  fix in code -- an approval waiting on the owner.

## ADR-033 — reversing the v0.1 "English only" rule: JARVIS's spoken conversation becomes bilingual PT-PT/English

**Status:** accepted

**Context.** CLAUDE.md § 0.1 originally read, verbatim: "Everything in
English. Code, comments, docs, prompts, TTS output, wake word. No
exceptions. The owner is Portuguese but has chosen English as the
system language for accuracy reasons." This was a real, deliberate
v0.1 decision, not an oversight -- the stated reasoning was STT/TTS/
model accuracy, and it held for the whole project up to this point
(the Whisper vocabulary-hint fixes for "Ponta Delgada" and "Lagoa",
ADR-026/030, were themselves scoped explicitly as *transcribing what
was actually said* accurately, not as an exception to the English
rule -- see those ADRs' own reasoning).

Asked directly (2026-08-05) to reverse this: JARVIS's spoken
conversation should understand and respond in European Portuguese
(PT-PT) or English, matching whichever language the owner is actually
speaking, including a natural mid-sentence switch to whichever
language a specific word is more natural in. Flagged once, per
CLAUDE.md § 9 ("say so, once, clearly, then follow the instruction
unless it breaks a non-negotiable... those you refuse and explain") --
this was a genuine § 0 non-negotiable, not a style preference, so it
was surfaced explicitly rather than quietly built. The owner confirmed
he wants the reversal with full awareness of what was being changed.

**Decision.** CLAUDE.md § 0.1 rewritten: code, comments, docs, commit
messages, and *internal* prompts (intent classification, JSON
extraction, routing -- CLAUDE.md § 4) stay English unconditionally --
that rule was never about the owner's spoken language, it's about
small local models being measurably more reliable at structured tasks
in English, and stays true regardless of what language the owner
speaks. What changes is narrower and specific: STT understanding and
TTS output for actual conversation are now bilingual PT-PT/English.
The wake word ("hey jarvis") is explicitly unaffected -- it's a fixed
trained trigger phrase (Phase 2, openWakeWord's own model), not part
of "conversation," and retraining/replacing it was not asked for.

**Not built yet -- this entry updates the rule, not the code.** The
owner asked to "update the documentation" for this, and that's what
happened here; the real implementation work is real scope, logged in
`docs/BACKLOG.md`, likely deserving its own phase-sized pass rather
than a quick patch:
- `senses/ears`: either a genuine multilingual Whisper model (already
  tried once for a single proper noun and found inconclusive-to-worse
  against synthetic test audio, ADR-026 -- a full bilingual-conversation
  switch is a materially different, bigger question than one place
  name, deserves its own real test against the owner's actual voice,
  not synthetic `say`-generated audio) or language detection + routing
  between the current `small.en` and a PT-capable model per utterance.
- `senses/voice`: a PT-PT-capable TTS voice selected per response
  language (macOS `say -v` has real PT-PT voices available, per Phase
  1's own voice selection work -- confirming a good one is real but
  bounded research, not a new dependency).
- `core/persona.md` and every skill's own `persona.md`: currently
  written assuming English-only output; needs real thought about
  whether the persona *voice* changes with language or only the words
  do.
- Skill manifest `examples` (`docs/SKILLS.md`'s routing data) would
  plausibly need PT-PT phrasings added alongside the English ones for
  intent matching to work when the owner speaks Portuguese -- untested
  assumption, not confirmed, flagged as a real risk to verify early
  rather than assume.
- The lane classifier and general-conversation prompts (CLAUDE.md § 4)
  stay English-only regardless (internal, not spoken) -- but whether an
  English-only classifier reliably classifies a Portuguese utterance's
  *lane* is an open, untested question worth an early benchmark pass,
  not an assumption either way.

**Consequences.** No code changed in this entry -- `CLAUDE.md` and this
ADR are the only diffs. Real STT/TTS/persona/routing work stays open,
tracked in `docs/BACKLOG.md`, not scheduled into `ROADMAP.md` yet
(that's a real phase-sequencing decision -- where this lands relative
to Phases 8-13 -- left for a dedicated conversation rather than
decided unilaterally here, per `ROADMAP.md`'s own "nothing leaves
BACKLOG.md without becoming a numbered phase" rule).

## ADR-034 — SOAK 1: hybrid recall (and a real bug it surfaced -- semantic indexing never actually ran in production), plus Spotify control

**Status:** accepted

**Context.** Asked to pick up the highest-value, lowest-risk items from
the 2026-08-05 capability research and build them for real SOAK
testing, owner's own words: "o que vires que pode esperar fazemos mais
à frente." Two picked: hybrid search for `core/memory/recall.ts` (the
research's own "cheapest, highest-value" finding) and real Spotify
control (the owner's own example of "not just open Spotify, control
it").

**Decision 1 -- hybrid recall.** `core/memory/recall.ts`'s semantic
step (`memory_vec`, vector-only) gained a second, independent keyword
half (`events_fts`, SQLite's built-in FTS5, new `core/memory/
keywordSearch.ts`) fused by Reciprocal Rank Fusion (new `core/memory/
rrf.ts`, `k=60`, the literature's own de facto default). `AssembledContext.semanticMatches`
renamed to `recallMatches` -- "semantic" undersold it once a keyword
half existed too. Keyword search needs no timeout guard the way the
embedder does (`semanticTimeoutMs`) -- it's a local, synchronous SQLite
query, no network/model round trip.

**The real bug this surfaced, found while wiring the two together, not
gone looking for:** `core/main.ts` had only ever called `Memory.
appendEvent()` for real conversation turns, never `Memory.remember()`
-- the one method that also calls `indexText()`/`memory_vec`. Confirmed
directly against the real `data/jarvis.db`: `memory_vec` had never
indexed a single real utterance or response in production. **Semantic
recall (SPEC.md § 4 step 2, "top-k semantic matches") has been
silently non-functional in every real conversation since Phase 4** --
`assembleContext()` was designed to degrade gracefully when nothing
qualifies, which is exactly what made this invisible: no error, no
crash, indistinguishable from "genuinely nothing relevant was ever
said." Fixed: `Memory` gained `indexEvent(event)`, the indexing half of
`remember()` decoupled so a caller can `appendEvent` synchronously
(needs the id immediately for the transcript broadcast/fact-extraction
sourceEventId) and index afterward, fire-and-forget -- same latency
reasoning `extractAndRememberFacts` already uses (CLAUDE.md § 7:
indexing only matters for a *future* turn, must never delay today's
response). `core/main.ts`'s two conversation-turn `appendEvent` calls
now each fire `memory.indexEvent(...).catch(...)` right after.

**Decision 2 -- Spotify control.** `core/executors/media.ts`'s
`MediaControlPayload` gained an `app: "Music" | "Spotify"` field (both
apps confirmed live to expose the identical AppleScript verbs).
`skills/media/index.ts` detects which app is actually running once per
request (`System Events`, checks for a Spotify process; defaults to
Music.app otherwise, preserving the pre-existing behavior for anyone
not using Spotify) *before* proposing -- the app name is baked into
both the `humanSummary` the owner approves and the signed payload, not
re-detected inside the executor at execution time (a real, if narrow,
approve-time-vs-execute-time mismatch risk if the owner switched apps
in between). `MediaApp` is duplicated in the skill file rather than
imported from the executor -- confirmed live: even a type-only import
from an executor trips the "a skill cannot import an executor" lint
rule (CLAUDE.md § 5b) -- same pattern the file already used for
`MediaCommand`'s literal union.

**Consequences.**
- 15 new tests (12 memory/recall: 5 `rrf.test.ts`, 5 `keywordSearch.
  test.ts`, 2 new `recall.test.ts` cases proving a keyword-only match
  --  deliberately orthogonal embeddings -- is still surfaced, and that
  keyword matches survive an embedder timeout; 3 media: Spotify
  targeting, plus an unknown-app rejection). 257 tests total (was 242),
  `make check` green.
- **Live-verified, not just unit-tested:** ran a fresh isolated
  instance, sent two real utterances through the real `handleUtterance`
  path, confirmed directly against the scratch DB that `memory_vec` and
  `events_fts` both now have real rows matching real conversation --
  before this fix, both would have stayed at 0 rows forever regardless
  of how much was said. Spotify's own control path verified via the
  real, safe (no audio-triggering) halves: `System Events`'s Spotify-
  process check and Music.app's current-track read, both confirmed
  working against this actual machine (Spotify isn't installed here,
  confirming the fallback-to-Music default is what actually fires).
  Deliberately did not live-test an actual `play` call -- same
  "unexpected audio is a bigger surprise than a Calculator window"
  reasoning ADR-025 already used once.
- **A real, separate bug found live during this same verification, not
  caused by tonight's changes:** "I don't eat peanuts, I'm allergic"
  dispatched to `shopping_list.remove_item` (confirmed via
  `routing_stats`: lane `converse`, correctly classified -- this is an
  embedding-example collision, not a lane problem). Same bug *class*
  ADR-026 already fixed once (the "coffee" collision) -- shopping_
  list's `remove_item` examples ("I already bought eggs") sit close
  enough in embedding space to a declarative "I [verb] a food item"
  sentence to win over general conversation, and no skill actually
  owns "state a dietary fact" as an intent. Not fixed here -- logged in
  `docs/BACKLOG.md`'s Annoyances section rather than guessed at under
  time pressure; the exact fix (which example, or a stronger
  disambiguation margin) needs the same live-evidence-first approach
  ADR-026/030 already used, not a blind edit.

**Same-day correction (2026-08-06):** the owner clarified he uses
*only* Spotify, never Music.app at all -- the "detect which app is
running" design above answered the wrong question (Spotify not being
open yet doesn't mean Music.app is wanted; `tell application "Spotify"
to play` launches it same as any app). Simplified: `resolveTargetApp`
now defaults to Spotify unconditionally, switching to Music.app only
when the utterance itself names it explicitly ("apple music", "music
app" -- deliberately requiring the app-name phrasing, not bare
"music", so "play some music" doesn't false-positive). Pure text
matching, synchronous, no `System Events` call and no fake needed in
tests -- simpler than the running-app-detection version it replaced,
not just different. 2 new tests replace the old detection-based ones;
259 tests total, `make check` green.

## ADR-035 — SOAK 1: MCP integrated for real, Gmail as the first server, everything gated uniformly

**Status:** accepted

**Context.** Asked to "avança" (proceed) with the Gmail/Google
Analytics MCP work from the 2026-08-05 capability research, with the
owner's own real-time control-flow correction along the way: a
drafted red-tier action (e.g. a message) can be composed and revised
entirely by voice, but the actual send only fires on the owner's own
typed/clicked approval, never a spoken "yes" alone (already codified
in CLAUDE.md § 5, ADR-033). This is that integration, real code, not a
design note -- Gmail specifically; Google Analytics uses the identical
plumbing and is a smaller follow-up once this pattern is proven.

**What was verified before writing any code, not assumed** (this
session has been burned more than once guessing a third-party API's
exact shape):
- The real `@modelcontextprotocol/sdk` (installed, `^1.30.0`) --
  `Client`/`listTools`/`callTool` signatures read directly from its own
  `.d.ts` files, not a web search's paraphrase.
- Google's real Gmail MCP setup docs: a remote server
  (`https://gmailmcp.googleapis.com/mcp/v1`, Streamable HTTP, not a
  locally-spawned process), OAuth client type **Web application**,
  scopes `gmail.readonly` + `gmail.compose` (never `gmail.send` --
  the official server itself doesn't expose a send scope, an external
  confirmation of "draft, never auto-send" independent of anything
  this project decided on its own).
- Google's loopback-redirect rules: `http://localhost:<port>` is
  exempt from the HTTPS requirement and stays supported for the "Web
  application" client type (unlike native/mobile types, which Google
  is deprecating it for) -- confirmed live via Google's own docs, not
  assumed.

**Decisions.**
- **New capability, `MCP_TOOL_CALL`, deliberately uniform across every
  MCP tool, every server, no per-tool tiering.** MCP's own spec lets a
  server self-declare `readOnlyHint`/`destructiveHint` per tool, and it
  was tempting to auto-run tools a server calls read-only -- rejected:
  those hints are the *server's own claim*, not independently
  verified, and CLAUDE.md § 0.5's "trust never comes from a model or
  external claim" reasoning (already applied to facts, quantities, and
  N.E.K.O's speaker-trust precedent researched 2026-08-05) extends
  naturally to a server's self-reported safety hints too. Every
  `MCP_TOOL_CALL` requires a real approval, full stop -- loosening this
  per-tool later, once real tool catalogues are actually seen, is a
  real option; assuming safety upfront from an unverified hint is not.
- **New architecture layer, `core/mcp/`:** `registry.ts` (`McpRegistry`
  -- connects, caches tool lists, the *only* place `callTool` is
  actually reachable, injectable `connectFn` for tests per CLAUDE.md
  § 3), `googleOAuth.ts` (the standard authorization-code flow, split
  into unit-testable HTTP exchanges vs. the one-time interactive
  human-in-the-loop dance), `setup.ts` (assembles the real registry for
  `core/main.ts`, same role `router/wiring.ts` plays for LLM
  providers -- every server optional at boot, a missing Keychain entry
  or a failed connection degrades to "not registered," never a crash).
  `core/executors/mcp.ts` is the executor (same factory shape as
  `executors/memory.ts`). `SkillContext` gained `mcp: McpToolLister` --
  deliberately a *narrow, read-only* view (`hasServer`/`listTools`
  only, never `callTool`) so a skill can discover what's available but
  can only ever invoke a tool through `ctx.propose()`, same "propose,
  never execute directly" rule every other capability already follows.
- **`skills/gmail` doesn't hardcode a real tool name or argument
  key -- both are genuinely unverifiable without a live, authorized
  connection this session doesn't have yet.** `findSearchTool` pattern-
  matches whatever `ctx.mcp.listTools("gmail")` actually reports at
  runtime; `guessQueryArgName` reads the tool's own declared
  `inputSchema` (now captured in `McpToolInfo`) rather than assuming a
  key like `query`/`q`. Both branches that can't confidently resolve
  something say so honestly instead of guessing blind -- "can't find a
  search tool," "doesn't have an argument shape I recognize." This is
  a direct, deliberate application of this session's own repeated
  lesson (Cerebras, OpenRouter, Google AI Studio model names all
  turned out different from a reasonable guess, 2026-08-04/05) to a
  server this project has never actually connected to.
- **`bench/gmail_authorize.ts`, a one-time interactive setup script,
  not automated by `core/main.ts`** -- same "human-in-the-loop setup,
  never automatic" convention every other secret in this project
  already follows (`security add-generic-password` for every API key
  so far). Prints exact setup instructions (redirect URI, Google Cloud
  Console steps) when the Keychain entries aren't there yet, rather
  than failing opaquely.

**Consequences.**
- 25 new tests (`core/mcp/tests/registry.test.ts`,
  `core/mcp/tests/googleOAuth.test.ts`,
  `core/executors/tests/mcp.test.ts`, `skills/gmail/index.test.ts`).
  284 tests total, `make check` green.
- **A real bug found live during verification, unrelated to MCP
  itself, fixed properly rather than just patched:**
  `core/skills/loader.ts` had its own hardcoded `VALID_CAPABILITIES`/
  `VALID_LANES` lists, separate from `shared/types.ts`'s own union
  types -- adding `MCP_TOOL_CALL` to the type alone wasn't enough; the
  skill loaded disabled with a real manifest-validation error
  ("contains an unknown capability") until this second list was also
  updated by hand. Rather than just patch the one missing entry, both
  lists became `Record<Capability/Lane, true>` keyed by the full union
  -- TypeScript itself now rejects the build if either list ever misses
  a member again, turning a silent runtime "skill mysteriously
  disabled" failure into a compile-time error. See `docs/BACKLOG.md`.
- **Also found live:** skills aren't auto-discovered from the
  filesystem -- `core/skills/registered.ts` is an explicit, hand-
  maintained list (by design, matching `router/wiring.ts`'s own
  "register one at a time" philosophy) -- `skills/gmail` didn't load
  at all until added there. Not a bug, just a real step easy to forget;
  noting it here since it cost a full debug cycle to rediscover live.
- **Live-verified end to end, the part that's actually testable
  without the owner's own OAuth setup:** a fresh isolated instance,
  real dispatch, "check my email" correctly routes to `gmail.
  check_email` (not some other skill by coincidence) and responds
  honestly -- *"Gmail isn't connected yet -- that needs a one-time
  setup I can't do myself."* Confirmed `core` boots and runs normally
  with zero Gmail Keychain entries present, exactly the state every
  real clone of this repo starts in.
- **Not verified, cannot be from this side:** the real authorized
  connection, the real tool catalogue, whether `findSearchTool`/
  `guessQueryArgName` actually resolve correctly against Google's real
  server. Blocked on the owner completing the Google Cloud Console
  setup and running `bench/gmail_authorize.ts` -- see `README.md`'s
  new "3c" section for the exact steps. Google Analytics (the
  research's other named target) reuses this exact same `core/mcp/`
  plumbing once Gmail is confirmed working end to end -- not built
  yet, deliberately sequenced after real verification of the first
  server rather than building two unverified integrations at once.

## ADR-036 — SOAK 1: Gmail OAuth completed, first live MCP call, a real registry bug and a wrong setup step found

**Status:** accepted

**Context.** Owner stored the real Google OAuth client ID/secret in
Keychain and ran `bench/gmail_authorize.ts`. First attempt failed with
Google's `403 access_denied` on the consent screen itself -- the OAuth
client was in "Testing" publishing status and the owner's own account
wasn't on the consent screen's Test users list yet. Fixed on the
owner's side (Cloud Console → OAuth consent screen → Test users → add
self), not a code issue. Second attempt completed; refresh token
stored as `jarvis-google-oauth-refresh-token`.

**What live verification found, immediately after, going further than
ADR-035 could without a real token:**

- **A real, unambiguous bug in `core/mcp/registry.ts`'s `register()`:**
  it stored the new connection in `this.connections` *before* awaiting
  `connection.listTools()`. When `listTools()` throws, the server is
  left half-registered forever -- `hasServer()` reports `true` but
  `toolCache` stays permanently empty (`listTools()` falls back to
  `[]`), instead of the whole registration failing and being caught by
  `core/mcp/setup.ts`'s own try/catch the way every other connection
  failure already is. Reproduced live: connecting to the real Gmail
  MCP server threw during `listTools()` (see below), and the isolated
  verification script showed exactly this -- `hasServer("gmail") ===
  true`, `listTools("gmail") === []`. Fixed by reordering: `listTools()`
  now runs before either map is touched, so a failure there means the
  server never registers at all. New regression test in
  `core/mcp/tests/registry.test.ts` covers it.
- **The actual cause of that `listTools()` failure: README's setup
  steps were incomplete.** Step 4 said "Enable the Gmail API" --
  necessary but not sufficient. A raw `fetch()` against
  `https://gmailmcp.googleapis.com/mcp/v1` (bypassing the SDK, to see
  the real HTTP status/body independent of how the SDK's own
  `StreamableHTTPClientTransport` reports it) showed the actual server
  response for a `tools/call`: HTTP 403 with a body reading *"Gmail MCP
  API has not been used in project ... before or it is disabled...
  https://console.developers.google.com/apis/api/gmailmcp.googleapis.com/overview?project=...".*
  The MCP gateway itself (`gmailmcp.googleapis.com`) is a **separate**
  API from the Gmail API in Google's Cloud Console library, easy to
  miss since only the latter is the "obvious" Gmail-sounding search
  result. README's step 4 now lists both explicitly.
- **A genuinely strange, confirmed-reproducible Google server quirk,
  noted for whoever debugs this integration next:** `tools/list`
  itself returns HTTP 403 *with a fully valid, complete JSON-RPC
  result body* (the real tool catalogue: `search_threads`,
  `get_thread`, `get_message`, `list_drafts`, `create_draft`,
  `list_labels`, `label_thread`, etc., with full schemas) -- status
  and body disagree. Only `tools/call` gave an unambiguous, readable
  answer (the "API not enabled" message above, also HTTP 403 but with
  `isError: true` in the JSON-RPC result rather than a misleadingly
  successful-looking `result.tools`). Confirmed reproducible across two
  separate raw-fetch attempts, not a one-off network blip. Not a bug in
  this codebase -- the MCP SDK's own `StreamableHTTPClientTransport`
  reasonably treats a non-2xx status as an error and throws, which is
  what triggered the registry bug above in the first place.

**Consequences.**
- `core/mcp/registry.ts` fixed, one new test, 285 tests total, `make
  check` green.
- `README.md`'s Gmail setup section corrected to name both required
  APIs.
- **Still not live-verified:** an actual successful `tools/call`
  against the real Gmail MCP server, and therefore `skills/gmail`'s
  `findSearchTool`/`guessQueryArgName` against the real catalogue.
  Blocked on the owner enabling "Gmail MCP API" in Cloud Console and
  waiting for it to propagate (Google's own error message says "wait a
  few minutes"). The real tool catalogue captured during this session
  (listed above) already confirms `findSearchTool`'s regex (`/search|
  query|list.*(message|email|thread)/i`) matches `search_threads`
  correctly, and its `inputSchema.properties.query` is a plain string
  -- `guessQueryArgName` should resolve to `"query"` via the
  single-string-property path once a real call succeeds. Worth a
  follow-up live run once the API is enabled, rather than assuming
  this analysis is sufficient on its own -- this project's own
  "verify before guessing" rule applies to reading a schema by eye
  too.

## ADR-037 — Gmail MCP: a real, external Google bug, not a config gap, closes out this integration's SOAK-1 work

**Status:** accepted (integration paused, not abandoned)

**Context.** Owner enabled "Gmail MCP API" per ADR-036, then "Gmail
API" on a second round after the first still didn't resolve it. Three
distinct real root causes fixed in sequence this session (test-user
list, Gmail MCP API enablement, Gmail API enablement), each verified
by re-running the live connection -- and after all three, every actual
data call still failed identically.

**What was verified, not assumed, before calling this "not our bug":**
- `GET /oauth2/v2/tokeninfo` on the live access token: scopes are
  exactly `gmail.readonly` + `gmail.compose`, `aud`/`azp` match our own
  OAuth client. The token is valid and correctly scoped -- ruling out
  a stale/wrong-scope token as the cause.
- Both `search_threads` and `list_labels` (a filtered search and the
  simplest possible read) fail identically -- ruling out a single
  tool's own bug or a query-syntax problem.
- `tools/list` itself now succeeds cleanly (HTTP 200, 13 real tools,
  matching ADR-036's catalogue exactly) -- ruling out the two earlier
  API-enablement issues; those are confirmed fixed.
- A web search for the exact error string turned up
  [anthropics/claude-ai-mcp#229](https://github.com/anthropics/claude-ai-mcp/issues/229)
  (`search_threads` returning "permission denied" despite a correctly
  granted `gmail.readonly` consent -- the same shape of failure) and
  [#424](https://github.com/anthropics/claude-ai-mcp/issues/424) (every
  Gmail/Calendar connector call failing with the identical string
  `"The caller does not have permission"`, 100% reproducible, ongoing
  since 2026-04-20 for affected accounts, unrelated to this project or
  this owner's Google account). Independent, external confirmation
  that Google's own Gmail MCP connector has a live, known permission
  bug completely outside anything this codebase controls.

**Decision.** Stop here per CLAUDE.md § 2 ("three attempts fail, stop
and report" -- three real fixes applied, the underlying symptom
unchanged, and outside evidence now explains why). No more Cloud
Console changes attempted; the failure mode isn't a settings gap.
`skills/gmail`'s existing honest-failure design (ADR-035) already
handles this correctly with zero further code changes needed -- a
failed `callTool` speaks the real error rather than fabricating a
result, exactly the behavior this situation calls for.

**Consequences.**
- Gmail integration is **code-complete, tested, and live-connected**
  (OAuth, registry, tool discovery all confirmed working end to end)
  but **not yet usable** for actual searches, blocked entirely on
  Google's side. `docs/BACKLOG.md` updated to reflect this precisely
  -- not "owner setup incomplete" (the old, now-inaccurate framing)
  but "Google bug, no action item for us."
  <br>
- Google Analytics MCP (ADR-035's planned follow-up, same `core/mcp/`
  plumbing) stays deliberately unstarted -- the point of sequencing it
  after Gmail was to prove the pattern against one real, working
  connection first; Gmail isn't that yet, through no fault of the
  pattern itself. Revisit once either Gmail's data calls start working
  or there's a reason to test the same plumbing against a different
  Google MCP server independently.
- No regression risk carried forward: every piece of `core/mcp/`
  actually reachable without owner-only setup already has test
  coverage (25 tests from ADR-035, +1 from ADR-036's registry fix).
  This ADR closes out the *verification* work, not the code -- nothing
  here required a code change.

## ADR-038 — the "peanuts" bug: two prompt fixes tried, benchmarked, both rejected -- the real problem is bigger than wording

**Status:** rejected (both fix attempts) -- no code change shipped, real infrastructure built and kept

**Context.** `docs/BACKLOG.md` (root-caused 2026-08-06, see the earlier
entry) already suspected the fix: a counter-example in
`DISAMBIGUATION_SYSTEM`, the same shape of fix ADR-027 used for
`EXTRACTION_SYSTEM`. That entry deliberately stopped short of shipping
it without benchmark-backed verification, per ADR-026's own lesson that
editing a *shared* prompt can silently regress unrelated cases. This
ADR is that verification actually being done -- and it overturns the
suspected fix.

**New infrastructure, built first, before touching the prompt at all**
(no benchmark existed for the disambiguation step specifically --
`bench_skill_routing.ts` grades the whole `dispatch()` pipeline but had
never isolated the degraded-model path):
- `tsconfig.json` now includes `bench/**/*.ts`. Found live: it didn't
  before, so `make check`'s `tsc --noEmit` was silently never
  type-checking any bench script -- `bench_skill_routing.ts` had
  already drifted from `SkillContext`'s real shape (missing the `mcp`
  field ADR-035 added) with nothing catching it. Fixed both the
  include and the drift.
- `bench_skill_routing.ts` gained real `shopping_list` regression cases
  (it previously tested zero shopping_list cases despite that being
  the skill actually implicated) and the fact-statement cases
  ("peanuts," "lactose," two more to check generalization past diet
  specifically) that are the actual subject of this bug.
- **New: `bench/bench_disambiguation_fallback.ts`**, built specifically
  because the general benchmark couldn't reproduce the bug -- against
  the healthy primary model (`nim`), disambiguation already said
  "none" correctly for every fact-statement case, no fix needed. The
  live bug (ADR-034) only happened because that conversation's
  disambiguation call had fallen through to the degraded local model
  (`qwen2.5:0.5b`, ADR-001/ADR-028). This script forces exactly that
  path: a `Registry` with *only* the ollama fallback provider
  registered for `converse`, so the real weak model is what gets
  graded, not a healthy one standing in for it.

**What the degraded-model benchmark found, run before any prompt
change (baseline):** 42.9% (3/7) -- every fact-statement case
misrouted to a `shopping_list` intent, `disambiguated: true` in every
failure (the model actively chose wrong, not a shortlist/embedding
problem). Confirms the original diagnosis precisely.

**Fix attempt 1 -- a counter-example matching `EXTRACTION_SYSTEM`'s
own style** (a worked example: utterance, candidate list, the correct
`{"choice": "none"}`, one line of reasoning). Re-ran the degraded
benchmark: **no improvement at all**, identical 42.9%, same cases
failing the same way.

**Fix attempt 2 -- a single short rule, no worked example** ("Pick
'none' if the user is stating a fact, preference, or allergy about
themselves, not asking for an action"), on the theory that a 0.5B
model attends poorly to long few-shot blocks. Re-ran: **still no
improvement** on the degraded benchmark (same 3 cases still wrong) --
**and a regression surfaced on the *healthy*-model benchmark**:
`bench_skill_routing.ts` dropped from 91.7% to 87.5%, two previously-
correct off-topic cases ("commit the current changes," "run the test
suite") now wrongly dispatching to `launcher.open_project`. Isolated
by reverting the prompt and re-running just those two cases (passed
clean on the original prompt, both runs reproducible, not noise) --
confirmed the second fix attempt caused this, not measurement noise.

**A separate, more severe problem found in the process, not fixed
here either:** warming the local chat model up first (a real call,
generous timeout) still wasn't enough -- the very next real
`dispatch()` call still threw `AllProvidersFailedError` inside
`classifyLane()`, timing out at the production 3000ms limit. A raw
`curl` to Ollama's `/api/chat` for `qwen2.5:0.5b` measured
`load_duration: ~29.7s` -- this machine's 8GB RAM (ADR-001) cannot
hold `mxbai-embed-large` (used for every utterance's embedding match)
and the fallback chat model resident at the same time, so real
degraded-mode operation likely thrashes both models in and out of
memory on every single utterance, not just misclassifying but
potentially timing out outright. **This fails safely, confirmed by
reading the code, not assumed:** `core/main.ts`'s `handleUtterance`
wraps the whole dispatch call in try/catch (lines ~138-206) and speaks
"Something went wrong handling that, I've logged the error" rather
than crashing or going silent -- CLAUDE.md § 6's honesty rule holds
even here. Bad UX under a real outage, but not a lie and not a crash.

**Decision.** Ship none of the two prompt-wording attempts --
confirmed to not fix the actual failure mode and confirmed (attempt 2)
to actively regress unrelated cases, exactly the risk ADR-026 already
named. `DISAMBIGUATION_SYSTEM` in `core/skills/dispatch.ts` is
unchanged from before this ADR. Keep everything else: both new/updated
benchmark scripts (real, reusable diagnostic value regardless of this
specific fix's outcome), the `tsconfig.json` fix, and the new
regression cases in `bench_skill_routing.ts`.

**Consequences.**
- `docs/BACKLOG.md`'s "peanuts" entry updated: now says two real fixes
  were tried and benchmark-rejected, not just diagnosed. The right fix
  is no longer "a prompt counter-example" -- it's tangled up with
  ADR-028's already-open, already-flagged-as-needing-design-work
  degraded-mode reliability problem, now with sharper evidence
  (measured ~30s cold-load, a plausible timeout/crash path, not just
  "sometimes misclassifies"). Revisit both together, not as two
  separate small patches.
- 285 tests unchanged (no test file touched -- this was benchmark-only
  verification against real models, per CLAUDE.md § 3's own carve-out
  for live smoke tests a fake can't stand in for).
- `make check` green, `bench/` now actually type-checked going
  forward.

## ADR-039 — bilingual PT-PT/English, the real implementation (ADR-033's follow-through)

**Status:** accepted

**Context.** ADR-033 (2026-08-05) reversed CLAUDE.md § 0.1's original
"English only, no exceptions" rule but only changed the rule -- the real
work (STT, TTS, persona, manifests, a live benchmark) was logged in
`docs/BACKLOG.md` as "not built yet." Asked to work through the whole
open list from 2026-08-05's status review, in order, deciding
independently and asking only where a real fork needed the owner's
input. Three such forks were asked up front and answered before any
code was written:
1. Only one PT-PT voice ("Joana," female) is installed on this
   machine -- ship with it now, or wait for a male one. **Owner: ship
   now.**
2. A mixed-language reply -- one voice for the whole response, or
   switch per sentence/segment. **Owner: one voice per whole response**
   (simpler, no risk to CLAUDE.md § 7's latency budget).
3. Add PT-PT paraphrase examples to every skill's manifest now, or wait
   for real SOAK usage to show which ones actually need it. **Owner:
   add to all now**, not the incremental default this session would
   otherwise have picked (CLAUDE.md § 0.6) -- explicit owner call,
   overriding the recommended option.

**Decisions.**
- **`senses/ears`: multilingual STT, not `small.en`.** `WHISPER_MODEL`
  now defaults to the multilingual `small` (`ggml-small-q5_1.bin`,
  already on disk since ADR-026's own earlier, narrower test), `LANGUAGE`
  defaults to `"auto"` -- confirmed real via `whisper-server --help`
  (`-l auto` runs genuine per-utterance language detection, not
  assumed). `small.en` cannot transcribe Portuguese at all, by
  construction; ADR-026's prior "inconclusive-to-worse" multilingual-
  model finding was about one proper noun's phonetic accuracy against
  synthetic English-accented audio, a different, narrower question than
  "can it understand real Portuguese sentences" -- this rule change
  actually requires an answer to the second question, which hadn't been
  tested until now.
- **Live-tested against real synthetic audio (`say -v Joana`/`say -v
  Daniel`), not assumed from the model card:** a scratch `whisper-server`
  instance with the new model correctly transcribed a full Portuguese
  sentence (`language: portuguese`, diacritics correct) and a full
  English sentence (`language: english`) with no errors. **A real,
  known limitation found and documented, not chased further after two
  attempts:** a single English loanword inside a dominant-Portuguese
  sentence ("fazer commit" -- "to commit") gets phonetically absorbed
  into a real Portuguese word ("comité") instead of transcribed as the
  English term. Tried fixing via `WHISPER_INITIAL_PROMPT` (both a
  per-request override and a server-startup prompt, matching the exact
  mechanism that already fixed "Ponta Delgada, Açores" for the
  English-only model) -- neither changed the outcome. Documented as a
  known gap (`docs/BACKLOG.md`) rather than attempting a third,
  increasingly speculative fix; low real cost (a mistranscribed
  loanword still produces a plausible, mostly-correct sentence, not
  silence or a crash).
- **`senses/voice`: new `senses/voice/language.py`, a boring word/
  diacritic scorer, no NLP dependency** (same reasoning as
  `sentences.py`'s regex sentence splitter) -- picks "pt" or "en" once
  per whole reply, from the complete text `main.py`'s `speak_text`
  already receives before splitting into sentences for streamed
  playback, so every sentence in one response uses the same voice
  (owner's choice above). First version used "any diacritic anywhere ->
  pt," found live to misfire on an English reply mentioning one
  Portuguese place name ("Açores") -- fixed by scoring diacritics as
  one point of PT evidence among several, requiring PT evidence to
  strictly outweigh English stopword evidence, not an automatic
  override. `SayBackend.speak()` gained an optional per-call `voice`
  override (`MacSayBackend`, `FakeSayBackend` both updated) rather than
  a constructor-only voice, since the choice is now per-response, not
  per-process.
- **`core/persona.md` gained a `## Language` section**; no skill's own
  `persona.md` needed a change -- `docs/SKILLS.md` § 6's inheritance
  rule ("silent on something, the baseline applies") already covers it,
  and none of the 9 skill fragments said anything English-specific to
  begin with (checked, not assumed).
- **All 9 skills' manifests gained PT-PT paraphrase examples** (owner's
  explicit choice above) -- written the way the owner actually speaks,
  terse/sloppy forms included, matching `docs/SKILLS.md` § 3's existing
  rule applied to a second language for the first time.
- **`core/router/laneClassifier.ts`'s `LANE_CLASSIFIER_SYSTEM` gained
  PT-PT quoted examples inline, alongside their existing English
  counterparts -- not a translation of the prompt itself.** CLAUDE.md
  § 4 governs the prompt's own *instructions* staying English for
  reliability; the quoted example utterances are data the classifier
  needs to see, same status as a manifest's own examples. **Found via a
  new `bench/bench_router_lane_pt.ts`** (same 45 cases as
  `bench_router_lane.ts`, natural PT-PT phrasing, not machine-translated
  word-for-word): baseline PT accuracy was **77.8%**, well under the
  85% bar English clears at 97.8% -- a real, measured gap, exactly what
  `docs/BACKLOG.md` had flagged as untested and worth checking before
  assuming the English-only classifier just worked. All 10 PT failures
  matched an existing English disambiguation rule already in the prompt
  that simply hadn't been shown a Portuguese example of the same
  distinction (e.g. "resume o que acabaste de dizer" -> reflex instead
  of converse, despite the prompt already teaching the identical
  English case "summarise what you just told me" -> converse) -- not
  scattered noise, a precise generalization gap. Added the matching
  PT-PT phrase next to each relevant existing rule, using the real
  failing sentences, not paraphrased guesses. **Re-ran both benchmarks
  after, per ADR-038's own just-learned lesson about verifying a shared-
  prompt edit both ways:** PT-PT rose to **100%** (45/45); English held
  at **97.8%**, identical to the documented pre-change baseline (one
  flaky case, "here's my lunch, help me log it" -> converse, matches
  the existing accepted single-case variance, not a new regression).
- **`bench_skill_routing.ts` gained 6 real PT-PT dispatch cases**
  (paraphrases, not manifest literals) covering `brief`, `shopping_list`
  (add + remove), `weather`, `tasks`, `launcher` -- **93.3%** (28/30),
  clearing the 90% DoD bar. 5/6 PT cases passed cleanly; the one miss
  (`launcher.open_app`, disambiguation said "none" at a 0.648 candidate
  score) is the same shape of near-miss the English suite already has
  one of in this exact run (`shopping_list.add_item` vs `.list_items`
  at 0.680) -- ordinary disambiguation-margin noise, not a language-
  specific gap, and deliberately not chased into
  `DISAMBIGUATION_SYSTEM` given ADR-038's fresh evidence that prompt is
  fragile to edit without extensive rebenchmarking.

**Consequences.**
- 29 Python tests (up from 28: new `senses/voice/tests/test_language.py`
  plus 3 new/updated cases in `test_voice.py`), 285 TS tests unchanged
  (no TS test file touched this ADR), `make check` green.
- Two new committed benchmarks: `bench/bench_router_lane_pt.ts` (PT
  lane-classification regression guard) and `bench_skill_routing.ts`'s
  extended PT dispatch cases -- both re-runnable the moment
  `laneClassifier.ts` or any manifest changes again, closing the loop
  `docs/BACKLOG.md` opened ("worth an early benchmark pass... before
  assuming the English-only classifier handles it").
- **Still owner-required, not verified from this side (PROGRESS.md):**
  real accuracy against the owner's own PT-PT accent and speech
  cadence -- every test above used synthetic `say`-generated audio or
  text-level benchmarks, the same honest limit ADR-026 already named
  for STT work. TTS voice *quality* (does Joana sound acceptable for
  daily use) is a judgment call needing the owner's own ears, not
  something this session can verify from text-level testing.
- Not touched, deliberately: `DISAMBIGUATION_SYSTEM` (ADR-038's fresh
  lesson still holds), and no attempt at segment-level TTS voice
  switching (owner's own choice, whole-response only for now).

## ADR-040 — degraded-mode lane classification: a no-model heuristic replaces trusting the last-resort fallback's JSON

**Status:** accepted

**Context.** ADR-028/ADR-038 left this open: when NIM and all 4 free
APIs fail, `classifyLane`/`disambiguate` fall through to the local
`qwen2.5:0.5b` last resort, which ADR-038 showed doesn't respond
reliably to prompt tweaks. Asked directly what to do about it, with two
real candidate designs plus "leave as is" offered as options. Before
proposing anything, re-verified the actual failure shape live rather
than trusting this same day's earlier, more alarmed framing: an
`outage_sim.ts` script running the exact `try/catch` shape
`core/main.ts`'s `handleUtterance` uses, against a *genuinely* cold
model (`keep_alive=0`, confirmed via `/api/ps` showing no resident
models), found the fallback answers **within the 3s budget, not a 30s
hang** -- the earlier ~30s measurement was a one-off cold-disk-cache
artifact from an unusual test sequence, not steady-state behavior.
Ran twice for consistency (3089ms, 3545ms). The real, confirmed failure
mode is exactly ADR-028's original finding: a fast but *wrong* answer
("add butter to the shopping list" classified `see`), not a hang or
crash -- `core/main.ts`'s existing try/catch already handles the rarer
genuine-timeout case safely (an honest "something went wrong," per live
confirmation this same session).

Owner's choice, from three options (fail honest / no-model heuristic /
leave as-is): **build a no-model heuristic for lane classification**,
same spirit as `providers/rules.ts`'s own `reflex`-lane `RulesProvider`
-- keep some real routing capability during a total outage rather than
either trusting an unreliable model or giving up entirely.

**Decisions.**
- **New `core/router/laneHeuristic.ts`, `classifyLaneHeuristically()`:**
  boring, ordered regex rules (narrowest/highest-consequence lanes
  first: `reflex`, `see`, `act`, `reason`), defaulting to `converse` on
  no match -- deliberately conservative, since `converse`'s own
  fallback already degrades gracefully (SPEC.md § 3) and a wrong
  `reflex`/`see`/`act` guess has real behavioural consequences (a
  skipped confirmation, an opened camera, a `SHELL_EXEC` proposal) that
  a wrong `converse` guess doesn't. Bilingual (ADR-039): every rule has
  an English and PT-PT pattern, mirroring the exact phrases
  `LANE_CLASSIFIER_SYSTEM`'s own prompt was extended with in ADR-039.
  Confidence is a fixed, honest 0.5 always -- never claims certainty a
  keyword match doesn't have.
- **`classifyLane` now tracks which provider actually answered** (a
  local `TraceSink` wrapping the caller's own, composing rather than
  replacing it) and **prefers the heuristic's guess over the model's
  JSON specifically when the answering provider was `ollama`** -- every
  other provider (`nim`, `groq`, `mistral`, `google`, `openrouter`) is
  still trusted as before, unchanged. This is a targeted override at
  the one provider live-verified unreliable at this structured task,
  not a general distrust of local models or a change to the fallback
  chain itself.
- **Live-verified against the real `OllamaProvider`, not just fakes:**
  with a registry containing only `ollama`, `classifyLane("add butter
  to the shopping list")` now returns `converse` (was `see`);
  `classifyLane("falta-nos leite, põe na lista")` (the PT-PT
  equivalent) also correctly returns `converse`; `"stop"` -> `reflex`;
  `"run the tests"` -> `act`. Confirmed with a warm model (the realistic
  steady-state case -- a total-outage conversation has more than one
  utterance in it, the model doesn't reload from scratch every time).

**Consequences.**
- 294 tests total (up from 285: `laneHeuristic.test.ts` plus 3 new
  `laneClassifier.test.ts` cases -- ollama's JSON ignored, heuristic
  fires correctly, a non-ollama provider's answer still trusted as
  before), `make check` green.
- `docs/BACKLOG.md`'s degraded-mode entry updated: the ~30s figure
  corrected to reflect real steady-state behavior (fails within budget,
  not a hang), and the lane-classification half of the problem marked
  built.
- **Not addressed by this ADR, still open:** `disambiguate()` (a
  separate call, ADR-038 already tried and rejected two prompt fixes
  for it) still trusts whichever provider answers, `ollama` included --
  the "peanuts"-style misroute at the disambiguation step, not the lane-
  classification step, remains a real, accepted gap. A heuristic
  disambiguator would need real per-skill logic (not a small, boring
  rule set like lane classification's 5 fixed categories) -- a bigger
  ask, not attempted here without the owner deciding it's worth that
  scope.

## ADR-041 — `clipboard` skill: read/write, both gated, a real lane-declaration bug found and fixed the same day

**Status:** accepted

**Context.** Item 3 of the 2026-08-05 status review's ordered list:
`docs/BACKLOG.md`'s Tier 1 backlog, starting with the items already
flagged as trivial/no-research-needed (`pbpaste`/`pbcopy`, both
built into macOS).

**Decisions.**
- **Both `read_clipboard` and `write_clipboard` go through `SHELL_EXEC`
  (yellow, requires approval), neither is a green auto-run.** Unlike
  `system_health`'s CPU/disk reads (inherently non-sensitive), clipboard
  content is arbitrary and unpredictable -- it could be a password or
  token just copied. `FS_READ`'s whitelist model (CLAUDE.md § 5) exists
  for exactly this reasoning; there's no way to whitelist clipboard
  content in advance since it's different every time, so it isn't
  auto-approved either.
- **`core/executors/clipboard.ts`: `pbpaste` via the existing injectable
  `execFile` pattern (`apps.ts`'s own convention), `pbcopy` via a real
  `spawn` + stdin write** -- `pbcopy` reads from stdin, not args, and
  the promisified `execFile` has no stdin option (that's
  `execFileSync`-only), so this is a genuinely different shape, not
  copy-pasted from `apps.ts`.
- **A real bug found via `bench_skill_routing.ts`, not guessed at:**
  `write_clipboard` was declared `converse`-only; "copy this for me"/
  "put this on my clipboard" actually classify as `act` (the lane
  classifier reads "copy"/"put" as command verbs), making the intent
  unreachable in practice -- confirmed by directly inspecting the real
  embedding candidates (`clipboard.write_clipboard` scored 0.701,
  correctly a top candidate) versus the real dispatched lane (`act`,
  confirmed via a direct `classifyLane` call) before concluding this
  was a lane-declaration gap and not an embedding problem. Same root
  pattern already fixed for `launcher`/`media` (ADR-026) and
  `shopping_list` (ADR-030) -- declared `[converse, act]`, verified
  fixed by re-running the same benchmark (93.8%, up from 90.6%).
  `read_clipboard` stays `converse`-only -- its question-phrased
  examples classify correctly, confirmed rather than assumed.

**Consequences.**
- 11 new tests (`core/executors/tests/clipboard.test.ts`,
  `skills/clipboard/index.test.ts`), `make check` green.
- Live-verified the real `pbcopy`/`pbpaste` round trip outside the
  fake-based tests, including UTF-8/emoji content -- not assumed from
  the fakes passing alone.
- `docs/BACKLOG.md`'s clipboard item marked built.

**Addendum, same day: `capture_screenshot` added to this same skill**
(`docs/BACKLOG.md`'s "Screenshot -> clipboard" item; the OCR half of
that item is a separate, not-yet-researched follow-up, not built here).
`screencapture -i -c` -- interactive selection (the owner drags to pick
a region, on top of the gate's own `SHELL_EXEC` approval -- two real
confirmations before a pixel is captured), straight to the clipboard,
no file ever touches disk.

**A real gap found live, not assumed fixed:** a non-interactive test
capture (`screencapture -c -m`) exited 0, but `osascript -e 'clipboard
info'` showed the clipboard still held stale text afterward, not image
data -- consistent with this machine's Screen Recording permission
(System Settings -> Privacy & Security) not yet being granted to
whatever process runs this. `screencapture` gives no distinguishing
exit code between "captured" and "cancelled/blocked," so the executor
and the skill's spoken response both say "sent," never "captured" --
owner-required to grant the permission and confirm live once done.

**Lane declaration needed both `act` and `see`, not just `act`:** "grab
a screenshot of this for me" classified as `see` (the classifier reads
"grab .. of this" as vision-adjacent phrasing, despite this being a
screen capture, not a camera request) -- confirmed via a real
embedding-candidate check (0.958, an excellent match, filtered out
purely by the lane mismatch) before concluding this was a lane gap and
fixing it the same way as `write_clipboard`'s own fix above.
`bench_skill_routing.ts` now covers this case too; one unrelated flake
seen mid-session (`weather.current_weather` briefly missed, passed
clean on immediate retry) confirmed as live-model run-to-run noise, not
a regression -- `skills/weather` wasn't touched this session.

## ADR-042 — Do Not Disturb / Focus toggle, via Shortcuts.app, not AppleScript

**Status:** accepted

**Context.** Last Tier 1 backlog item asked for this SOAK, after
confirming with the owner whether to continue (yes) and whether he has
smart-home devices (yes, but Home Assistant stays deprioritized, not
built). `docs/BACKLOG.md` already had real research on record
(2026-08-04): direct AppleScript control of Focus modes has no clean
scriptable property, unlike volume/brightness -- re-confirmed rather
than re-litigated before building anything.

**Decisions.**
- **Goes through the Shortcuts app's "Set Focus" action (`shortcuts run
  <name>`), the only Apple-supported automation surface left for Focus
  modes** -- macOS removed the old single Do Not Disturb toggle's
  scriptable property when it introduced the modern Focus system; there
  is no public AppleScript dictionary or `defaults` key for this
  anymore. `/usr/bin/shortcuts` confirmed present on this machine.
- **Real, owner-required one-time setup, same shape as
  `bench/gmail_authorize.ts`'s dance:** the owner creates two named
  Shortcuts.app shortcuts (`JARVIS Focus On`/`JARVIS Focus Off`, each a
  single "Set Focus" action, names overridable via env vars) --
  `README.md`'s new "3d" section has the exact steps. Missing shortcuts
  degrade honestly (`shortcuts run` on a nonexistent name fails with a
  clear "couldn't find the shortcut," reported as-is, not swallowed).
- **A real gap found live, not resolved from this side:** a direct
  interactive-shell `shortcuts run <nonexistent name>` returns almost
  instantly with a clear error. The exact same command through this
  file's own `execFile` call, from a plain Node process, hung with no
  output past 15+ seconds -- stopped manually rather than left running.
  Likely cause, not confirmed (no way to from this side): macOS's TCC
  permission system gating a *new* process's first attempt to drive
  Shortcuts.app, waiting on a system dialog this process can't see or
  click. Documented in the code and README rather than assumed away --
  owner-required: run `core` for real, watch for a permission dialog
  the first time this fires, grant it, confirm live end to end.
- **A second real bug found live, this time in the skill itself, while
  writing its own tests:** the natural single-word reply to this
  skill's own `ctx.ask("Turn Do Not Disturb on or off?")` follow-up
  ("on" or "off" alone) wasn't recognized by `resolveFocusEnabled` --
  only compound phrases ("turn on," "enable") matched. Fixed by adding
  bare "on"/"off" to the pattern, safe specifically because this
  function only ever runs after dispatch has already routed to
  `set_focus_mode` -- a bare "on" elsewhere in the app never reaches
  this code path.
- **Lane declaration reused `media`'s existing `CONTROL_LANES`
  (`converse`, `act`, `reflex`) without incident** -- unlike
  `clipboard`'s two lane-declaration bugs earlier today, this one
  passed `bench_skill_routing.ts` clean on the first try (both an
  English and a PT-PT case), likely because it's declared inside a
  skill whose lane coverage was already hardened by ADR-026's original
  fix.

**Consequences.**
- 12 new tests (`core/executors/tests/focusMode.test.ts`,
  `skills/media/index.test.ts`), `make check` green.
- `docs/BACKLOG.md`'s Do Not Disturb and Focus Mode entries (previously
  two separate bullets) marked built and cross-referenced as the same
  work.
- **Not yet live-verified end to end:** the owner hasn't created the
  real shortcuts yet, and the `execFile` hang means even the mechanism
  itself needs a real, watched first run rather than a blind "should
  work now." This is the least-verified of today's four features for
  exactly that reason -- flagged plainly, not glossed over.

## ADR-043 — full-codebase security + quality review, two real vulnerabilities fixed

**Status:** accepted

**Context.** Asked directly for a full codebase analysis -- code quality,
security, efficiency, not new features -- covering everything built so
far, not just this session's recent work. Two parallel full-codebase
audits (security-focused, quality/efficiency-focused), each ~10.8K
lines across 122 non-test files. Every Critical/High finding was
independently re-verified by reading the actual code myself before
being reported or acted on, not taken on either agent's word alone.

**Findings, Critical and High (fixed same day):**
- **CRITICAL — dashboard approvals were forgeable by any webpage the
  owner had open, or any device on the LAN.** Three compounding gaps,
  each confirmed by reading the code directly: `core/main.ts`'s
  `httpServer.listen()` had no host argument (binds all interfaces, not
  loopback); `core/http.ts` sent `access-control-allow-origin: *` on
  every response; `core/ws.ts`'s `WebSocketServer` had no origin check
  at all and processed `approval.decide` from any connected client with
  zero authentication. `Gate` broadcasts the full `ApprovalRequest`,
  nonce included (`shared/types.ts:115`), to every connected client the
  instant a yellow-tier action is proposed. This directly defeated
  CLAUDE.md § 0.3/§ 5's central premise ("the owner is the only
  executor... nothing performs a side-effecting action without an
  approval recorded first") -- an attacker needed no interaction from
  the owner at all, only an open connection to the port.
- **HIGH — the HMAC signature `Gate.decide()` creates before executing
  was never actually verified.** `verify()` (`core/gate/hmac.ts`) is
  never called anywhere outside its own unit tests, confirmed by grep.
  `apps.ts`'s own docstring and this file's `Executor` type docstring
  both claimed the payload was "already-verified" by the time an
  executor sees it; `SPEC.md § 8` documents this as the real contract,
  specifically because a future out-of-process executor (an n8n
  webhook, ROADMAP Phase 13) will genuinely need it. Not independently
  exploitable today (single process, no untrusted transport between
  `sign()` and the executor call) -- but the documented defense-in-depth
  didn't exist at runtime, and every comment claiming it did was wrong.

**Fixes.**
- `core/main.ts` binds `127.0.0.1` explicitly. `core/http.ts` gained
  `ALLOWED_ORIGIN` (env-overridable via `JARVIS_DASHBOARD_ORIGIN`,
  defaults to `ui/`'s real Next.js port) replacing the wildcard.
  `core/ws.ts`'s `WebSocketServer` gained a `verifyClient` checking
  `Origin` against the same value (real `ws` API, confirmed against
  `@types/ws`'s own `.d.ts`, not guessed). New `core/tests/
  dashboardAuth.test.ts` proves both directions against a real HTTP
  server + real `ws` client on an ephemeral port (no fakes) -- the
  wrong origin is rejected, the right one is accepted, the CORS header
  is the real origin, never `*`. Noted as a browser-enforced check, not
  a cryptographic one (a raw non-browser client can still lie about its
  Origin header) -- a shared local auth token would be real
  defense-in-depth on top of this, tracked as a follow-up, not
  blocking, since this fix closes the actual live exploit path (a
  webpage forging an approval with zero interaction).
- `Gate.decide()` now calls `verify()` and fails closed
  (`execution_failed`, audited, resolves `{ok: false, reason: "error"}`)
  before invoking any executor. All 17 existing `Gate` tests pass
  unchanged -- `verify()` always succeeds against a payload signed two
  lines above with the same key in the current architecture, so this is
  defense against a future refactor silently breaking the invariant
  (or the executor boundary eventually moving out-of-process), not a
  currently-reachable bug fix.

**Other findings, not yet acted on (owner to prioritize):** `FS_READ`'s
whitelist (`~/.ssh`, `.env`, etc. "never readable") is asserted in
CLAUDE.md § 5 but has zero code implementation -- no `ctx.fs` gated
accessor exists at all; skills can technically bypass the gate entirely
via direct `node:child_process`/`node:fs` imports (only importing
`core/executors/**` is lint-blocked, confirmed real and correctly
enforced) -- today an architectural trade-off, not an active
vulnerability (every real skill reviewed goes through `ctx.propose()`
correctly); a real grammar bug in `skills/media/index.ts`'s
`speechForOutcome` ("Okay, didn't turned Do Not Disturb on.") is pinned
as the expected string in its own tests; `core/gate/gate.ts`'s nonce
comparison isn't timing-safe (moot until the dashboard fix above,
matters more now that it's fixed); an entire dead file
(`core/skills/conversation/cli.ts`); duplication of an extraction+NONE
pattern across 5 skills; two files with no dedicated test despite
having no external dependency (`core/skills/registry.ts`'s
`loadAll()`/`dispatch()`, `core/dashboardHistory.ts`). Full detail
reported via `ReportFindings` in the conversation, not duplicated here.

**Consequences.**
- 332 tests total (up from 329: 3 new `dashboardAuth.test.ts` cases),
  `make check` green.
- Both audits confirmed, independently, that command injection across
  every `execFile`/`spawn` call site is correctly defended (argv arrays
  throughout, no shell string interpolation anywhere), the audit log is
  genuinely append-only (DB-level triggers, not convention), approval
  replay/expiry are real server-side checks, OAuth/MCP tokens are never
  logged and only the refresh token is persisted (Keychain only), and
  secrets hygiene across the repo is clean (no hardcoded keys, no
  secret-shaped `console.log`s, `.gitignore` correctly scoped). Not
  re-litigated here -- worth recording that the platform's core
  patterns (executors, audit log, capability tiers) are sound; the two
  fixed bugs were real gaps in specific, narrow places, not signs of a
  systemically weak foundation.

## ADR-044 — closing out the full-codebase review: all 9 remaining findings fixed

**Status:** accepted

**Context.** Asked to keep going after ADR-043's Critical/High fixes --
every remaining medium/low finding from the same review, in one
continuous pass. All 9 fixed; none deferred.

**Fixes, in the order done.**
- **Nonce comparison, timing-safe.** `Gate.decide()`'s `row.nonce !==
  response.nonce` replaced with `hmac.ts`'s own (now exported)
  `timingSafeEqualStrings` -- one implementation of the fix, not two.
- **Dead code removed.** `core/skills/conversation/cli.ts` (zero real
  importers since `conversation/ipc.ts` shipped, confirmed by grep) --
  deleted; `core/skills/types.ts`'s stale docstring (still describing
  it as the seam for future wiring, when real wiring has existed for
  several phases) corrected.
- **A real grammar bug fixed, not just documented.**
  `skills/media/index.ts`'s `speechForOutcome` reused one past-tense
  label for both "Done -- X." and "didn't X" -- produced "Okay, didn't
  turned Do Not Disturb on." on every rejected media/focus-mode action,
  pinned as the expected string in this skill's own tests until now.
  Now takes an optional base-form label (defaults to the past-tense one
  where a single form already works both ways, e.g. "set volume to
  80"). `humanSummary` also switched to the base form -- "Resume
  playback (Spotify)" reads correctly as a pending-approval preview,
  "Resumed playback (Spotify)" didn't.
- **Extraction+NONE duplication shared.** New `skills/_shared/
  extract.ts` (`extractOrNull`, `extractLines`) replaces five
  independent reimplementations (`launcher`, `tasks`, `shopping_list`,
  `clipboard`, `gmail`) of "call the model, NONE means nothing found" --
  already-drifted differences (punctuation stripping, error-catching)
  made into explicit options instead of silent divergence. Each
  skill's own test suite run individually after its refactor, before
  moving to the next, to keep the change behavior-preserving throughout.
  `skills/media`'s numeric `extractLevel` stays separate on purpose --
  different enough a job that folding it in would strain the options
  shape.
- **Two real coverage gaps closed, one surfaced a real bug while
  writing the test.** `core/dashboardHistory.ts` (pure in-memory ring
  buffer, no external dependency, had zero tests) -- straightforward.
  `SkillRegistry.loadAll()`/`dispatch()` (the pieces it composes are
  each tested, the aggregation logic wasn't) -- while building a
  duplicate-manifest-id test case, found the real behavior was a
  silent overwrite in `skillsById` with `report.loaded` still listing
  the id twice, no way to tell which skill was actually reachable.
  Fixed: a duplicate id is now reported disabled (the second declarer
  loses), never silently dropped; `health` re-keyed by module path
  (not skill id) so the disabled entry can't collide with and hide the
  original's healthy one; `skillsById` now cleared at the start of
  `loadAll()` too (previously only `health` was, so a second call on
  the same instance left earlier skills dispatch-reachable after
  `listHealth()` stopped listing them).
- **`FS_READ`'s whitelist actually implemented**, the biggest piece:
  new `core/skills/fs.ts` (`createGatedFs`), a real `ctx.fs` on
  `SkillContext` enforcing CLAUDE.md § 5's denylist (`~/.ssh`, `~/.aws`,
  `.env`, `*secret*`/`*credential*`, checked first, always) plus a
  per-wiring allowed-roots whitelist. `core/main.ts` wires the one real
  root that exists today (`skills/launcher`'s own `PROJECTS_ROOT`,
  exported from there rather than duplicated). **A second real bug
  found live while writing this file's own tests, not assumed safe:**
  a symlink inside an allowed root pointing outside it passed a
  lexical-only (`path.resolve()`) containment check while the OS still
  followed the link on the actual read -- fixed with `realpathSync`
  resolving through symlinks before both the denylist and whitelist
  checks run. **A third bug, found migrating the one real consumer:**
  switching `skills/launcher` from raw `readdirSync` to `ctx.fs.listDir`
  initially lost the directories-only filter its original code had
  (`listDir` returned bare names, no type info) -- fixed by having
  `listDir` return `{name, isDirectory}` instead of a plain string,
  still "names, not contents," just enough type info to filter
  correctly.
- **A fourth, unrelated drift bug found and fixed while wiring `ctx.fs`
  everywhere it's needed:** `core/skills/scaffold.ts`'s own
  `make new-skill` template still didn't include the `mcp` field
  `SkillContext` gained in ADR-035 -- a newly scaffolded skill's
  generated test would have failed to compile. Fixed the template and
  the one already-generated file (`tests/generated/wardrobe.test.ts`)
  that had been hand-patched with `mcp` after generation but would
  still have been missing `fs`.

**Consequences.**
- 359 tests total (up from 332 after ADR-043), `make check` green
  throughout -- every fix run and verified individually before moving
  to the next, not batched and checked once at the end.
- Every finding from the original review is now either fixed (all 9
  covered here, plus the 2 from ADR-043) or -- there are no more
  deferred items. `docs/BACKLOG.md`'s review-findings note updated to
  reflect this.
- Real, live verification beyond the test suite: `ctx.fs` checked
  against the owner's actual `~/Developer/Programação` directory
  (real project names listed correctly) and a real `~/.ssh` denial,
  outside the fake-based tests.

---

## ADR-045 — Phase 8 Tasks 1-2: `senses/eyes`, camera wiring, vision providers

**Status:** accepted

**Context.** Phase 8 (`ROADMAP.md`), planned and approved as its own
plan document per `CLAUDE.md` § 1's phase discipline. Task 1 built the
camera daemon; Task 2 wired it into `core` and gave the `see` lane two
real providers. Full plan context (NIM-vs-local hardware reasoning,
`RulesProvider` dead-code finding, `CameraEvent`/`ServerEvent` overlap)
already summarized in the plan itself and in `PROGRESS.md`'s Phase 8
log; this ADR records the decisions made *while building* that weren't
fully settled by the plan.

**Decisions.**

- **Frames are ephemeral by construction, not by a `keepFrameIds`
  round-trip.** The plan's own Task 1.4 text sketched `close()` passing
  "frames to keep" back to eyes. Building it exposed a real race:
  `senses/eyes/main.py`'s `check_timeouts_forever` can self-close a
  session (idle or absolute cap) with no request from `core` at all, at
  any point after a capture -- there is no reliable moment for `core`
  to tell eyes "keep this one" before it may already be gone, especially
  since a `MEMORY_WRITE` approval can sit pending far longer than the
  120s idle default. Fixed by moving durability *earlier*: a skill that
  wants to keep what it saw copies the frame's bytes to a permanent
  location (`data/observations/`) immediately after `capture()`, before
  ever proposing the write -- decoupling "the image survives" from
  "eyes hasn't gotten around to deleting the session yet." `shared/
  types.ts`'s `CameraSession.close(): Promise<void>` keeps its original,
  no-argument signature; eyes' own `close` handling stays unconditional
  delete-all, exactly as Task 1 already shipped it. See
  `core/skills/camera.ts`'s docstring and `skills/look/index.ts`.
- **`CameraEvent`'s `camera.captured` variant gained a `path` field.**
  The plan's Context claimed `shared/types.ts`'s camera types were
  already a decided contract; building `senses/eyes/main.py` (Task 1)
  showed the wire event always carried the captured file's path (needed
  for anything to actually use the frame), but the pre-existing type
  didn't declare it. A real, necessary correction, not a redesign --
  fixed in both `shared/types.ts` and `ui/src/lib/types.ts`'s mirror.
- **NIM vision model: `meta/llama-3.2-11b-vision-instruct`, live-confirmed,
  not guessed.** Queried the real `/v1/models` endpoint with the owner's
  own key (2026-08-06) rather than trusting search results or training
  data -- this project has been burned more than once assuming a
  provider's exact model string ahead of checking it live (Cerebras,
  OpenRouter, Google AI Studio names, `wiring.ts`'s own docstring).
  Smoke-tested end to end against a real generated JPEG through
  `/chat/completions` before writing any code against it -- confirmed
  the `image_url`/base64-data-URI request shape and a correct reply.
- **`routeVision()` (new, `core/router/router.ts`) mirrors `routeChat()`'s
  fallback/trace shape, simplified for a single non-streaming result.**
  No "already yielded output, don't fall back" case applies (vision
  either answers or it doesn't -- nothing is spoken until the full
  qualitative description returns), so it's a smaller function, not a
  generalized/parameterized merge with `routeChat()`. `see` lane order:
  `nim` before `ollama` -- ADR-001's already-accepted finding (this 8GB
  M1 can't reliably run even a 4B *text* model) generalizes to "unlikely
  to win" for a heavier vision-language model; `ollama`'s `vision()` (it
  turned out to already exist, built ahead of schedule in Phase 3, only
  needed tests) stays registered as a real second option, not removed,
  so it's a genuine benchmarked fallback rather than an assumption.
- **`MEMORY_WRITE`'s executor is now `payload.kind`-dispatched
  (`"fact" | "observation"`)**, same shape `core/executors/shell.ts`
  already uses for `SHELL_EXEC`'s several actions, rather than a new
  capability or a second `Executor` slot (`Gate` holds exactly one
  `Executor` per `Capability`, `core/executors/README.md`). Both
  existing fact-writing call sites (`factExtraction.ts`, `skills/
  weather`) needed one added field (`kind: "fact"`) -- the only breaking
  change, exactly as the plan predicted.
- **Capability enforcement for `CAMERA` happens at the dispatch call
  site in `core/main.ts`, not inside `camera.ts` or `context.ts`.**
  `core/main.ts` already has `skillRegistry` and therefore each skill's
  manifest at the point it builds that dispatch's `SkillContext`:
  `skill?.manifest.capabilities.includes("CAMERA") ? cameraHandle :
  undefined`. `buildSkillContext` itself just falls back to the existing
  throwing stub when `deps.camera` is absent -- identical shape to how
  `mcp`/`gate`/`fsRoots` already work, no new lookup logic added to
  `context.ts`.
- **`eyes` is optional at `core` boot, unlike `ears`/`voice`.** A failed
  connection is caught and logged, not fatal -- `eyes` is on-demand
  (`SPEC.md` § 2: "launchd, idle"), so `core` (and every non-camera
  skill) must keep working without it. A handful of quick connection
  attempts (3 × 500ms), not the full ears/voice retry budget.

**Consequences.**
- `senses/eyes`: 19 pytest tests, `ruff` clean. Two real Python bugs
  caught by manual review before ever running a test (see `PROGRESS.md`'s
  Phase 8 log) -- a leftover `field()` line invalid outside a
  `@dataclass`, and a mutable/direct-imported config value used as a
  parameter default (binds once at import time, silently defeats
  `monkeypatch`).
- Core/TS side: 374 `node --test` cases (up from 359), `tsc`/`ruff`/
  ESLint/UI build all green. New coverage: `NimProvider.vision()` (5
  tests), `OllamaProvider.vision()` (3 tests, closing a real pre-existing
  gap), `routeVision()` (5 tests), the `MEMORY_WRITE` observation branch
  (3 tests).
- One stale test fixed in the same pass: `factExtraction.test.ts`
  asserted the pre-`kind`-field payload shape.
- `skills/look` (the skill that actually uses any of this) is Task 3,
  not yet built as of this ADR.

**Addendum, same day: Tasks 3-4 built, then a real live-verification
pass (real camera, real NIM vision, real dashboard via Playwright)
found and fixed four more real bugs the unit test suite never could
have caught.**

`skills/look` (Task 3: `open_camera`/`close_camera`/`describe`) and the
dashboard camera indicator (Task 4: `use-jarvis.ts` + `status-bar.tsx`)
built and unit-tested clean on the first pass -- no bugs found writing
them, per `PROGRESS.md`'s own log. The real bugs only surfaced once the
*actual* stack ran: `senses/eyes` as a real subprocess, a real macOS
camera capture, a real NIM vision call, `core` wired to all of it, and
Playwright driving the real dashboard against that real `core` --
`make dev`'s own missing `senses.eyes.main` line (fixed the same pass)
had silently meant this exact combination was never once exercised
before.

**Found and fixed, in the order discovered:**

1. **Wire-protocol unit mismatch.** `senses/eyes/main.py` sent
   `expiresAt` as epoch-*seconds* (`time.time()`'s own convention);
   every other timestamp on the wire (`shared/types.ts`, `Date.now()`
   throughout) is epoch-*milliseconds*. The dashboard's own countdown
   read a real 600-second-away session as "0s". No test anywhere
   asserted on this field's value, only its presence. Fixed at the wire
   boundary in `main.py` (`round(expires_at * 1000)`); internal
   timeout math stays in seconds, matching `time.time()`. Two new
   pytest assertions lock in the millisecond scale.
2. **Lane-filter dead intent.** A bare "what is this" classified as
   `converse`, not `see` -- confirmed live via the Thought Stream
   showing `[CONVERSE] converse: no skill matched, falling back to
   general conversation`, meaning the general-conversation fallback
   *fabricated a plausible-sounding answer* ("This is the dashboard
   for the skills I'm currently running") with zero camera involvement
   at all, silently. `core/skills/dispatch.ts` filters skill candidates
   to the classified lane before the embedding match ever runs, so
   `describe`'s `lanes: ["see"]`-only declaration made it structurally
   unreachable for that phrasing regardless of how well it scored.
   Identical root cause and identical fix to `media.now_playing`
   (ADR-026/030): declare `["see", "converse"]`. Re-verified live --
   correctly dispatches now, `[SEE] see: dispatched look.describe
   (disambiguated)` on a second real run.
3. **Fixed vision prompt ignored the actual question.** ROADMAP.md's
   Phase 8 DoD names three things `look` should do: describe, identify,
   and *answer a question about what is visible*. The first version's
   `DESCRIBE_PROMPT` was one fixed string regardless of what the owner
   said -- asking "is there a person visible in this room" would have
   gotten the same generic description as "what is this." Fixed by
   folding `input.utterance` into the prompt. Live-verified: the same
   question above got a real, specific, correct answer about an
   actual person in frame.
4. **Timeout closed silently.** SPEC.md § 6 and ROADMAP.md's DoD both
   say idle/absolute timeout must be *announced*; `relayCameraStatus`
   broadcast the dashboard event but never called `conversation.say()`.
   Fixed with a plain-language announcement on any self-triggered
   (`cause !== "owner"`) close, spoken and added to the transcript.
   Live-verified with an 8s idle timeout: "The camera timed out from
   being idle and closed." appeared in the real conversation log at
   the real moment the real session expired.

**Two more real findings, deliberately not fixed this phase (scope
discipline, `docs/BACKLOG.md` has both in full):** a rejected/expired
observation proposal's durable image copy is never cleaned up (a slow
disk leak, not a security issue); and the dashboard test console's
fire-and-forget utterance handling can cross-wire `camera.ts`'s
single-pending-request correlator if two utterances are injected
faster than a skill turn completes -- reproduced once, then confirmed
it requires unrealistic (sub-second, scripted) pacing and is not
reachable from real voice input (`ears`'s own loop awaits each
utterance sequentially). `ctx.ask()`'s identical correlator shape has
the same latent assumption, unfixed for the same reason.

**Also found and fixed in passing:** `data/observations/` (the new
durable-copy directory) wasn't in `.gitignore` -- two real captures
from this exact testing showed up as untracked files.

Full live-verification trail -- the standalone `senses/eyes` subprocess
test (real socket protocol, honest `CameraPermissionError` before
permission was granted), the real NIM and Ollama vision calls side by
side (`moondream` returned empty output on the production prompt but
answered correctly on a simpler one -- a real, measured data point
behind this phase's NIM-primary decision, not just ADR-001's
a-priori hardware hypothesis), and the full core+eyes+dashboard
Playwright run -- recorded in `PROGRESS.md`'s Phase 8 closing log.

---

## ADR-046 — `APP_CONTROL`: a new green capability, and the `Gate.propose()` bug it exposed

**Status:** accepted

**Context.** Pedro used the real, live `make dev` stack the night Phase 8
closed and hit three real bugs (no "what can you do" skill, a weather
lane misroute, an unlogged `ask()` timeout) plus gave a direct product
instruction: opening/closing apps should no longer need a per-action
approval click; only a genuinely destructive action (none exist yet)
should stay gated. Full bug list and evidence trail in `PROGRESS.md`.
This ADR covers the capability-tier decision and the real bug building
it exposed; the three smaller live-testing bugs are logged there, not
here, since they're not architectural decisions.

**Decisions.**

- **`APP_CONTROL`, new green capability, narrowly scoped to
  opening/closing an app, project, or website.** `open_app`/
  `open_project`/`open_url` (already existed) and the new `close_app`
  moved off `SHELL_EXEC`. Deliberately does *not* widen to the rest of
  `SHELL_EXEC` -- media control, volume/brightness, clipboard
  read/write, and screenshots stay yellow, since they can expose or
  change something the owner can't immediately see and undo the way a
  window appearing/disappearing can. `CLAUDE.md` § 5's own capability
  table updated in the same commit -- the table is supposed to be the
  live, accurate policy, not a historical snapshot.
- **A real, previously-latent bug found building this:
  `Gate.propose()`'s green-tier branch never called the registered
  executor.** It audit-logged `"green_auto_run"` and returned `{ok:
  true, result: action.payload}` unconditionally -- the *raw proposed
  payload*, not any real result, and critically never invoked
  `this.executors[capability]` at all. This was invisible until now
  because no green capability before `APP_CONTROL` needed a real
  executor: `CAMERA`/`MEMORY_READ`/`FS_READ`/`NET_READ` are all reached
  directly (`ctx.camera`, `ctx.memory`, `ctx.fs`, a plain `fetch` in
  skill code), never through `propose()`. The gap was covered by an
  existing test (`"a green-tier action runs unprompted and is still
  logged"`), but that test uses `MEMORY_READ` with no registered
  executor on the test `Gate` instance -- it exercised the *tier logic*
  faithfully, just never the *executor-invocation* path, because
  nothing in the whole codebase had ever needed that combination
  before. Fixed to mirror `decide()`'s own executor-invocation shape
  (try/catch, `executed`/`execution_failed` audit events, honest
  `ok:false` on real failure) minus the approval-row/nonce/signature
  machinery green tier has no use for. Three new tests lock in the
  fixed behavior (success, executor failure, executor throws).
- **`close_app` via `osascript 'tell application X to quit'`, not
  `pkill`.** A graceful quit (lets the app prompt to save, run its own
  shutdown handlers) over a bare signal. `execFile` array args throughout
  (`apps.ts`'s own established pattern) means no shell is ever invoked;
  the one AppleScript-specific risk (a literal `"` in an app name
  breaking out of the quoted string) is rejected outright rather than
  escaped, since a real macOS app name never legitimately contains one.
- **A second real bug found live-testing `close_app` itself, not
  written in this ADR's first draft:** "close Calculator" classified as
  `reflex` (the lane classifier's own reflex examples include "stop,
  cancel, pause" -- "close" reads close enough), and without `reflex`
  declared on `close_app`, `dispatch.ts`'s lane filter dropped it from
  the candidate list before the embedding match ever ran --
  disambiguation then picked `media.pause_music` instead (it does
  declare `reflex`), a live, real misroute that tried to pause Spotify
  in response to "close Calculator." First looked like a hang (the
  resulting `SHELL_EXEC` proposal correctly, silently waited for a real
  approval that nothing was providing -- yellow tier working exactly as
  designed, not a bug); root-caused by adding temporary debug logging
  to `launcher`'s own `close_app` case, confirming it was never reached
  at all. Fixed the same way as every other lane gap this phase:
  declare the lane it actually lands on (`["converse", "act",
  "reflex"]`).

**Consequences.**
- `shared/types.ts` and `ui/src/lib/types.ts` (hand-kept mirror) both
  gained `APP_CONTROL`; `core/skills/loader.ts`'s `VALID_CAPABILITIES_SET`
  (a `Record<Capability, true>`, ADR-035's own drift guard) caught the
  missing key as a real compile error, exactly as designed.
- `core/executors/shell.ts` lost its now-dead `open_app`/`open_url`
  cases; new `core/executors/appControl.ts` dispatches `open_app`/
  `close_app`/`open_url` for the new capability, reusing `apps.ts`/
  `browser.ts`'s existing executors unchanged.
- `skills/launcher`'s `speechForOutcome` simplified: `rejected`/
  `expired` outcomes are now structurally unreachable for anything
  routed through `APP_CONTROL` (green tier never produces them), so
  those branches were removed rather than left as dead code.
- 25 new tests total across this change and the three smaller
  live-testing fixes (`about`, `appControl`, `apps` close_app, `gate`
  green+executor, `launcher` close_app). 399 tests, `make check` green
  throughout. Live-verified end to end against a fresh isolated
  instance -- real `open Calculator`/`close Calculator` via the actual
  `osascript`/`open` calls, zero pending approvals either time, real
  process confirmed gone after close.

## ADR-047 — GitHub as the second real MCP server; extracted the shared skill helper

**Status:** accepted

**Context.** 2026-08-08: after real end-to-end voice+camera testing (see
`PROGRESS.md`'s dated entries) and fixing the two bugs it found (`core`
sense-reconnect resilience, orphaned observation files), the owner asked
for the full backlog to be organized and analyzed toward making JARVIS
"cada vez mais poderoso e inteligente... que saiba trabalhar em tudo o que
seja tecnologia." Presented the organized backlog (ROADMAP Phases 9-13
plus every `docs/BACKLOG.md` track, including the new Personal Knowledge
Brain idea logged that same day); the owner chose generalizing the MCP
tool layer over continuing straight to Phase 9, with GitHub as the first
new server (most aligned with the stated goal) and explicitly kept
`MCP_TOOL_CALL`'s capability tiering exactly as ADR-035 left it (every
call yellow, no per-tool allowlist) despite fresh same-night evidence of
real approval fatigue -- owner's own call, to revisit later with more
usage data.

Explored the existing MCP layer before planning rather than assuming --
it was already far more generic than expected. `core/mcp/registry.ts`,
`core/executors/mcp.ts`, `SkillContext.mcp`, and the `MCP_TOOL_CALL`
capability/Gate wiring were all already fully server-agnostic (ADR-035
built them for Gmail with this in mind). What was genuinely missing: no
non-Google auth path existed (Gmail's whole `googleOAuth.ts` module is
Google-specific), and the propose/outcome-handling shape
`skills/gmail/index.ts` used was written inline, never extracted for a
second skill to reuse. Confirmed live via web search (2026-08-08, not
guessed -- this project has been burned guessing third-party API details
before): GitHub's official remote MCP server
(`https://api.githubcopilot.com/mcp/`) is free with a personal access
token, `Authorization: Bearer <PAT>` over Streamable-HTTP -- the exact
transport `realConnect()` already speaks, and a PAT is a single static
secret through the *existing*, already-generic `getKeychainSecret()`
(`core/router/keychain.ts`), needing no new auth module at all.

**Decisions.**

- **`core/mcp/setup.ts` registers `github` the same imperative way it
  registers `gmail`** -- one `tryKeychainSecret("jarvis-github-pat")` +
  one `registry.register({...})` call, degrading to "not configured" on
  a missing secret. Deliberately did not generalize this into a
  config-driven server list (a fixed, hand-curated set of servers is the
  same explicit-registration philosophy `core/skills/registered.ts`
  already uses for skills, ADR-035's own stated choice) -- two servers
  isn't enough evidence a config format is worth the abstraction yet.
- **New `skills/_shared/mcpTool.ts`**: `requireMcpServer()` and
  `proposeMcpTool()` extract only the mechanical, identical-every-time
  half of an MCP-backed skill (the connectivity check and the four-way
  ok/rejected/expired/error branch) -- tool-matching and argument-
  building stay in each skill, since those differ per server by design
  and a one-size-fits-all helper would hide the "don't guess a
  third-party server's tool names or argument shape" reasoning each
  skill needs. `skills/gmail/index.ts` refactored to use both helpers in
  the same change that introduced them, proving real reuse on day one
  rather than a speculative abstraction -- `skills/gmail/index.test.ts`
  passes unchanged in behavior.
- **`skills/github`: one intent, `list_repos`**, matching Gmail's own
  minimal-start precedent (`check_email` was its only intent too).
  `findRepoListTool()` pattern-matches the real tool catalogue at
  runtime (never a hardcoded tool name, same discipline
  `skills/gmail`'s `findSearchTool` established) and
  `hasNoRequiredArgs()` refuses to call a tool needing an argument this
  skill has no value for, rather than guessing one blind.
- **`docs/SKILLS.md` gained a new § 5b** documenting the MCP-backed-skill
  pattern -- confirmed via exploration that zero mentions of MCP existed
  in that doc before this, despite the pattern already existing in code
  since ADR-035. Closes a real authoring-doc gap while there are two
  real examples to point at instead of one.
- **README gained a new § 3d** (GitHub PAT setup, fine-grained token,
  read-only scopes) -- existing § 3d (Do Not Disturb/Focus toggle)
  renumbered to § 3e. The stale `docs/BACKLOG.md` pointer to "README's
  3d" for that section was updated in the same change.

**Consequences.**
- `core/skills/registered.ts` gained `skills/github/index.ts` -- 13
  skills loaded now, up from 12.
- 17 new tests (`skills/_shared/mcpTool.test.ts`: 7; `skills/github/
  index.test.ts`: 10). 427 tests total, `make check` green throughout.
- Live-verified against a fresh isolated `core` instance, no GitHub PAT
  in Keychain: `core: github MCP server not configured (...)` logged,
  `core` boots fine, `github` skill loads normally -- same graceful-
  degradation shape Gmail's own missing-secret path already has.
  Injected a real "what are my repos" utterance over the real WebSocket
  (`utterance.inject`, not just a unit test): correctly dispatched to
  `github.list_repos` (real lane classification + embedding match, not
  scripted) and spoke the honest not-connected fallback.
- **Owner-required, not yet done:** a real GitHub PAT in Keychain, and
  confirming a real `tools/list`/`list_repositories` call against live
  data -- this is the first real proof the whole `MCP_TOOL_CALL`
  pipeline works end to end against a third-party server's live data,
  since Gmail itself never got that far (blocked by Google's own bug,
  ADR-037). `REPO_LIST_PATTERN` may need adjusting once the real tool
  catalogue is visible -- GitHub's server exposes far more tools than
  Gmail's, so the regex is a reasonable guess, not a verified match yet.

## ADR-048 — Permanent benchmark regression gate

**Status:** accepted

**Context.** `docs/BACKLOG.md` flagged this idea since at least ADR-024/
ADR-026, when an added few-shot example and a manifest-example collision
each silently regressed real routing accuracy by several points while
still clearing each benchmark's fixed absolute floor (85%/90%) --  caught
both times only because someone happened to rerun the benchmark by hand.
Built for real 2026-08-08 while the owner asked to keep progressing on
work that doesn't need him, tracking what does.

**Decisions.**

- **Compare against a recorded baseline, not just the floor.**
  `bench/_shared/regressionGate.ts`'s `checkGate()` fails a run that
  drops more than `REGRESSION_TOLERANCE_PCT` (1.0) below
  `bench/baseline.json`'s recorded score for that benchmark, even while
  the run still clears the floor -- the floor alone is exactly what let
  both prior regressions through undetected.
- **Never wired into `make check`.** All three routing-accuracy
  benchmarks (`bench_router_lane.ts`, `bench_router_lane_pt.ts`,
  `bench_skill_routing.ts`) make real NIM/Ollama calls and spend real API
  quota -- `make check` has never done that (CLAUDE.md § 3). New `make
  bench-gate` target runs all three by hand, meant to be run deliberately
  before shipping a `laneClassifier.ts`/`dispatch.ts`/manifest-examples
  change, not on every commit. The gate's own comparison *logic* is a
  pure function over numbers, though, so it's fully offline-testable --
  8 new tests, `bench/**/*.test.ts` joined `make check`'s glob.
- **`bench_skill_routing`'s baseline (88.6) is deliberately set at the
  low end of its own documented natural variance, not its typical
  91%+ run.** Confirmed live, 2026-08-07: three consecutive same-night
  runs with zero code changes between them landed 91.4% / 88.6% / 91.4%,
  attributable to `disambiguate()`'s own LLM-call reliability under heavy
  real API usage (ADR-038), not a regression. A tight baseline on this
  specific benchmark would make the gate cry wolf on ordinary variance;
  the other two benchmarks (deterministic embedding scores, confirmed via
  a real 5x-repeat self-similarity test at 1.000000 every time) get a
  tight baseline at their real, stable numbers (97.8%, 100%).
- **Baseline updates are a separate, deliberate CLI step
  (`bench/update_baseline.ts`), never automatic on a passing/improved
  run.** Auto-updating on every improved run would let a regression that
  still happens to clear the floor quietly become the new "normal" the
  next time it's also the best run of the day -- same "a trust decision
  needs a human, not a script" reasoning already applied to MCP tool
  tiering (`docs/BACKLOG.md`) and fact/quantity confidence
  (CLAUDE.md § 0.5).

**Consequences.**
- `bench/baseline.json` seeded from the real, already-documented numbers
  in `PROGRESS.md`'s own "Key numbers" table -- not re-measured live
  tonight (would spend real API quota to re-confirm numbers already on
  record with no new information).
- 8 new tests, 435 total, `make check` green throughout. Not yet run for
  real against live NIM/Ollama calls -- first real run happens naturally
  the next time a routing-relevant change needs benchmarking, which is
  the gate's actual job.

## ADR-049 — Reviewable routing-misses list; first real schema migration

**Status:** accepted

**Context.** `docs/BACKLOG.md` flagged this since the external-project
research pass (thevickypedia/Jarvis dumps every unrecognized phrase to a
file for later review) — this project had the *data* (`routing_stats`
records every dispatch decision) but not the owner's actual utterance
text for a `no_skill_matched` row, only that one happened. Built
2026-08-08 while the owner asked to keep progressing on work that
doesn't need him.

**Decisions.**

- **Join against `events` at read time via a new `event_id` column,
  rather than duplicating utterance text into `routing_stats`.** Single
  source of truth for what was actually said; `routing_stats` stays a
  denormalized *metrics* table (per its own existing docstring reasoning
  in `db.ts`), not a second copy of conversation content.
- **This is the project's first real schema migration on an
  already-populated table.** Every prior table change so far was either
  a brand-new table or happened before real data existed. `ALTER TABLE
  ADD COLUMN` is not idempotent (a second run throws "duplicate column
  name"), so `ensureRoutingStatsEventIdColumn()` checks via `PRAGMA
  table_info` first rather than swallowing every possible error in a
  try/catch — an explicit existence check, not a guess that a caught
  error means "already migrated." Runs unconditionally on every
  `openDb()` call, same as the `CREATE TABLE IF NOT EXISTS` statements
  it sits next to.
- **Verified against a real copy of the owner's own `data/jarvis.db`,
  not just a synthetic in-memory test**, given this touches real
  production data for the first time this way: copied the real file (39
  actual `routing_stats` rows) to a scratch location, ran the real
  migration twice (confirming idempotency against real data, not just
  the synthetic file-based test), confirmed all 39 rows survived, and
  confirmed the new `recentRoutingMisses()` correctly returns them with
  an honestly-`null` utterance (pre-migration rows have nothing to join
  against — shown as unknown, never guessed, per CLAUDE.md § 0.5's
  spirit applied to missing data, not just numbers). The owner's real
  file itself was never touched directly by this verification; the
  migration applies naturally the next time `core` boots against it.
- **No dashboard UI panel built.** The backend/endpoint (`GET /api/
  routing-misses`) was the actual gap `docs/BACKLOG.md` flagged — a
  reviewable list for closing routing gaps by reading it, which this
  session (and any future one) can already do via `curl`. A UI panel is
  real, separate scope, flagged as a natural follow-up rather than
  built speculatively now.

**Consequences.**
- `core/memory/db.ts`, `core/memory/routingStats.ts`, `core/memory/
  memory.ts`, `core/main.ts` (passes `eventId: utteranceEvent.id` into
  `recordRoutingStat`), `core/http.ts` (`GET /api/routing-misses`).
- 5 new tests (440 total), `make check` green throughout — including a
  real-file-based migration-idempotency test (`core/memory/tests/
  db.test.ts`), not just an in-memory one, since `:memory:` databases
  can't actually exercise "reopen the same real file twice."

## ADR-050 — Batched, idle-triggered fact extraction

**Status:** accepted

**Context.** `docs/BACKLOG.md` flagged approval-fatigue from
`fact-extraction` since ADR-027/028; real usage kept reconfirming it (6
proposals from one 8-utterance run, 2026-08-04; 13 of 17 rejected in
Pedro's own real session; 3 more expired unactioned in a later short
test; and, under degraded-model conditions, 5 of 6 extractions from
isolated utterances were outright garbage). Built 2026-08-11 while the
owner asked to keep progressing on work that doesn't need him.

**Decisions.**

- **Batch the extraction call itself, not just the approval UI.** Two
  same-shaped options existed: (a) keep one extraction call per
  utterance but group the resulting proposals into one dashboard-level
  "review batch," or (b) accumulate utterances and run one extraction
  call over the whole window. Went with (b) — it's strictly better on
  both axes the backlog named: fewer LLM calls (cost), *and* better
  precision, since the model judging "is this durable" from a short
  recent window with real context is less likely to hallucinate a fact
  from an isolated fragment than judging one line in isolation ever was.
  (a) alone would only have addressed the popup-count complaint, not the
  garbage-fact root cause.
- **No Gate or dashboard changes.** Each fact in a batch still becomes
  its own individual `MEMORY_WRITE` proposal, approved/rejected one at a
  time exactly as before — batching happens entirely upstream, in when
  and how often extraction *runs*, not in how its output is reviewed.
  Deliberately the smaller, safer change: no new payload shape, no
  executor change, no UI work, nothing to re-verify in the approval
  lifecycle that ADR-006/027 already hardened.
- **Debounce with a max-count safety cap, not a fixed interval.**
  `core/factExtractionScheduler.ts` fires `idleMs` (default 20s, env-
  overridable) after the *last* utterance, so an ordinary back-and-forth
  turn doesn't get its own pass; `maxUtterances` (default 6) forces a
  flush regardless if a session never goes quiet. 20s, not N.E.K.O's own
  10s (`docs/BACKLOG.md`'s external-research entry) — chosen to clear a
  typical spoken-response duration comfortably, not benchmarked against
  N.E.K.O's own real usage pattern, which this project has no visibility
  into.
- **Each batch's facts are attributed to the last utterance's
  `eventId`.** The model isn't asked to attribute a fact back to a
  specific line in the window — `facts.source_event` is a soft
  debugging reference (nothing else queries it precisely), and asking
  for per-fact attribution would add real prompt complexity for a
  provenance detail nothing currently depends on.

**Consequences.**
- `core/factExtractionScheduler.ts` (new), `core/factExtraction.ts`
  (`extractAndRememberFacts` now takes the batch), `core/main.ts` (owns
  the scheduler instance, feeds it instead of calling extraction
  per-utterance directly).
- 9 new tests (449 total): 6 fake-clock scheduler tests (`core/tests/
  factExtractionScheduler.test.ts`, no real waiting), 3 new
  `factExtraction.test.ts` cases (batch-join, last-eventId attribution,
  empty batch). `make check` green throughout.
- **Live-verified**, not just unit-tested, given this changes real
  conversational timing behavior: an isolated `core` instance (`JARVIS_
  FACT_EXTRACTION_IDLE_MS=8000` for a fast real test), two real
  utterances injected 1.5s apart over the real WebSocket. Confirmed:
  zero `approval.new` events after either utterance individually; both
  `MEMORY_WRITE` proposals ("diet.avoids = peanuts",
  "workdays.remote = Tuesdays") appeared together roughly 8s after the
  *second* utterance, not the first — the debounce-resets-on-each-
  utterance behavior confirmed against a real clock, not just the fake
  one the unit tests use.

## ADR-051 — The 2026-08-07 `ears` "hang" wasn't one; fixed the real gap it exposed

**Status:** accepted

**Context.** `docs/BACKLOG.md`'s bug #1 (a `senses/ears` capture that
looked permanently stuck on a second consecutive wake-word utterance)
was left open since 2026-08-07, tentatively attributed to real memory
pressure on this machine, with "a race in `arm()`/`_process_frame`'s
armed-check wasn't ruled out either" as the other live theory. Neither
was actually confirmed. Re-investigated 2026-08-11/12 while the owner
asked to keep progressing on work that doesn't need him.

**What was actually found.** Reproduced the original two-utterances-
in-quick-succession scenario again, under comparable memory pressure
(confirmed via `vm_stat` that this 8GB M1 sits close to that most of
the time, not just that one night — consistent with ADR-001's own
long-standing finding). `sample`'d the "stuck" `ears` process again:
identical picture to the original investigation — no thread inside the
whisper-server HTTP call, the frame-processing thread cycling normally
at low, steady CPU (~10%), nothing consistent with either a deadlock or
a CPU-bound backlog. The decisive test the original investigation never
ran: fired a *third* wake word without touching anything. It triggered
and completed immediately. Since `make_wake_handler`'s `on_wake` only
logs and sets `wake_event` when `busy_lock.locked()` is false, this
proves the lock was already free — the "hung" second capture had
already finished. It just finished with an *empty* transcription, and
`capture_and_transcribe`'s own honest rule (`transcribe.py`: no text
means no `emit()` at all, per CLAUDE.md § 0.5's spirit) means nothing
was ever going to be sent for it — structurally indistinguishable from
a hang to an observer watching a log for a specific line that was never
coming.

**Why the transcription came back empty.** `say`-synthesized speech run
together with no pause after "Hey Jarvis" gives the wake-word
falling-edge detector (`wake_word.py`) too little runway before the
real command starts — the same family of issue already documented for
the "It is."/"and the camera." truncation cases from Phase 8's own
testing, just severe enough here to lose the entire utterance instead
of its first word or two. Not a code bug in the capture pipeline; a
known sensitivity of scripted `say`-based acoustic testing that real,
naturally-paced human speech mostly avoids (a real pause after saying a
wake phrase is a normal part of how people actually talk).

**The real, fixed gap.** None of the above changes what the *owner*
experiences in the case where it does happen: a wake-word capture that
transcribes to nothing gave zero feedback before this fix — the wake
ack fires, then silence, genuinely indistinguishable from the system
having frozen without doing the exact diagnostic work above. Fixed:

- `Ack` (`senses/ears/ack.py`) gained `fire_no_speech()` — a distinct
  `Pop.aiff` + a "Didn't catch that." notification, deliberately not
  `Tink.aiff` again (that means "I heard the wake word," a different,
  already-true fact) and not one of macOS's own error sounds
  (Basso/Sosumi) — nothing went wrong, the owner just wasn't heard.
- `capture_and_transcribe` (`senses/ears/main.py`) gained an `on_empty`
  callback, default a no-op, fired instead of `emit` when transcription
  comes back empty.
- Wired only into the wake-word path (`handle_wakeword_utterance` passes
  `ack.fire_no_speech`) — the hotkey path already has physical
  key-release feedback and no real ambiguity, so its `on_empty` stays
  the default no-op rather than threading an `Ack` through a path that
  doesn't need one.

**Consequences.**
- `senses/ears/config.py`, `ack.py`, `main.py`, `fakes.py` (`FakeAck`
  gained `fired_no_speech`), `tests/test_ears.py`.
- 2 new tests (50 pytest tests total), `ruff` clean, `make check` green
  throughout (453 node tests, unchanged — this fix is Python-only).
- `docs/BACKLOG.md`'s bug #1 entry corrected in place, not just marked
  fixed — the original "memory pressure" and "race condition" theories
  are now understood to be red herrings, not confirmed causes, and the
  entry says so plainly rather than leaving a stale, disproven
  explanation on record.

## ADR-052 — `tasks` on real Reminders.app; new green `REMINDERS` capability

**Status:** accepted

**Context.** `skills/tasks` started on a private `ctx.store` table
deliberately (2026-08-04: prove the voice UX before any gate design
work), flagged since then as "revisit once the private list feels
limiting." Owner confirmed 2026-08-12 he wants the real thing: Reminders
.app, synced via iCloud across every device, not JARVIS-only.

**Capability tier — a real decision, not mine alone.** A real system-app
write is exactly `SHELL_EXEC`'s (yellow) shape — but gating every "add a
task" behind a per-call approval would directly undo this same night's
own fact-extraction-batching work (ADR-050). Presented the tension
against the codebase's own direct precedent: `APP_CONTROL` exists
specifically because open/close-an-app is "narrow, immediately visible,
trivially reversible" and earning a green tier for it. The owner chose
the same shape here — a new green `REMINDERS` capability
(`shared/types.ts`, mirrored in `ui/src/lib/types.ts`, recorded in
`CLAUDE.md` § 5 same as `APP_CONTROL`'s own entry), not `SHELL_EXEC`.
Scoped to exactly one executor's CRUD, explicitly not a precedent for
any other system-app write defaulting to green.

**Real `osascript`/JXA syntax verified live before writing any code**
(not guessed — this project's own established discipline): JXA
(`osascript -l JavaScript`) over AppleScript string-building, since it
returns real JSON rather than needing fragile comma-delimited string
parsing. Owner-authored task text is passed as a real `execFile` argv
element after `--`, read inside the script via JXA's `run(argv)` —
confirmed live that shell-metacharacter-looking content comes through
as inert data, never executed (no shell involved). String-interpolating
it into the `-e` source instead would have been a real command-injection
risk.

**A real, only-partially-resolved finding from live end-to-end
testing, not swept under the rug:** `add_task` confirmed fully working
end to end — a real utterance injected over a real isolated `core`'s
WebSocket produced a real Reminders.app item, independently verified via
a direct `osascript` query outside `core` entirely, then cleaned up.
`list_tasks` (and by extension `complete_task`, which lists first to
fuzzy-match) hit a real, precisely isolated hang: accessing a
*already-existing* reminder's own properties (`.name()`, `.id()`,
`.completed()`) via `execFile` from a backgrounded/non-interactive node
process hangs for the full request timeout with **empty stderr** —
narrowed through six progressively simpler live repros (whose-filter →
plain-JS filter → count-only → single-item property access) to exactly
that boundary: list-level operations (`list.name()`, `list.reminders().
length`) return in under a second; touching one existing item's
properties never returns. Creating a *new* item and reading properties
off the object `push()` itself just returned works fine — the hang is
specific to re-fetching properties of an *existing* reminder.

Same empty-stderr, full-timeout signature `core/executors/focusMode.ts`'s
own docstring already documented for Shortcuts.app: a macOS TCC
Automation-permission dialog a non-interactive process can't see or
click. Plausible here too, but **not confirmed** — critically, every
repro used a process backgrounded via a sandboxed tool-driven shell, not
a real interactive `make dev` session in an actual Terminal window,
which may have different session/TCC characteristics entirely. Framed
honestly as an open question, not asserted as the cause.

**Decisions.**

- Ship the capability, executor, and skill rewrite as designed — `add`
  is proven working end to end; `list`/`complete`'s executor code is
  correct and already degrades honestly (a real, now genuinely
  informative error via `describeError()`, added mid-investigation once
  the original `execFile` rejection's `.message` turned out to carry no
  useful information at all, only `.stderr` does) rather than hanging
  the gate or lying about success.
- Added an explicit `TIMEOUT_MS` (15s) to every call from the start
  (unlike `focusMode.ts`'s own still-open equivalent gap) — a stuck
  permission dialog fails the gate honestly instead of hanging it
  forever.
- **Owner-required, flagged explicitly, not silently assumed fixed:**
  run `core` for real via `make dev` in an actual interactive terminal
  (not backgrounded the way every diagnostic test here was) and try
  "what are my tasks" for real. If it answers correctly, this was a
  test-environment artifact and nothing else is needed. If it times out,
  watch for a macOS permission dialog (System Settings → Privacy &
  Security → Automation) and grant it — same category `focusMode.ts`
  already asks for regarding Shortcuts.app.

**Consequences.**
- `shared/types.ts`, `ui/src/lib/types.ts`, `CLAUDE.md` § 5,
  `core/skills/loader.ts` (`VALID_CAPABILITIES`, caught the new
  capability automatically via ADR-035's own `Record<Capability,true>`
  exhaustiveness fix — confirmed that guardrail still works),
  `core/executors/reminders.ts` (new), `core/main.ts` (executor wiring),
  `skills/tasks/manifest.ts`+`index.ts` (rewritten, `ctx.store` no
  longer used — the private `skill_tasks_items` table stays in the
  schema, unused, not migrated; out of scope per the plan).
- 17 new tests (executor: 10, skill: rewritten to fake `ctx.propose`
  instead of `ctx.store`, same behavioral coverage plus 2 new failure-
  path cases). 465 total, `make check` green throughout.
- Real Reminders.app used for live verification throughout — every test
  item created was independently verified then deleted; the owner's
  real `Tasks` list (which already held 7 real completed reminders from
  his own prior use, confirmed present and undisturbed) was left exactly
  as found.
