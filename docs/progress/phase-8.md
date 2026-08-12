# Phase 8 — complete, 2026-08-06

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
