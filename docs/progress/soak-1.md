# SOAK 1 — in progress, 2026-08-04

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

**Same day, asked directly to make JARVIS actually do things:** the gate
gained a real executor mechanism (`Gate` calls a registered `Executor`
on approval, `decide()` now `async`) -- closes a real gap where
`MEMORY_WRITE` approvals resolved with a signed execution nothing ever
consumed. Five new skills, all real: `system_health` (CPU/mem/disk),
`weather` (Open-Meteo, free), `tasks`/`shopping_list` (`ctx.store`
CRUD), `launcher` (open apps, list/open real project directories --
`~/Developer/Programação`'s actual 8 projects, confirmed live). Full
detail in DECISIONS.md's ADR-024.

Two more real bugs found and fixed via live loading/routing, not caught
by any existing test: `SkillRegistry.loadAll` passed the same fixed
`SkillInitContext` (with `store: undefined as never`) to every skill,
so any skill using `ctx.store` in `init()` always failed to load --
never hit before because no skill needed one until `tasks`/
`shopping_list`. Now a per-skill factory. And the lane classifier routed
"how's my computer doing" to `see` instead of `converse`, so
`system_health` never got a chance to answer and the general-
conversation fallback gave a vague, unverified "system health is
normal." One new few-shot example fixed it and raised the full 45-case
lane benchmark from 93.3% to 97.8% (`bench/bench_router_lane.ts`, live,
real NIM calls) -- no regression, the fix generalized.

Verified live beyond unit tests: a real `Calculator.app` launch through
the full propose → approve → real-executor path (confirmed by PID, then
closed); real Open-Meteo weather calls; real system metrics (memory at
99% used on this machine -- a genuinely useful number surfaced, not
just a demo). 183 TS tests (up from 139), `make check` green end to end.

**Same session, three more backlog ideas built:** `SHELL_EXEC` became a
real dispatcher (`core/executors/shell.ts`) instead of one executor per
capability -- music control, opening URLs, and volume/brightness all
route through it by `payload.action`, no new capability per action.
Volume uses a real built-in AppleScript command; brightness needs the
free `brightness` CLI (not installed on this machine -- reports that
plainly rather than guessing at an unverified hardware-key hack).
`open_url` joined `launcher`; `media` is a new skill (play/pause/skip,
`now_playing` as an ungated read, volume, brightness). Full detail in
DECISIONS.md's ADR-025.

Verified live: a real system volume change (63 → 40, restored after)
through the full propose → approve → executor path; a real browser tab
opened the same way; `now_playing` honestly reported nothing playing
against the real, not-running Music.app. Deliberately skipped a live
`play` test -- unlike a Calculator window, unexpected audio is a more
intrusive surprise than needed for this round; unit coverage stands in.
210 TS tests total, `make check` green end to end.

**Same day, asked to read the real conversation log and check what's
actually working:** found and fixed four real bugs, none caught by any
existing test since all four need real phrasing or real speech, not
fixtures. "Can you open Facebook?" and "what's playing" were both
falling through to `converse`'s general-reply fallback because
`launcher`/`media`'s intents only declared `converse` while the lane
classifier read them as `act`/`reflex`/`see` -- fixed with multi-lane
manifests (`wardrobe`'s own precedent), except `now_playing`, where a
prompt-based fix was tried first, found to regress 3 unrelated cases on
the full lane benchmark (97.8% → 91.1%, confirmed clean), and reverted
in favor of the same manifest-lane approach. `shopping_list`'s own
examples used "coffee" in two places, pulling any unrelated
coffee-mentioning `tasks` request into the wrong skill live ("remind me
to drink coffee at 9am" → misrouted) -- swapped to "butter." Also fixed
a small trailing-punctuation cosmetic bug ("Added: X..") found in the
same log.

The very first bug from this SOAK's first real conversation -- "Ponta
Delgada, Açores" transcribed as "Ponta del Gada, Zoris" -- got a real
fix too: `senses/ears` now passes Whisper a vocabulary hint
(`--prompt` + `--carry-initial-prompt`), tested clean (exact phrase
correct, diacritic included, English calls before/after unaffected).
Tried swapping to a multilingual Whisper model first; two different
synthetic-voice tests came back inconclusive-to-worse, not shipped.
Full detail, including the prompt-regression lesson, in DECISIONS.md's
ADR-026.

211 tests, `make check` green, lane benchmark confirmed back at 97.8%
after the revert (checked twice, clean both times).

**Same day, the actual root cause behind the "weather: tomorrow's
weather" bug reported above:** `core/factExtraction.ts` wrote extracted
facts straight to `memory.upsertFact()` with zero review, a gap that
predated Phase 6's gate (built in Phase 5b) and was never closed even
after the gate existed. Fixed: `extractAndRememberFacts` now proposes
each fact to the gate (`MEMORY_WRITE`) instead of writing directly; the
extraction prompt gained three counter-examples for the failure patterns
actually observed (a request to the assistant, a task/reminder, and the
topic of a question, none of which are facts about the owner); all 23
existing facts deleted from the real DB rather than curated, since none
were ever reviewed in the first place. 213 tests, `make check` green.
Full detail in DECISIONS.md's ADR-027.

**Same day, asked to test more rigorously and verify the dashboard shows
everything with Playwright, "as if you were me":** ran a fresh isolated
`core`+`ui` instance (scripted fake ears feeding real reported phrasing,
scratch DB) and drove the real dashboard with Playwright end to end --
transcript, skill health (all 8 skills), approval queue, approve/reject
round-trip (confirmed via `audit_log`, not just the UI), system status,
Orb, console errors. Two real things came out of it:

1. **Thought Stream and Error Log didn't backfill on a fresh tab** --
   same class of gap ADR-023 already fixed once for Transcript, never
   generalized to these two panels. `core/ws.ts`'s own docstring says
   the live channel is push-only by design, so a fresh tab needs a
   REST snapshot; that existed for transcript/approvals/events but not
   these two. Fixed with a new `core/dashboardHistory.ts` -- a small
   in-process ring buffer (50 thoughts, 20 errors, matching the
   client's own caps), deliberately *not* stored in the `events` table
   `Memory.recall()` reads from (routing/error telemetry leaking into
   conversation recall is a real risk, not a hypothetical one -- see
   finding 2 below). Two new endpoints (`/api/thoughts`, `/api/errors`),
   `use-jarvis.ts` seeds both on mount the same way it already does for
   transcript/approvals. Verified live: reloaded the tab after real
   routing decisions and a real error had already happened, both panels
   now show them immediately instead of "No routing activity yet."

2. **NIM was genuinely unreachable during this test** (confirmed
   directly: `curl` to the NIM endpoint timed out at 10s) -- the same
   failure Pedro's own pasted transcript showed for "Can you open
   Facebook?" This forced every `converse`-lane call, including lane
   classification itself, through the local `qwen2.5:0.5b` fallback.
   Live evidence this session: that fallback frequently misclassified
   ordinary utterances ("add butter to the shopping list", "Can you
   open Facebook?") as lane `see` instead of `converse`/`act`, so the
   correct skill was never even considered by `dispatch` -- filtered
   out before scoring, not a low-confidence miss. Also reproduced the
   general-conversation fallback echoing raw recalled-memory text
   (formatted `[owner] ...\n[jarvis] ...`) verbatim as a spoken answer
   on one turn, and fact extraction on the same tiny model produced
   mostly garbage (5 of 6 extracted facts nonsense, including literally
   extracting the extraction prompt's own placeholder syntax
   `project.<name>.status` as a fact key) -- all safely caught as
   pending approvals by ADR-027's fix rather than corrupting memory,
   confirming that fix holds up under exactly the failure mode it was
   built for. **Not fixed this session** -- root cause is NIM
   availability plus this machine's own resource pressure (98% RAM,
   100% CPU with the full stack up), and the right fix (retry/backoff
   tuning, a better local fallback, or a non-LLM lane-classifier
   fallback) is real design work, not a same-session patch. Logged in
   `docs/BACKLOG.md` for a real look.

213 tests still (dashboardHistory has no new test file yet -- it's a
plain ring buffer, exercised live via the Playwright pass above; add a
unit test if it grows any real logic), `npx tsc --noEmit` clean in both
`core` and `ui`, `make check` green.

**Same day, asked to brainstorm and then build dashboard features for
more real SOAK test data:** five features, all built and live-verified
same session so testing could start the next day -- a dashboard "test
console" that injects a typed line into the exact same handling path a
real transcribed utterance goes through; a 👍/👎 on each spoken response
(real labeled data, never model-set); live, dashboard-editable
Tasks/Shopping panels (toggle/delete write straight to the skills' own
`ctx.store` tables); and an aggregated metrics widget (utterances
today/this week, lane distribution, skill hit rate, no-skill-matched
rate) computed by a new, separately-unit-tested pure function
(`core/metrics.ts`). `core/main.ts`'s utterance handling became one
shared `handleUtterance(text)` function so a real and an injected
utterance are indistinguishable once they land. Full detail in
DECISIONS.md's ADR-029.

Live-verified with Playwright against a fresh isolated instance, not
just unit tests: typed console input dispatched for real; a dashboard
checkbox toggle and a dashboard delete both confirmed against direct
DB reads, not just the UI; a 👎 click confirmed in `event_feedback`;
metrics numbers hand-checked against what actually happened. Found and
fixed in the same pass, not before: the dashboard's side columns had
no way to reveal content taller than the viewport once the new Metrics
widget pushed past the bound -- would have shipped invisible otherwise.
Also confirmed, twice more, that the ADR-028 lane-classifier-under-
degraded-conditions gap is still open (unrelated to this session's
changes) -- still not fixed, now with two more live reproductions on
record in `docs/BACKLOG.md`.

224 tests, `make check` green.

**Same day, Pedro's own first real `make dev` session with the new
dashboard, real voice via the wake word:** asked to dig into
`data/jarvis.db` to see what needs improving. The new `routing_stats`
table (shipped hours earlier) turned this from "guess from response
phrasing" into "read exactly what dispatch decided" for the first
time. Four real bugs found and fixed, all confirmed with real data, not
assumed:

1. `shopping_list`'s `remove_item`/`clear_list` were `converse`-only --
   "delete milk sugar from the shopping list" classified as `act`,
   "remove or delete milk sugar" classified as `see`, both silently
   missed the skill (`routing_stats` confirmed `NO MATCH` for both).
2. **The real, serious one:** when dispatch fell through from (1),
   `converse`'s fallback *claimed to have deleted the item* -- twice,
   with different phrasing each time. Neither deletion ever happened;
   the garbage item was still sitting in the real DB. Same class of bug
   as the earlier "converse hallucinated capabilities" fix, now shown
   to extend to concrete, checkable claims about the owner's own data,
   not just abstract capability claims. `core/persona.md` gained an
   explicit rule against this, with a test confirming it reaches the
   model.
3. "Add milk and sugar to the shopping list" stored as one item with a
   literal embedded newline -- the extraction prompt had no protocol
   for more than one item. Pedro tried to correct it explicitly and
   got the identical bug again. Fixed: one item per line, one row per
   item.
4. "Drive to Lagoa" transcribed as "Drive to La Goa" -- same root cause
   and fix as the earlier "Ponta Delgada" bug, added to the same
   Whisper vocabulary hint.

`system_health` also given the same multi-lane backstop as a
preventive measure (it already broke once, ADR-024, with no structural
safety net of its own -- only a classifier prompt example, which
ADR-026 already proved can regress from unrelated changes).
`tasks`/`brief`/`weather` are still `converse`-only with no direct
evidence of breakage -- left alone, flagged in `docs/BACKLOG.md` rather
than guessed at.

The real, corrupted production shopping list was repaired: the two
garbage newline-merged rows deleted, replaced with clean "Milk" and
"Sugar" (restoring what Pedro actually asked for), "water" untouched.
Live-verified, not just unit-tested: replayed Pedro's exact failing
phrasing against a fresh isolated instance and confirmed both now
reach the real skill (honest "couldn't find X" responses, not
hallucinated success). Full detail in DECISIONS.md's ADR-030.

226 tests, `make check` green.

**Same day, the owner offered five free-tier API keys (Cerebras,
OpenRouter, Groq, Google AI Studio, Mistral) and asked for them to be
tested live and wired in ahead of `ollama`:** all five tested directly
against their real endpoints before any code was written (this session
had already been burned three times guessing model names that turned
out deprecated). Cerebras authenticates but has no usable free quota
(HTTP 402 on every model) -- no provider written for it, kept out of
the codebase entirely rather than left as dead config. The other four
all work: `groq` (~200ms, fastest), `mistral` (~380ms), `google`/Gemini
(~1.6s, thinks before answering), `openrouter` (slowest, free models
route through a shared upstream pool). New fallback order for both
`converse` and `reason`: `nim` → `groq` → `mistral` → `google` →
`openrouter` → `ollama`/`offline-fallback` -- `ollama` moved from
second to last per the owner's explicit call (its `qwen2.5:0.5b` is
worse than any of the four real remote models). `reason` gained a real
fallback chain for the first time; it previously went straight from
`nim` to a static "can't reach it" message.

15 new tests (241 total), `make check` green. Live-verified against the
real `Registry`, not just unit tests: with `nim` unreachable at the
time (same live flakiness already documented in ADR-026/028/030), a
real `converse` request, a real strict-JSON-mode request (the lane
classifier's exact shape), and a real `reason` request were all
correctly answered by `groq` after falling through -- the new chain
already saved a real request during this same session. Full detail in
DECISIONS.md's ADR-031.

**Same day, Pedro's second real `make dev` session with the new
provider chain live:** routing itself worked well throughout --
`shopping_list.clear_list`, `launcher.open_url`, and an honest
capability refusal all correctly dispatched or fell through as
intended. One real bug: "weather for tomorrow" dispatched correctly to
`weather.current_weather`, then hung on `ctx.ask()` -- the skill has no
forecast capability at all and silently ignored "tomorrow," asking for
a city instead of saying so. Fixed: a `FORECAST_PATTERN` check up
front now refuses honestly ("I can only tell you the current weather
right now, not a forecast for another day") without ever calling
`ctx.ask()`. Also confirmed via the real DB: the owner has never
actually completed the "what city" flow successfully yet -- no
`location.city` fact exists, so that question will keep coming up
until he answers it once and approves the resulting `MEMORY_WRITE`.
242 tests, `make check` green. Full detail in DECISIONS.md's ADR-032.

**Same day (2026-08-05/06), asked to reverse the English-only rule
(bilingual PT-PT/English conversation, documentation only -- see
CLAUDE.md § 0.1 and ADR-033) and then to research and build the
highest-value, lowest-risk items for real SOAK testing:** picked
hybrid recall and real Spotify control.

Hybrid recall (`core/memory/rrf.ts` + `core/memory/keywordSearch.ts`,
fusing SQLite FTS5 keyword search with the existing vector search by
Reciprocal Rank Fusion) surfaced a genuinely major, previously-
undetected bug while being wired in: `core/main.ts` had only ever
called `Memory.appendEvent()` for real conversation, never `Memory.
remember()` -- meaning **semantic recall had never actually indexed a
single real utterance or response in production since Phase 4**,
silently, with no error (`assembleContext()`'s own graceful-degradation
design made this indistinguishable from "nothing relevant was ever
said"). Fixed with a new `Memory.indexEvent()`, called fire-and-forget
right after each conversation-turn `appendEvent` (same latency
reasoning as fact extraction, CLAUDE.md § 7). Confirmed live against a
fresh scratch DB: `memory_vec`/`events_fts` row counts actually match
real conversation now, where they would have stayed at zero before.

Spotify control: `core/executors/media.ts` and `skills/media/index.ts`
now detect which app is actually running (`System Events`) and target
that one, defaulting to Music.app as before when neither is running.
Found and fixed a real lint violation along the way -- even a
type-only import from an executor into a skill trips CLAUDE.md § 5b's
rule; fixed by duplicating the small `MediaApp` union in the skill
file instead, same pattern already used for `MediaCommand`.

Also found live, during the same verification pass, not caused by
tonight's changes: "I don't eat peanuts, I'm allergic" mis-dispatched
to `shopping_list.remove_item` -- a real embedding-example collision
(confirmed via `routing_stats`: the lane classification itself was
correct), same bug class as the "coffee" collision ADR-026 already
fixed once. Not fixed this session -- logged in `docs/BACKLOG.md`
rather than guessed at.

15 new tests, 257 total, `make check` green. Full detail in
DECISIONS.md's ADR-034.

**Same day, corrected the Spotify default** (owner uses only Spotify,
never Music.app) and then proceeded with the Gmail MCP integration
from the 2026-08-05 research: real `core/mcp/` architecture
(`McpRegistry`, Google's standard OAuth authorization-code flow,
`MCP_TOOL_CALL` as a new, deliberately uniform capability -- every MCP
tool call requires approval, never auto-run from a server's own
self-declared "read-only" hint), a `gmail` skill that discovers the
real tool name/argument shape at runtime rather than hardcoding a
guess (genuinely unverifiable without a live connection), and
`bench/gmail_authorize.ts` for the owner's one-time setup.

Two real bugs found live while verifying, both fixed same day:
`core/skills/loader.ts` kept its own separate `VALID_CAPABILITIES`/
`VALID_LANES` lists from `shared/types.ts`'s own union types -- adding
the new capability to the type alone wasn't enough, the skill loaded
disabled until this second list was updated too. Fixed for good, not
just patched: both lists are now `Record<Capability/Lane, true>` keyed
by the full union, so a future drift is a compile error, not a silent
disabled skill. Skills also don't auto-discover from the filesystem --
`core/skills/registered.ts` is a hand-maintained list; `gmail` didn't
load at all until added there.

25 new tests, 284 total, `make check` green. Live-verified everything
reachable without the owner's own Google Cloud Console setup: core
boots cleanly with zero Gmail credentials present, "check my email"
correctly routes to the `gmail` skill (not some other skill by
accident), and responds honestly that Gmail isn't connected yet. The
real authorized connection is blocked on the owner running the setup
in `README.md`'s new "3c" section. Full detail in DECISIONS.md's
ADR-035.

**Same SOAK, next day (2026-08-06):** owner completed the OAuth setup.
First attempt hit Google's `403 access_denied` on the consent screen
itself (OAuth client in "Testing" status, owner's account not yet on
the Test users list) -- fixed on the owner's side via Cloud Console,
not a code issue. Second attempt succeeded; refresh token stored.

Live verification immediately past that found two more real problems,
both from *actually* connecting instead of stopping at "credentials
present":
- **A real bug in `core/mcp/registry.ts`'s `register()`:** it recorded
  the connection before awaiting `listTools()`, so a `listTools()`
  failure left the server permanently half-registered --
  `hasServer()` true, tool cache stuck empty. Fixed by reordering so a
  failure there means the server never registers at all. New
  regression test added.
- **The actual cause of that failure: README's setup steps were
  incomplete.** A raw `fetch()` against the real Gmail MCP endpoint
  (bypassing the SDK to see the true HTTP status/body) showed Google's
  own error: the **Gmail MCP API** (`gmailmcp.googleapis.com`) needs
  enabling in Cloud Console *separately* from the "Gmail API" README
  already mentioned -- two different APIs, easy to conflate. README's
  step 4 now lists both. Also found, and worth remembering rather than
  re-debugging blind next time: Google's `tools/list` endpoint
  returned HTTP 403 with a *fully valid* tool-catalogue body (status
  and body disagreeing) -- only `tools/call` gave an unambiguous
  answer. Confirmed reproducible twice, not a network blip.

285 tests total, `make check` green. **Still open:** owner needs to
enable "Gmail MCP API" and let it propagate; the actual authorized
`tools/call` against Gmail, and therefore `skills/gmail` end to end,
remains unverified. The real tool catalogue captured during this
session (visible in DECISIONS.md's ADR-036) suggests
`findSearchTool`/`guessQueryArgName` will resolve correctly once a
call succeeds, but that is analysis, not verification -- a follow-up
live run is still needed. Full detail in ADR-036.

**Same day, follow-up:** owner enabled "Gmail MCP API," then also
"Gmail API" on a second pass. `tools/list` now succeeds cleanly (13
real tools, confirmed matching the analysis above). But every actual
data call -- `search_threads`, `list_labels`, tried separately --
fails identically with `"The caller does not have permission"`,
despite a verified-correct, correctly-scoped OAuth token
(`gmail.readonly` + `gmail.compose`, checked via Google's own
`tokeninfo` endpoint). Three real fixes in a row (test users, Gmail
MCP API, Gmail API), symptom unchanged -- stopped per CLAUDE.md § 2
and searched for the exact error instead of guessing a fourth Cloud
Console setting. Found it: a publicly reported, currently-open bug in
Google's own Gmail MCP connector, same error string, same shape,
unrelated to this project or account
([anthropics/claude-ai-mcp#229](https://github.com/anthropics/claude-ai-mcp/issues/229),
[#424](https://github.com/anthropics/claude-ai-mcp/issues/424)).
Gmail integration is now code-complete, tested, and live-connected --
OAuth, registry, tool discovery all confirmed real -- but not usable
for actual searches until Google fixes their end. No code change
needed: `skills/gmail` already speaks the failure honestly instead of
crashing or faking a result. `docs/BACKLOG.md` updated to say so
plainly instead of the old "owner setup incomplete" framing. Full
detail in ADR-037.

**Same day, next task: the standing "peanuts" bug.** Asked to build
real benchmark infrastructure before touching `DISAMBIGUATION_SYSTEM`
rather than patch on a hunch. Found and fixed a real, separate gap
first: `tsconfig.json` never included `bench/**`, so `make check` had
never actually type-checked any bench script -- `bench_skill_routing.ts`
had already drifted from `SkillContext`'s real shape (missing `mcp`)
with nothing catching it. Fixed both.

Built `bench/bench_disambiguation_fallback.ts`, forcing disambiguation
onto the real degraded model (`qwen2.5:0.5b`) instead of the healthy
one, since that's what the live bug actually needed. Baseline: 42.9%,
bug reproduced cleanly. Two prompt fixes tried against it -- a worked
counter-example, then a shorter single rule -- **neither fixed a single
degraded-model case**, and the second one **regressed two unrelated,
previously-correct cases** on the healthy-model benchmark. Both
reverted; confirmed via `git diff` that `dispatch.ts` is byte-for-byte
unchanged from before this session. Also found, warming the model up
first still isn't enough to beat production's 3s timeout --
`qwen2.5:0.5b` measured ~29.7s cold-load on this machine, which can't
hold both it and the embedding model resident at once. Confirmed this
fails safely (an honest spoken error, never a crash) by reading
`core/main.ts`'s own try/catch, not assuming it.

Net result: no prompt change shipped (both real attempts were
benchmark-rejected, exactly the outcome ADR-026's own discipline exists
to catch before it ships) but real, reusable diagnostic infrastructure
kept, and the true scope of the problem is now sharper and merged into
ADR-028's already-open item rather than treated as two separate small
bugs. Full trail in ADR-038; `docs/BACKLOG.md` updated to match. 285
tests unchanged, `make check` green.

**Same day: bilingual PT-PT/English, the real implementation (ADR-039).**
Asked to work the full open-items list from the last status review, in
order, deciding independently, asking only on genuine forks. Asked 3 up
front: ship with the only installed PT-PT voice (Joana, female) or wait
for a male one -- **ship now**; one voice per whole reply or per
segment -- **whole reply**; add PT-PT manifest examples to all 9 skills
now or wait for real usage -- **all now** (owner's explicit call,
overriding the incremental default this session would have picked).

Built and live-tested: `senses/ears` swapped to multilingual Whisper
(`small`, `-l auto`, confirmed via `--help` before assuming) --
transcribed a real PT sentence and a real EN sentence correctly via a
scratch `whisper-server` fed real `say`-generated audio. Found and
documented (not fixed after two real attempts) one limitation: an
English loanword inside a Portuguese sentence gets heard as a similar
Portuguese word ("commit" -> "comité"); a vocabulary-hint fix that
worked for a similar problem before (ADR-026) didn't help here.
`senses/voice` gained `language.py` (boring word/diacritic scoring, no
new dependency) picking one voice per whole reply -- first version
misfired on an English sentence mentioning one Portuguese place name,
fixed by requiring PT evidence to outweigh English evidence rather than
any diacritic being an automatic override. `core/persona.md` gained a
bilingual section; no skill's own `persona.md` needed touching
(inheritance already covered it, checked not assumed). All 9 skill
manifests gained real PT-PT paraphrase examples.

Built `bench/bench_router_lane_pt.ts` (PT version of the Phase 3 lane
benchmark) before touching anything -- found a real, measured gap:
**77.8%** PT accuracy vs. English's 97.8%. All 10 failures matched an
existing English disambiguation rule in `LANE_CLASSIFIER_SYSTEM` that
had no Portuguese example of the same distinction. Added the missing
PT-PT examples next to their English counterparts (data, not prompt
instructions -- CLAUDE.md § 4 still holds), re-ran both benchmarks per
ADR-038's fresh lesson about verifying a shared-prompt edit both
directions: **PT rose to 100%, English held at 97.8%** (identical to
the pre-change baseline, no regression). Extended `bench_skill_routing.ts`
with 6 real PT dispatch cases: **93.3%**, clears the 90% DoD bar; the
one miss is the same class of disambiguation-margin noise the English
suite already has one of, deliberately not chased into
`DISAMBIGUATION_SYSTEM`.

29 Python tests (up from 28), 285 TS tests unchanged, `make check`
green. **Owner-required, not yet verified:** real accuracy against the
owner's actual voice/accent, and whether Joana's voice quality is
acceptable for daily use -- everything tested so far is synthetic audio
or text-level benchmarks. Full detail in ADR-039; `docs/BACKLOG.md`'s
bilingual entry marked built with what remains.

**Same day, item 2 of the status-review list: degraded-mode lane
classification (ADR-040).** Asked directly how to handle the known,
open ADR-028 gap. Before proposing anything, re-verified this same
day's own earlier, more alarmed finding (a ~30s cold-load figure from
ADR-038) live: a script matching `core/main.ts`'s exact try/catch,
against a genuinely cold model, answered within the existing 3s budget
twice in a row -- the 30s figure was a one-off disk-cache artifact, not
real steady-state behavior. Corrected both ADR-038's and this earlier
entry's own record rather than let a wrong number stand. The real,
confirmed failure mode is ADR-028's original one: fast, but wrong
("add butter to the shopping list" -> `see`).

Offered 3 options (fail honest / no-model heuristic / leave as-is);
owner chose the heuristic -- keep some real capability during a total
outage rather than fail outright. Built `core/router/laneHeuristic.ts`
(boring bilingual regex rules, same spirit as `reflex`'s own
`RulesProvider`, defaults to `converse` when unsure since that fails
softer than a wrong `reflex`/`see`/`act` guess). `classifyLane` now
tracks which provider actually answered and prefers the heuristic over
trusting `ollama`'s own JSON specifically -- every other provider
unchanged. Live-verified against the real `OllamaProvider`, not just
fakes: the exact documented bug case now resolves correctly, in both
English and Portuguese.

294 tests (up from 285), `make check` green. Still open, not attempted:
`disambiguate()`'s own equivalent gap (the "peanuts" misroute) --
needs real per-skill logic, a bigger ask than lane classification's
fixed 5 categories. Full detail in ADR-040.

**Same day, item 3: `clipboard` skill (ADR-041).** First of the Tier 1
backlog items, `pbpaste`/`pbcopy` -- built-in, no research needed unlike
Focus Mode or Home Assistant (still open, the latter needs asking the
owner whether he even has smart-home devices). Both read and write
route through `SHELL_EXEC`, not a green auto-run as the backlog note
first sketched -- clipboard content is arbitrary and could be
sensitive, same reasoning `FS_READ`'s whitelist already uses.

Found and fixed a real bug the same way as the others today: ran the
new skill through `bench_skill_routing.ts` before calling it done, and
`write_clipboard` ("copy this for me," "put this on my clipboard")
turned out unreachable -- the lane classifier reads "copy"/"put" as
command verbs (`act`), but the intent was declared `converse`-only.
Confirmed the real cause (not guessed) by inspecting real embedding
candidates and the real classified lane directly before fixing: same
pattern already named in ADR-026/ADR-030. Declared both lanes, verified
93.8% on the benchmark, up from 90.6%.

11 new tests, `make check` green. Live-verified the real `pbcopy`/
`pbpaste` round trip (including emoji) outside the fakes. `docs/
BACKLOG.md`'s clipboard item marked built.

**Same day, next Tier 1 item: `capture_screenshot` added to the same
skill.** `screencapture -i -c` -- interactive selection, straight to
clipboard, no file touches disk. Found a real gap live, not assumed
fixed: a non-interactive test capture exited 0 but the clipboard held
stale text afterward, not image data -- this machine's Screen Recording
permission likely isn't granted yet, and `screencapture` gives no
distinguishing exit code for that case, so both the executor and the
skill's speech say "sent," never "captured." Owner-required: grant the
permission, confirm live once done.

Needed both `act` and `see` lanes, not just `act` -- "grab a screenshot
of this for me" classified as `see` (confirmed via a real embedding
check first: 0.958 match, filtered out purely by lane mismatch, not an
embedding problem). Same fix pattern as `write_clipboard` earlier
today. `make check` green; also corrected a stale ~29.7s figure still
sitting in this file's own "Known issues" section (already fixed in
the SOAK-1 log above, missed here until now).

**Same day, last Tier 1 item confirmed with the owner first: Do Not
Disturb / Focus toggle (ADR-042).** Asked two things before building:
smart-home devices (owner has some, but Home Assistant stays
deprioritized, not built) and whether to keep going today (yes). Built
on `docs/BACKLOG.md`'s own 2026-08-04 research (AppleScript has no
clean Focus-mode property) -- the real answer is Shortcuts.app's own
"Set Focus" action via `shortcuts run`, the only Apple-supported
automation surface left for this. Owner needs to create two named
shortcuts once (`README.md`'s new "3d").

Two real bugs found live: the natural single-word reply ("on"/"off"
alone) to this skill's own follow-up question wasn't recognized, only
compound phrases were -- fixed, caught while writing this skill's own
tests. Separately, a direct shell `shortcuts run` returns almost
instantly, but the exact same call through this file's own `execFile`
hung with no output past 15+ seconds -- stopped manually, documented as
a likely TCC permission-dialog gap rather than resolved, since there's
no way to see or click a system dialog from this side.

12 new tests, `make check` green. This is the least-verified of
today's four features on purpose, not by oversight -- the owner hasn't
created the real shortcuts yet, and the `execFile` hang means even the
underlying mechanism needs a real, watched first run. Full detail in
ADR-042.

**Same day, a real ask: stop building, review everything (ADR-043).**
Asked directly for a full-codebase quality/security/efficiency
analysis, not new features -- the whole ~10.8K-line codebase, not just
recent work (confirmed the scope explicitly before starting: whole
codebase, not just today or this SOAK). Two parallel audits (security,
quality/efficiency); one got cut off mid-task by a session limit and
was resumed from its own transcript rather than restarted, no work
lost. Every Critical/High finding was re-verified by reading the real
code myself, not taken on an agent's word.

Found and fixed the same day: a **critical** dashboard vulnerability
(no host binding, wildcard CORS, no WebSocket origin check -- together,
any webpage the owner had open in another tab could forge an approval
with zero interaction, defeating the whole "owner is the only
executor" model) and a **high** gap (the HMAC signature `Gate.decide()`
creates was never actually verified before executing, contradicting
every executor's own docstring). Both fixed, both covered by new,
real tests (a live HTTP server + WebSocket client for the dashboard
fix, not fakes). 9 more findings reported (medium/low: an
undocumented, unenforced `FS_READ` whitelist; a real grammar bug
pinned as "correct" in `skills/media`'s own tests; an entire dead file;
duplication across 5 skills; two untested-but-testable files; a
non-timing-safe nonce comparison) -- not yet acted on, left for the
owner to prioritize.

332 tests total (up from 329), `make check` green. Also confirmed,
not just assumed: command injection is correctly defended everywhere
(argv arrays throughout, zero shell-string interpolation), the audit
log is genuinely append-only at the DB level, OAuth/MCP tokens are
never logged, secrets hygiene is clean repo-wide. The two real bugs
were narrow, specific gaps, not evidence of a weak foundation overall.
Full detail in ADR-043.

**Same day, continued through the rest of the review (ADR-044): all 9
remaining findings fixed, none deferred.** Timing-safe nonce
comparison; a dead file removed (`conversation/cli.ts`); a real
grammar bug fixed (`skills/media` spoke "didn't turned Do Not Disturb
on" on rejection, pinned as correct in its own tests); the extraction+
NONE pattern shared across 5 skills (new `skills/_shared/extract.ts`);
two coverage gaps closed (`dashboardHistory.ts`, `SkillRegistry.
loadAll()`); and the biggest piece, `FS_READ`'s whitelist actually
implemented (`core/skills/fs.ts`, a real `ctx.fs` enforcing CLAUDE.md
§ 5's denylist plus a per-wiring allowed-roots check).

Writing tests for the last two surfaced three more real bugs, not just
coverage gaps: a duplicate manifest id silently overwrote the earlier
skill in `SkillRegistry`; a symlink inside an allowed `ctx.fs` root
pointing outside it bypassed a lexical-only containment check (fixed
with `realpathSync`); and `skills/launcher`'s directories-only filter
was silently lost migrating off raw `readdirSync` (fixed by having
`listDir` return type info, not just names). Also found, unrelated:
`core/skills/scaffold.ts`'s `make new-skill` template never got the
`mcp` field `SkillContext` gained in ADR-035 -- a newly scaffolded
skill's test would have failed to compile.

359 tests total (up from 332), `make check` green throughout -- each
fix verified individually before moving to the next. Live-verified
`ctx.fs` against the owner's real project directory and a real
`~/.ssh` denial, not just the fakes. Nothing from the original review
left open. Full detail in ADR-044.

---
