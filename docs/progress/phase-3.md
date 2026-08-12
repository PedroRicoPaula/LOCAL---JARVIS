# Phase 3 — closed, 2026-08-04

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
