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
