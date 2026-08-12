# BACKLOG.md

Ideas go here. They do not go into the build.

The agent is instructed to append here whenever it notices something worth
doing that is not in the current phase. You add to it during SOAK periods.

Nothing leaves this file without becoming a numbered phase in `ROADMAP.md`.

---

## Skills

- `wardrobe` — outfit opinions from a photo
- `workbench` — Arduino / assembly step tracking with confirmation prompts
- Calendar and email triage
- LeadHunter / HoqueiManager read-only widgets
- **Real macOS Reminders/Calendar instead of `tasks`'s own private
  table** — `osascript` can read/write Reminders.app and Calendar.app
  directly, so "add a task" would show up in the same list Siri/Reminders
  already syncs across every device, not a JARVIS-only list. `tasks`
  (2026-08-04) deliberately started with `ctx.store` instead — no gate
  design work needed to prove the voice UX first. Worth revisiting once
  the private list feels limiting.
- ~~Music control (play/pause/skip/what's playing)~~ — **built
  2026-08-04**, `skills/media`. Spotify not covered, Music.app only
  (see ADR-025).
- ~~Open a URL in the browser~~ — **built 2026-08-04**, folded into
  `skills/launcher`'s `open_url`.
- ~~System controls: volume, brightness~~ — **built 2026-08-04**,
  `skills/media`. Volume is real (built-in AppleScript); brightness
  needs `brew install brightness` (not installed on this machine, not
  installed automatically — reports the gap plainly instead). ~~Do Not
  Disturb toggle~~ — **built 2026-08-06, ADR-042**, via Shortcuts.app
  (`shortcuts run`), the only Apple-supported automation surface left
  for Focus modes. Owner-required setup (README's "3e", renumbered
  2026-08-08 when the GitHub MCP section was inserted as "3d") and a
  live permission-dialog check, both still open.
- **Voice-authored Cursor/Claude Code prompts, with the owner still
  pressing send** — asked about directly (2026-08-04): JARVIS types a
  drafted prompt into Cursor's Claude Code panel via macOS UI scripting,
  reads it back for confirmation, but the owner's own keypress (not
  JARVIS) sends it and everything Claude Code then does still goes
  through Claude Code's own permissions, same as typing it by hand.
  Deliberately NOT the version where JARVIS also sends it autonomously —
  that would mean JARVIS's own approval covers whatever a second,
  separate coding agent decides to do afterward, which is exactly what
  the gate's whole design (one approval = one bounded, reviewed action)
  exists to prevent. Real UI-scripting research needed before this is
  buildable at all (macOS Accessibility API access to a specific text
  field inside Cursor) — not scoped yet.
- ~~Screenshot -> clipboard~~ — **built 2026-08-06** (`skills/clipboard`'s
  `capture_screenshot`, ADR-041 addendum), `screencapture -i -c`. Real
  gap found live 2026-08-06: Screen Recording permission wasn't granted
  yet (a non-interactive test capture didn't land image data on the
  clipboard). **Re-tested 2026-08-12, confirmed granted** — the same
  test, re-run through a real `node`-spawned `screencapture` process,
  now lands real image data on the clipboard (`core/executors/
  screenshot.ts`'s own docstring has the full re-test). **OCR on top is
  still not built** — "read me the error on my screen" needs macOS's
  own Vision framework (via `shortcuts run` or a small native call) on
  top of the screenshot, needs its own research, not assumed easy — no
  longer permission-blocked, just not yet built.
- ~~Clipboard read/write~~ — **built 2026-08-06, ADR-041**
  (`skills/clipboard`). Both read and write go through `SHELL_EXEC`
  (yellow, not green as first sketched here -- clipboard content is
  arbitrary and could be sensitive, no way to whitelist it in advance).
  Found and fixed a real lane-declaration bug the same day (`write_clipboard`
  needed both `converse` and `act`, same pattern as `launcher`/`media`).
- ~~Focus Mode toggle~~ — see the Do Not Disturb entry above (same
  thing, built together 2026-08-06, ADR-042). Research (2026-08-04)
  correctly found direct AppleScript control has real limitations (no
  clean scriptable property, unlike volume); the real fix was
  Shortcuts.app, not AppleScript at all.
- **Home Assistant integration (Wyoming protocol)** — Home Assistant +
  Wyoming is 2026's mature, free, fully-local stack for exactly this
  (Whisper/Piper/openWakeWord are the same tools already in
  `senses/ears`); JARVIS could speak to a local Home Assistant instance
  instead of reinventing device control. **Confirmed 2026-08-06: owner
  does have smart-home devices, but not a priority right now** — stays
  in the backlog, revisit when it's actually wanted rather than
  scoping further speculatively.

## Platform

- ~~Bilingual conversation (PT-PT/English), the real implementation
  behind the CLAUDE.md § 0.1 rule change (ADR-033, 2026-08-05)~~ --
  **built 2026-08-06, ADR-039.** Multilingual STT (`whisper` `small`,
  `-l auto`), TTS voice-per-reply (`Joana`/`Daniel`, `senses/voice/
  language.py`), `core/persona.md` bilingual section, PT-PT examples in
  all 9 skill manifests, and two new benchmarks
  (`bench_router_lane_pt.ts`: 77.8% baseline -> 100% after a real,
  measured `LANE_CLASSIFIER_SYSTEM` gap was found and fixed with no
  English regression; `bench_skill_routing.ts`'s new PT dispatch cases:
  93.3%). **Still open, owner-required:** real accuracy against the
  owner's actual PT-PT accent/cadence (every test so far is synthetic
  `say` audio or text-level) and whether Joana's voice quality is
  acceptable for daily use -- both need the owner's own voice/ears, not
  something further text-level work can resolve. One known, accepted
  STT limitation: an English loanword inside a dominant-Portuguese
  sentence ("fazer commit") gets absorbed into a similar-sounding real
  Portuguese word ("comité") -- tried two prompt-hint fixes, neither
  worked, documented rather than chased further (low real cost, still a
  plausible sentence, not silence/crash).
- **MCP (Model Context Protocol) as JARVIS's tool layer — worth a real
  look before hand-building many more one-off executors.** By 2026 MCP
  is the de facto standard for agent-tool communication (Anthropic,
  OpenAI, Google, Microsoft, Amazon all support it; 10,000+ public
  servers — GitHub, Google Drive, Slack, Postgres, filesystem, and
  specifically macOS-automation servers doing the same
  AppleScript/window-control/clipboard things this project has been
  hand-building one executor at a time). The gate/executor model this
  project already has (propose -> approve -> verified execution) would
  need to wrap MCP tool calls the same way it wraps `execFile` calls
  now — real design work (an MCP tool call isn't automatically capability
  -tiered or human-summarized the way `ProposedAction` is), but it turns
  "write a new executor for every new integration" into "point at an
  existing MCP server," which is a much bigger lever than any single
  skill on this list. Worth its own design conversation, not a quick add.
- `make types` codegen from `shared/types.ts` (its own docstring already
  names this for the Python side, never built). Phase 7 added a second
  hand-kept mirror (`ui/src/lib/types.ts`, the wire subset `ServerEvent`/
  `ClientEvent`/`ApprovalRequest`/etc. need, since `ui/` is a separate
  Next.js project and can't just import `core`'s `.ts` files across the
  process boundary) — now two manual mirrors to keep in sync by hand
  instead of one. Worth it once a drift bug actually happens, not before.
- Bounded continuous-vision sessions ("watch me solder this")
- Mobile client for approvals away from the desk
- Sandboxed `act` lane (OpenHands-style container) — this is also the
  *real*, safe version of "JARVIS creates its own skills," which
  `converse` falsely claimed to do live (2026-08-04, see the honesty
  fix earlier this SOAK). Not a contradiction: the fix stopped JARVIS
  from *lying* about it right now; building it for real still means a
  sandboxed, reviewed pipeline where generated code goes through the
  same capability/gate model everything else does, not raw model output
  running unsupervised. Genuinely hard, genuinely later.
- ~~Additional providers: Groq, Gemini, OpenRouter, Cerebras~~ — **built
  2026-08-04**, three of four (`groq`, `google`/Gemini, `openrouter`;
  Cerebras tested and left out, no usable free quota) plus a bonus
  fourth the owner also provided (`mistral`), all live-verified with
  real keys and wired into `converse`/`reason`'s fallback chain ahead
  of `ollama`. See ADR-031.
- `livekit-wakeword` if openWakeWord tuning proves unreliable
- Piper voice cloning for a custom JARVIS voice
- Smart glasses (camera-equipped) as a future JARVIS embodiment — owner is
  considering buying a pair. Long-term only: after the desktop + camera-session
  flow (Phase 8) is fully working and lived with. Would need its own capture/
  display constraints revisited against `SPEC.md` § 6 (the camera-session
  model), not assumed to carry over as-is. Not scheduled, not designed.
- Persistent menu-bar indicator for camera/listening/wake state (`rumps` or
  raw `pyobjc` `NSStatusItem`). Phase 2's "visible acknowledgement on wake"
  used a transient macOS notification instead — real scope (a whole small
  menu-bar app) that nothing currently requires. Worth it once there's more
  than one thing to show ambient state for (listening, camera armed,
  approval pending) — natural fit once Phase 7's dashboard exists, maybe
  earlier if a transient notification proves annoying in daily use.
- **Rejected/expired `MEMORY_WRITE` observation proposals leave an
  orphaned durable image file.** Found live, Phase 8's own verification
  pass: `skills/look`'s `describe` copies the captured frame to
  `data/observations/<ulid>.jpg` immediately (ADR-045's own reasoning
  for why -- the ephemeral session frame can't be relied on to survive
  until an approval resolves). If the owner rejects the proposal, or it
  expires unanswered, that copy is never referenced by any DB row and
  is never cleaned up -- confirmed live (`data/observations/` had 2
  files after a reject; `observations` table had 0 rows). Not a
  privacy/security hole (the file was already local, already gitignored
  as of this same finding), just a slow disk leak with no cleanup path
  yet. A real fix needs either a TTL sweep over unreferenced files in
  `data/observations/`, or having the `MEMORY_WRITE` executor's
  rejection/expiry path delete the file it was never approved to keep --
  neither built, out of this phase's scope.
- **The dashboard test console's fire-and-forget utterance handling can
  cross-wire a camera-touching skill's in-flight `eyes` request if two
  utterances are injected faster than a skill turn completes.**
  `core/main.ts`'s WS handler calls `handleUtterance(text).catch(...)`
  without awaiting it (so a slow skill turn doesn't block other WS
  traffic like `approval.decide`), so two rapidly-injected test-console
  lines can run concurrently. `core/skills/camera.ts`'s `createIpcCameraHandle`
  assumes one request in flight at a time (documented there as "shouldn't
  happen given single-in-flight use") -- true for real voice (`ears`'s
  own loop awaits each utterance sequentially, so this can't happen from
  real speech), false for the test console under rapid-fire input. Found
  live reproducing this exact race (a `capture()` call resolved with a
  stale `camera.armed` reply meant for a different, overlapping `open()`
  call) before isolating it to test-script pacing rather than a
  reachable production path -- confirmed by re-running with realistic
  human-typing-speed gaps, which never reproduces it. `ctx.ask()`'s own
  correlator (`conversation/ipc.ts`) has the identical latent assumption
  for the same underlying reason. A real fix (a per-utterance queue in
  `core/main.ts`, or a request-id-tagged correlator instead of a single
  pending slot) is real, cross-cutting scope, not attempted here.

## External research — lessons from other Jarvis-style projects

Asked directly (2026-08-04) to look at five other "personal AI assistant"
repos and log what's worth learning, without changing anything yet:
[thevickypedia/Jarvis](https://github.com/thevickypedia/Jarvis) (Python,
249★, keyword-routed, cloud STT), [vierisid/jarvis](https://github.com/vierisid/jarvis)
(TypeScript, 613★, multi-agent daemon + Go sidecars, forked from
Activepieces), [open-jarvis/OpenJarvis](https://github.com/open-jarvis/OpenJarvis)
(Python, 8308★, pluggable local-inference framework, also read its docs
site), [Avinashb722/jarvis-ai-assistant](https://github.com/Avinashb722/jarvis-ai-assistant)
(Python, 56★, hobby project), and [Project-N-E-K-O/N.E.K.O](https://github.com/Project-N-E-K-O/N.E.K.O)
(Python, 2379★, companion/VRM avatar assistant with a plugin marketplace).

**Validated design choices — confirms we're not behind, no action needed.**
- Our `Gate` (HMAC-signed, single-use nonce, 5 min expiry, unconditional
  approve-before-execute, append-only audit log — CLAUDE.md § 5) is
  *stricter* than every comparable mechanism found. vierisid's
  `src/authority/engine.ts` returns `requiresApproval` as advisory, not
  a hard block at every entry point, and its config literally has
  `learning: { enabled, suggest_threshold }` — authority that adapts
  itself over time, exactly what CLAUDE.md § 5 rules out by design.
  Its audit trail (`src/authority/audit.ts`) has no signature/nonce/
  tamper protection at all. OpenJarvis's own docs admit `shell_exec`
  over HTTP/Desktop auto-approves with no confirmation, and that its
  file-write filename blocklist is "protection against fat fingers,
  not a security boundary" (`docs/architecture/security.md`,
  `docs/user-guide/system-access.md`).
- N.E.K.O's `memory/speaker_trust.py` independently states the same
  rule CLAUDE.md § 0.5/§ 5 already enforces here: *"Trust values never
  come from model output — scores derive exclusively from request
  provenance and code-side predicates."* Good outside confirmation
  that this is the right line to hold, not our own house style.
- `senses/ears` (openWakeWord, local, Phase 2) plus local Whisper is a
  better fit for CLAUDE.md § 0.2 (free-tier, offline where possible)
  than thevickypedia/Jarvis's approach, which has no wake-word model
  at all — it transcribes continuously via the *cloud* Google Speech
  Recognition API and filters by keyword after the fact.
- Our structured-JSON lane classifier before dispatch (`core/router/
  laneClassifier.ts`) fits small/free local+remote models better than
  OpenJarvis's approach, which skips a routing step entirely and
  injects the whole skill catalog into the agent's own system prompt
  for the LLM to pick a tool from directly (ReAct-style) — workable
  for them because they assume a frontier-capable model, not our
  free-tier constraint.

**Small, concrete ideas worth building — low risk, no design debate needed.**
- ~~A permanent benchmark gate for lane-classifier changes~~ — **built
  2026-08-08.** OpenJarvis's `docs/architecture/learning.md` describes a
  `BenchmarkGate` that scores any proposed prompt/routing edit against a
  benchmark *before* it ships; we hit the exact failure this guards
  against, twice, by hand this SOAK (ADR-024, ADR-026: an added few-shot
  example silently regressed unrelated cases on the 45-case benchmark,
  caught only because someone happened to rerun it). `bench/_shared/
  regressionGate.ts` compares a fresh run against a recorded baseline
  (`bench/baseline.json`, seeded from the real documented numbers -- 97.8%
  lane, 100% PT-PT lane, 88.6% skill routing, the last one deliberately
  conservative to absorb `disambiguate()`'s own known run-to-run
  variance, ADR-038) and fails on a real drop even while still clearing
  the fixed floor. Wired into `bench_router_lane.ts`, `bench_router_
  lane_pt.ts`, and `bench_skill_routing.ts`; `make bench-gate` runs all
  three. Deliberately **not** part of `make check` (real network/model
  calls, real API quota) -- the gate logic itself has 8 offline unit
  tests that are (`bench/**/*.test.ts` joined `make check`'s glob).
  `bench/update_baseline.ts` is the one deliberate way to record a new
  baseline after a confirmed real improvement -- never automatic.
- ~~Tag the audit log with which channel resolved an approval~~ —
  **built 2026-08-11.** `ApprovalResponse` gained an optional `channel:
  "dashboard" | "cli" | "voice"` field (`shared/types.ts`, mirrored in
  `ui/src/lib/types.ts`); `gate/cli.ts` and the dashboard's own `decide()`
  (`ui/src/lib/use-jarvis.ts`) each tag their own. `"voice"` reserved,
  not reachable yet (CLAUDE.md § 5: a red-tier send still needs a real
  click/keystroke, never a spoken "yes" alone). A decision with no
  channel set (an older/unspecified client) logs cleanly with the field
  simply absent, not an error. 4 new tests.
- ~~A reviewable list of routing misses~~ — **built 2026-08-08.**
  thevickypedia/Jarvis dumps every unrecognized phrase to a file for the
  developer to read later (`support.unrecognized_dumper`); had the data
  (`routing_stats`) but not the owner's actual utterance text alongside
  it, only that a miss happened. `routing_stats` gained an `event_id`
  column (this project's first real schema migration on an
  already-populated table — `core/memory/db.ts`'s `ensureRoutingStats
  EventIdColumn`, `PRAGMA table_info`-guarded so `ALTER TABLE ADD COLUMN`
  is safe to run on every boot; live-verified against a real copy of
  the owner's own `data/jarvis.db`, 39 existing rows preserved, safe to
  run twice). New `Memory.recentRoutingMisses(limit)` /
  `GET /api/routing-misses` returns the real utterance text for every
  `no_skill_matched` decision, most recent first, joined against
  `events` — closing a gap like ADR-026's coffee collision is now
  reading this list instead of re-reading a whole conversation log by
  hand. Old rows (recorded before this column existed) show an honestly
  unknown utterance rather than a guess. No dashboard UI panel yet
  (deliberately out of scope for this pass — the backend/endpoint was
  the actual gap); a future UI panel is a natural, separate follow-up.
- **MCP tool calls, if/when the MCP backlog item above gets built, must
  go through `Gate.propose()` like everything else — do not wrap them
  the way OpenJarvis does.** Its own MCP doc confirms tool calls from
  an external MCP server are wrapped as a plain `BaseTool` and "agents
  cannot distinguish between local and external tools at runtime" —
  no extra approval step versus a native tool. Worth stating explicitly
  now so future-me doesn't take the easy path later: an MCP tool is a
  `SHELL_EXEC`-tier action or worse, same capability tiering as any
  other executor, never an exception.

**Bigger ideas, real design work, not scoped yet.**
- ~~Batch fact-extraction review after a period of idle activity, instead
  of one approval per utterance~~ — **built 2026-08-11.** N.E.K.O's
  `app/memory_server/gates.py` idle-threshold pattern, adapted: `core/
  factExtractionScheduler.ts` debounces (idle default 20s, env-
  overridable) with a max-batch safety cap (6 utterances) so a never-quiet
  session still gets extraction passes. `extractAndRememberFacts` now
  takes the whole batch, joined into one extraction call instead of one
  per utterance — real value beyond just fewer popups: a short window
  gives the model more context to judge "is this actually durable" from,
  directly addressing the "5 of 6 garbage in one live run" entry below.
  Went with *batched extraction* over *batched approval UI* (a
  same-shaped but different idea) — no Gate/dashboard changes needed,
  individual facts still get individual approve/reject, just fewer,
  more deliberate extraction passes producing them. Each fact in a batch
  is attributed to the *last* utterance's `eventId` (a deliberate
  simplification, documented in code). 9 new tests (fake-clock scheduler
  logic, batch-join/attribution/empty-batch on the extraction side).
  **Live-verified**, not just unit-tested: an isolated `core` instance,
  two real utterances injected 1.5s apart -- confirmed zero approvals
  fired after either one individually, both `MEMORY_WRITE` proposals
  appeared together ~8s (the configured idle) after the *second*
  utterance, not the first.
- **Auto-tuned skill examples/prompts from real usage traces, instead
  of hand-editing `manifest.ts` examples every time a collision is
  found live.** OpenJarvis's optimization overlays
  (`~/.openjarvis/learning/skills/<name>/optimized.toml`, DSPy/GEPA-
  based) learn better descriptions and few-shot examples from
  successful/failed traces automatically, gated by the same
  `BenchmarkGate` mentioned above before rollout. This is exactly the
  manual process this SOAK kept doing by hand (moving "coffee" out of
  `shopping_list`'s examples, multi-lane manifest fixes) — a real
  productionized version of it is a legitimately bigger lever, but a
  heavy dependency (DSPy) for a one-person project. Worth it only if
  manual example-tuning keeps recurring as a pain point.
- **Per-speaker trust, if JARVIS is ever used by more than one person
  in the household.** N.E.K.O's `speaker_trust.py` model (deterministic
  trust bands from `platform:actor` identity, never from model output,
  used to arbitrate conflicting claims) is a reasonable shape for this
  if it ever becomes real — not needed now (SPEC.md's whole design
  assumes one owner), flagging only so it doesn't need re-deriving from
  scratch if a second household member ever starts talking to it.

**Anti-patterns confirmed to keep avoiding** (from
`Avinashb722/jarvis-ai-assistant`, a much less disciplined codebase —
useful as a negative example, not a source of ideas to adopt):
- Real user data and secrets committed straight into the repo:
  `password_key.key`, `passwords.json`, `jarvis_memory.db`,
  `health_data.json`, `expenses.json` all sit in the repo root, plus
  compiled `.pyc` files. Exactly what `.gitignore`/Keychain
  (CLAUDE.md § 5) exist to prevent here — `data/jarvis.db` is
  gitignored, secrets are Keychain-only, on purpose.
- Multiple never-cleaned-up variants of the same file left side by
  side (`dual_ai_broken.py`, `dual_ai_scanner_fixed.py`,
  `ultimate_ai_executor.py` / `ultimate_ai_executor_simple.py`) —
  the exact pattern CLAUDE.md's "no backwards-compatibility hacks,
  delete what's unused" rule and the top-level agent instructions
  exist to prevent.
- Its provider-fallback code (`engine/ai_fallback_system.py`) catches
  bare `except Exception` around every provider call, only `print()`s
  the error (no logging, no audit trail), and silently drops the
  system prompt for every provider except the first one in the chain —
  a real, quiet correctness bug baked into the fallback path itself.
  `core/router/router.ts`'s narrower `ProviderUnavailableError`
  distinction (only *that* specific error type triggers fallback,
  everything else propagates) and identical request shape per provider
  are the right call here, not something to loosen.

## Capability research, 2026-08-05 — MCP integrations, computer-use, camera gesture control

Asked directly to research how to make JARVIS "stronger, more
intelligent, more functional" -- specifically: read-only access to the
owner's own analytics/email/messages without opening a browser, real
(not just open/close) control of apps, JARVIS able to see and drive its
own machine's UI on request (an AnyDesk/TeamViewer-style tool aimed at
itself, not another computer), camera-based gesture control of the
dashboard, and RAG/embeddings/graph-based memory improvements. Real,
sourced research (web search against 2026-current sources), not
guessed at. Organized cheapest/safest first.

**Tier 1 — clean, official, low-risk. Worth building for real.**
- ~~Gmail via Google's own official MCP server~~ -- **built 2026-08-06**
  (`core/mcp/`, `skills/gmail`), real code and real tests. OAuth setup
  completed 2026-08-06 -- connection and `tools/list` both work
  (13 real tools seen, `findSearchTool`/`guessQueryArgName` confirmed
  matching against them). **But every actual data call
  (`search_threads`, `list_labels`, ...) fails with `"The caller does
  not have permission"`, and this is Google's own bug, not ours or a
  config gap:** confirmed by real, correct OAuth scopes
  (`gmail.readonly`+`gmail.compose`, checked via `tokeninfo`), and by
  public reports of the exact same error, same wording, on Google's
  own Gmail MCP connector --
  [anthropics/claude-ai-mcp#229](https://github.com/anthropics/claude-ai-mcp/issues/229),
  [#424](https://github.com/anthropics/claude-ai-mcp/issues/424)
  (persistent since 2026-04-20, 100% reproducible for affected
  accounts). Nothing left to fix on our side -- `skills/gmail`
  already degrades honestly (a failed `callTool` speaks the error
  rather than crashing or fabricating results). Revisit by periodically
  re-running the live check; no action item for us until Google fixes
  it. See ADR-037.
- **Google Analytics via Google's own official MCP server**
  ([github.com/googleanalytics/google-analytics-mcp](https://github.com/googleanalytics/google-analytics-mcp)) --
  same OAuth model, exposes the GA4 Reporting/Admin APIs directly.
  Reuses `core/mcp/`'s registry/executor/capability plumbing built for
  Gmail -- deliberately not built yet, sequenced after Gmail is
  confirmed working end to end against a real connection rather than
  building two unverified integrations at once (ADR-035).
  Exactly the "ask my own site's analytics without opening the GA
  dashboard" ask, no risk beyond a normal `NET_READ`-tier integration.
- ~~Spotify control~~ -- **built 2026-08-06.** `skills/media`/
  `core/executors/media.ts` now detect whether Spotify or Music.app is
  actually running (`System Events`) and target that one; Music.app
  stays the default when neither is running. See ADR-034.
- ~~Hybrid search for `core/memory/recall.ts`~~ -- **built 2026-08-06,
  and it surfaced a real, previously-undetected bug while being wired
  in: semantic recall had never actually indexed a single real
  conversation turn in production (`core/main.ts` never called the
  indexing method).** Both fixed together. See ADR-034.

**Tier 2 — real feature, real scope, needs its own design pass before building.**
- **"Computer use" -- JARVIS seeing and driving this Mac's own UI on
  request (the AnyDesk/TeamViewer-for-itself idea).** Confirmed
  buildable and well-precedented: Anthropic's own Claude Computer Use
  (shipped March 2026) does exactly this pattern for its own product --
  permission-first (asks before touching a new app), runs in an
  isolated VM, prompt-injection scanning, site blocklists, owner can
  stop anytime. Reliability research is unambiguous: macOS's
  Accessibility API (`AXUIElement`) beats vision-on-screenshots badly
  (~50ms structured element lookups vs. ~2500ms per screenshot,
  reading real button labels instead of guessing from pixels) --
  several real MCP servers already do this
  (`computer-use-mac-mcp`, `MacOS-MCP`, `ToolPiper`).

  **Concrete flow the owner specified (2026-08-05), which resolves the
  tension flagged above rather than avoiding it:** a WhatsApp
  notification arrives → JARVIS tells the owner about it → owner says
  "open notifications" / "reply to X's message" → JARVIS navigates and
  reads the message → owner dictates the reply, can revise it by voice
  ("update the message to say...") → **only on an explicit final "send
  it" does JARVIS actually send** -- and per the updated CLAUDE.md § 5,
  that final send is a real `Gate` proposal like any other red-tier
  action: the *content* is drafted and revised entirely by voice, but
  execution still requires the owner's own click (dashboard Approve)
  or typed CLI `approve`, never a spoken "yes" alone. This is not a new
  mechanism -- it's `docs/SKILLS.md`'s existing "propose → read back →
  confirm → write" shape, just with the "write" step being a real
  yellow/red-tier `Gate.propose()` instead of a direct write, and the
  confirm loop running iteratively (draft → hear it back → revise →
  repeat) before that final proposal is even made. Two shapes for the
  *navigation/drafting* half specifically, not decided here:
  1. **Bounded, per-task AX-driven actions** (JXA), each its own
     gated capability with a clear `humanSummary` -- same pattern
     `SHELL_EXEC`'s dispatcher (ADR-025) already uses for app/media
     control, just extended to more apps/actions one at a time. Safer,
     smaller, boring.
  2. **A real "computer session,"** modeled on the camera session
     lifecycle SPEC.md § 6 already defines (ARMED by voice, a visible
     indicator for the whole session, an idle timeout, closed
     explicitly) -- applied to UI control instead of the camera. A
     genuinely bigger phase (its own ADR, its own DoD), but reuses a
     lifecycle pattern this project already trusts rather than
     inventing a new one.
  Recommend starting with (1) for specific real annoyances as they
  come up, not attempting (2) until (1) proves the pattern.
- **Biometric owner-verification (face and/or voice) gating access to
  "stronger" capabilities** -- the owner's own idea (2026-08-05),
  proposed as an *extra* safety layer on top of the Gate, not a
  replacement for it: e.g. computer-use actions only unlock when the
  camera confirms the owner's face is present, or JARVIS only accepts
  sensitive requests spoken in the owner's own voice. Real precedent
  found in this session's earlier research: N.E.K.O's
  `speaker_trust.py` (a 2379★ companion-AI project) implements exactly
  this shape -- deterministic trust bands from verified identity, the
  trust score itself *never* coming from model output, only from
  code-side verification -- the same "trust never comes from a model"
  principle CLAUDE.md § 0.5 already holds for facts and quantities,
  extended to identity. Real scope if built: a local face-embedding
  match (not a cloud face-ID service) and/or a voice-print/speaker-ID
  model, both running locally, feeding a simple boolean into the Gate's
  own decision rather than any model ever asserting "this is Pedro."
  Good idea, adds real defense-in-depth to the computer-use entry
  above in particular -- not scoped or sequenced yet.
- **Camera-based hand-gesture control of the dashboard** (grab/drag a
  widget with a pinch gesture, using the owner's own hand -- not a
  face/person-detection feature, confirmed 2026-08-05). Technically
  solid and well-precedented: MediaPipe Hands does real-time,
  on-device, 21-landmark tracking from a plain webcam, macOS-
  compatible, several existing open-source projects already map hand
  landmarks to system control (volume, scroll, cursor movement). Fits
  naturally as a *second* purpose for Phase 8's camera session
  lifecycle (SPEC.md § 6) -- a bounded, ARMED, indicator-visible
  session, just driving synthetic pointer events into the dashboard's
  WebSocket channel instead of taking photos. Real scope: a local
  hand-tracking process, a new gesture→pointer-event protocol,
  dashboard-side drag handling on every widget. A Phase-8-and-later
  idea, not urgent.

**Tier 3 — real conflicts with rules this project already has for good
reasons. Flagging explicitly rather than building around quietly.**
- **Camera-based "measurements" directly conflict with SPEC.md § 7 /
  CLAUDE.md § 0.5's existing, deliberate rule: vision identifies, it
  never quantifies -- no model-derived number is ever stored as fact.**
  This research confirms that rule is correct, not just cautious: a
  single ordinary webcam genuinely cannot produce a trustworthy
  measurement without camera calibration and (for real depth) a second
  camera or dedicated depth hardware -- published error sources include
  lighting-dependent failure below 30-40 lux, lens-distortion effects
  without calibration, and pose-estimation error on textureless
  surfaces. If a rough on-screen estimate is ever wanted, it has to
  stay an `Estimate` (already in `shared/types.ts`, a bounded range
  with a confidence, never summed, never a `Measurement`) -- never
  presented or stored as a real number, per the existing rule.
- **Personal WhatsApp and Instagram access have no clean path,
  confirmed by direct research, not assumed:**
  - Instagram: personal accounts have had **no official API access at
    all** since the Basic Display API's end-of-life (Dec 2024). DM
    access via the Graph API requires converting the account to
    Business/Creator and linking a Facebook Page -- a real change to
    what the account *is*, not a permission grant to JARVIS.
  - WhatsApp: unofficial personal-account automation (Baileys, WAHA,
    Evolution API) is a confirmed, active Meta ToS violation with real
    enforcement -- typically detected within 2-8 weeks, and Meta is
    further restricting third-party AI chatbots on WhatsApp through
    2026. The official WhatsApp Business API has near-zero ban risk
    but is built for approved-template business messaging, not passive
    personal-inbox reading.
  Neither gets built without the owner explicitly choosing to accept
  that tradeoff (account-type conversion, or real ban risk) with eyes
  open -- this is exactly the "stop and ask" case CLAUDE.md § 0.2/§ 9
  describes, not a silent no and not a silent yes.

**General finding, applies to any future MCP work:** real security
research on MCP (OWASP's own MCP cheat sheet, multiple 2026 vendor
writeups) confirms install-time trust is not enough -- the documented
best practice is per-call inspection (tool name, arguments, data
touched, destination, side effects) immediately before execution, with
destructive/data-sharing calls always requiring explicit confirmation.
This is, point for point, what `Gate.propose()`/`Gate.decide()`
already do for every other action in this project -- confirms wrapping
future MCP tool calls *through* the Gate (already the plan in this
file's Platform section) rather than beside it, and validates that
design rather than requiring a new one.

## Personal Knowledge Brain / Engineering Intelligence System — 2026-08-08

Owner's own idea, pasted in full during a chat discussion (not a code
session) about making JARVIS "cada vez mais inteligente e eficiente."
Explicitly scoped by the owner as bigger than this repo (a system-wide
Mac tool, Obsidian-based) but "principalmente no jarvis" — logged here
per CLAUDE.md § 0.6/§ 0.7 rather than discussed further in chat.
**Not scoped, not designed, no phase assigned. Read before any future
work on JARVIS memory/RAG/agent-orchestration touches this territory.**

**Core thesis, in the owner's own framing:** a "knowledge brain" doesn't
make Claude intrinsically smarter — it changes the quality of context
it reasons with, and lets it reuse prior work instead of re-deriving it
each time. The value isn't volume of notes; it's *structured retrieval
of the right knowledge at the right moment* plus a *relationship graph
between concepts* (e.g. Bloom Filter + Distributed Systems + Caching
suggesting an architecture a flat keyword search wouldn't surface).

**Key design principles extracted from the pitch, independent of any
specific tool choice:**

1. **Knowledge ≠ Reasoning.** Store facts (crypto primitives, data
   structures, theorems) separately from the *combinations* of them
   that solve a given problem. The graph of relationships between
   concepts is where the leverage is, not the concept list itself.
2. **Never let a model read the whole vault.** Retrieval, not
   memorization — vector search + graph search + a relevance layer
   feeding only what's relevant into context. A 100k-note vault dumped
   wholesale is a design failure, not a feature. This is the same
   context-discipline principle `core/memory/recall.ts`'s hard context
   cap (Phase 4) already applies at a much smaller scale.
3. **Universal knowledge vs. personal engineering knowledge — the
   second is worth more.** CS/math/security facts are replaceable
   (textbooks have them); a durable record of *this owner's own*
   decisions, bugs, root causes, and rejected approaches is not. This
   project already does a small, proven version of exactly this by
   hand: `PROGRESS.md` + `DECISIONS.md` (ADRs) + this file, written
   because CLAUDE.md § 0.7 requires it. The owner's proposal is
   essentially "generalize what CLAUDE.md § 0.7 already forces for one
   project into a structured, queryable system across all of them."
4. **Source/confidence metadata per note** — `FACT` / `HYPOTHESIS` /
   `EXPERIMENT` / `OPINION` / `UNVERIFIED` / `OBSERVATION`, each with
   source + confidence + date + verified flag. Directly the same
   discipline as CLAUDE.md § 0.5's "no model output becomes a stored
   number/fact" and SPEC.md § 7 — extended from JARVIS's own facts DB
   to a general knowledge store.
5. **"Unsolved Problems" and "Experiments" as first-class content, not
   just reference notes** — a hypothesis → implementation → benchmark
   → verify → (new) knowledge loop. This is close in spirit to the
   already-logged `BenchmarkGate` idea above (External research
   section) and to `bench/` in this repo, generalized from "does this
   routing change regress the benchmark" to "does this new algorithm
   candidate beat the baseline."
6. **Specialized agents over one generalist** — architect / security /
   math / research / performance / validator roles coordinated by an
   orchestrator, each consulting the knowledge base for its domain
   before answering. Concretely: this is the same reasoning behind the
   `code-reviewer`, `security-auditor`, `debugger`, `release-manager`,
   and `seo-master` global agents already built 2026-08-08 (in
   `~/.claude/agents/`, outside this repo) — small, real, working
   instances of exactly this pattern, built *before* this bigger idea
   was written down. Worth treating as the proof-of-concept rather than
   starting the bigger system from zero.

**Named risk (the owner's own, and correct):** the failure mode is
spending months populating physics/math/CS notes and ending up with
"10,000 notes, 0 impact." The owner's own priority ranking put "just
storing lots of documents" at 3/10 value versus 9-10/10 for the
graph/retrieval/verification/experiment pieces. Any future work here
should start with knowledge that improves *current* project work
(architecture, algorithms, databases, security — the stuff already in
play across the owner's projects), not a universal encyclopedia.

**Recommendation on record (owner's own conclusion, worth preserving):**
build a small, functional version integrated into the actual dev
environment first — not a from-scratch universal knowledge base —
and let real projects feed it going forward.

**Relationship to existing backlog items, so this doesn't get
re-designed from zero later:** overlaps the MCP entry above (a
knowledge/retrieval API is a natural MCP server, consumable by both
JARVIS and Claude Code the same way); overlaps the sandboxed `act` lane
entry (hypothesis → implementation → benchmark → verify is the same
shape as generated code needing a reviewed pipeline before it's
trusted); and would, if ever built as a JARVIS skill rather than a
standalone tool, need its own capability tier under CLAUDE.md § 5 (at
minimum `FS_READ`/`MEMORY_READ`, likely `MEMORY_WRITE` for the
experiment-logging half) and its own `persona.md` like any other skill
per `docs/SKILLS.md`. None of this is scoped — flagging the seams, not
deciding them.

**Addendum, 2026-08-11 — a concrete mechanism for point 5, found via
Google Research's own published work, not another SEO-blog-tier
secondary source this time:**
[ReasoningBank](https://research.google/blog/reasoningbank-enabling-agents-to-learn-from-experience/)
gives the "Unsolved Problems / Experiments" idea above a specific,
evidenced shape instead of staying abstract. The mechanism: an agent
memory item is `{title, description, content}` — a *distilled
reasoning strategy*, not a raw trajectory log (e.g. "always verify the
current page identifier before paginating" rather than "clicked page
2, then page 3, then..."). Critically, it learns from **both success
and failure** — a failed attempt yields a counterfactual/pitfall entry,
not just silence. The loop is closed: retrieve relevant memories before
acting → act → an LLM-as-judge assesses the outcome → extract the
insight → consolidate into the bank for next time. Google's own
published numbers (Gemini-2.5-Flash, WebArena + SWE-Bench-Verified):
+8.3% and +4.6% success rate over a memory-free baseline, and fewer
execution steps per task.

Why this matters more than it looks: this project already does the
*human-driven, write-only* half of this loop by hand — CLAUDE.md § 0.7
forces exactly "write down what you learned, including from failures"
into `PROGRESS.md`/`DECISIONS.md`, and this file's own "Annoyances
found during SOAK" section is full of real distilled-root-cause entries
(ADR-024, ADR-030, ADR-038, ADR-040 among others) that already look
like ReasoningBank memory items in prose form. What's missing is the
other half: **retrieval before acting.** Nothing currently reads
`PROGRESS.md`/`DECISIONS.md`/this file back *into* a live debugging or
build session before it starts — a future agent re-hits a solved
problem cold unless a human happens to remember to grep for it. The
same gap exists one level up, outside this repo, for the `debugger`/
`code-reviewer`/`release-manager` global agents built 2026-08-08 — each
invocation starts from zero, no memory of prior sessions' root causes
carries forward. If the Personal Knowledge Brain above is ever actually
built, ReasoningBank's `{title, description, content}` schema plus its
retrieve→act→judge→extract→consolidate loop is the concrete mechanism
to build toward, not a bespoke one — closer to "make the write-side
discipline this project already has queryable and automatically
retrieved" than to a net-new idea. Still not scoped as a JARVIS phase;
flagging the mechanism, not committing to it.

## Screen-guide overlay ("point at my screen and teach me") — 2026-08-11

Owner's own idea, sparked by an Instagram clip of
[farzaa/clicky](https://github.com/farzaa/clicky) (a macOS AI screen-guide
app, 7.3k stars): asks a question by voice about whatever's on screen,
gets a spoken answer, and a floating on-screen cursor animates to point at
the actual UI element to click/use — never clicks or types anything
itself, purely observes and guides. Owner's own stated stretch goal
(explicitly flagged by him as "quem sabe um dia," not asked for now):
the same pointing idea overlaid on a live camera feed instead of the
screen, for physical tasks (pointing at a component on a breadboard,
etc.) — closer in shape to the existing camera-gesture-control backlog
entry above than to this one; not researched further here.

**Real research on the actual repo before any technical opinion was
formed** (fetched the real README, not guessed — this project has been
burned before assuming a third party's architecture):

- **Push-to-talk, one screenshot per query — not continuous video.** The
  README's own words: "Push-to-talk streams audio over a websocket to
  AssemblyAI, sends the transcript + screenshot to Claude via streaming
  SSE." One capture per question, same shape as this project's own
  camera-session model (`SPEC.md` § 6: armed, capture only on request,
  never continuous recording) -- a good, not a compromised, architectural
  fit. Worth correcting the "sees my screen in real time" framing from
  the Instagram clip's own narration against the real source.
- **The pointing mechanism is a text tag, not a separate vision model.**
  Claude's own response embeds `[POINT:x,y:label:screenN]` tags (multi-
  monitor aware); a native overlay parses and animates the cursor there.
  Simple, reusable protocol -- the hard part isn't the tag, it's whether
  the *model* can reliably emit accurate pixel coordinates from a
  screenshot in the first place (see the open risk below).
- **Rendering: two native `NSPanel` windows** (Swift/AppKit), one
  transparent full-screen overlay for the cursor, one control-panel
  dropdown. **This is the one piece JARVIS has no equivalent of at all**
  -- there is no native macOS UI surface in this codebase today beyond
  system notifications/dialogs (`senses/ears/ack.py`'s `osascript`
  notification, `skills/media`'s AppleScript). Needs real platform work:
  most likely `pyobjc` driving `NSPanel`/`NSWindow` directly from
  `senses/` (same language as the rest of that layer, no new runtime),
  as a not-yet-attempted alternative to a Swift helper binary or an
  Electron overlay (heavier, cross-platform if that's ever wanted, but a
  whole new dependency for one window) -- not researched deeply enough
  yet to commit to one; a real spike, not assumed easy.
- **Four permissions**: Microphone (already granted), Accessibility
  (already needed for the Tab hotkey, Phase 1), Screen Recording +
  Screen Content/ScreenCaptureKit (the same still-ungranted gap
  `skills/clipboard`'s screenshot capability already found and logged
  above -- one owner-required grant now covers both features).
- **Real, hard conflict with CLAUDE.md § 0.2: Clicky runs on Anthropic
  Claude (paid), AssemblyAI (paid real-time STT), and ElevenLabs (paid
  TTS), each needing the end user's own API key.** A literal clone isn't
  buildable inside this project's own free-tier-only rule as it stands
  today -- flagging this plainly rather than quietly building around it
  (CLAUDE.md § 9). The *concept* doesn't need those three specifically,
  though -- see below.
- **A real technical edge JARVIS's own prior research already has that
  Clicky's pure-vision-coordinate approach doesn't use:** the 2026-08-05
  computer-use research (Tier 2 entry above) already found and recorded
  that macOS's Accessibility API (`AXUIElement`) beats vision-on-
  screenshots badly for *locating* a UI element precisely (~50ms
  structured lookups reading real button labels vs. ~2500ms per
  screenshot, guessing from pixels) -- Clicky gets away with pure vision
  because Claude's grounding is unusually strong (and still imperfect,
  38 open issues). A JARVIS version could plausibly do *better* by
  splitting the job: the vision/reasoning model identifies *what* to
  point at semantically ("the color grading icon"), then a real
  Accessibility-API lookup finds *where* it actually is on screen --
  more accurate, and works even if the vision model's raw coordinate
  guess would've been off. Not built or benchmarked, a real design
  direction worth trying before assuming pure vision-coordinates is good
  enough.

**What already exists in this codebase and would carry over almost
entirely, no conflict with anything already in `SPEC.md`/`CLAUDE.md`:**
voice (bilingual STT/TTS, arguably more capable than Clicky's own cloud
pair, and free/local where Clicky's isn't), the `see` lane's real vision
routing (NIM primary), the capability/Gate model (this needs *no*
approval flow to observe+point+speak -- no click, no type, nothing
written -- squarely green-tier, same shape as `CAMERA`; arm the "screen
guide" session once, like opening the camera, not per-screenshot), and
the existing screenshot capability (`skills/clipboard`'s
`capture_screenshot`, though that's an *interactive-selection* capture to
clipboard -- a full-screen, non-interactive capture is a small, separate
addition, not a rewrite).

**Not scoped or sequenced.** A real, substantial piece of work (the
overlay window alone is a genuine platform spike) competing with the MCP
tool layer, Phase 9, and the Knowledge Brain idea for "what's next" --
flagged here in full so the research doesn't need re-deriving, decision
deliberately left to the owner.

## Annoyances found during SOAK

- ~~`core/skills/loader.ts` kept its own `VALID_CAPABILITIES`/
  `VALID_LANES` lists, separate from `shared/types.ts`'s own union
  types~~ -- **fixed 2026-08-06.** Found live adding `MCP_TOOL_CALL`
  (ADR-035): the `gmail` skill loaded disabled ("contains an unknown
  capability") until this second, hand-kept list was also updated --
  two lists that must be kept in sync by hand for a closed,
  deliberately-curated set, with no error until a skill silently failed
  to load. Fixed properly, not just patched: both lists are now
  `Record<Capability/Lane, true>` keyed by the full union, so
  TypeScript itself rejects the build if the two ever drift again --
  this exact bug class can't recur silently.
- **2026-08-04 — four real bugs from Pedro's first live `make dev`
  session with the new dashboard (fixed same day).** `shopping_list`'s
  `remove_item`/`clear_list` were `converse`-only, same gap ADR-026
  already fixed for `launcher`/`media` -- "delete X from the shopping
  list" classified as `act`/`see`, silently missed the skill, and
  `converse`'s fallback then **claimed to have deleted the item when it
  never did** (confirmed: the garbage item was still in the real DB).
  `core/persona.md` gained an explicit rule against ever describing an
  unactioned request as done. Also fixed: "add milk and sugar" stored
  as one item with a literal embedded newline (no multi-item protocol
  existed); "Lagoa" mistranscribed the same way "Ponta Delgada" was
  (added to `WHISPER_INITIAL_PROMPT`). Real corrupted production data
  repaired (two garbage rows replaced with clean "Milk"/"Sugar").
  `system_health` also given the same multi-lane backstop preemptively
  (already broke once, ADR-024, with zero structural safety net). See
  ADR-030.
- ~~`tasks`, `brief`, `weather` were still `converse`-only~~ -- **all
  three fixed 2026-08-07.** `weather.current_weather` fixed live
  (`["converse", "see"]`, a real misroute found in the owner's own
  session -- see the same day's ADR). `tasks`'s three intents and
  `brief.morning_brief` hardened preemptively (`["converse", "act"]`)
  before any live failure, same reasoning `system_health` already got
  in ADR-030. Re-ran `bench/bench_skill_routing.ts` after each change
  (91.4% -> regression found and fixed same pass, see the `launcher`
  entry below -- then reconfirmed clean).
- **A second real regression found by that same benchmark run, fixed
  the same pass:** adding `close_app`'s PT examples introduced a real
  collision with `open_app` -- "abre o Cursor se faz favor" (open
  Cursor) started dispatching to `close_app` instead, at high
  confidence (0.832, no disambiguation involved). Root-caused with real
  `mxbai-embed-large` cosine scores, not guessed: "fecha o Cursor"
  scored *higher* against the query (0.8325) than open_app's own
  near-identical "abre o Cursor" (0.8156) -- the embedding model
  weighs the shared noun ("Cursor") more than the differing verb
  (abre/fecha). Fixed by removing all PT app-name overlap between
  `open_app`'s and `close_app`'s own examples (Spotify/Terminal/Safari
  for close, Cursor/Finder/calculadora stay open-only); verified with
  real re-measured scores before shipping, not assumed fixed from the
  theory alone.
  **Follow-up, same day: the fix is confirmed correct at the embedding
  stage but the benchmark still occasionally misses this exact case --
  a different, already-known problem, not a new one.** Re-running
  `matchUtterance` directly against the real, full 261-example index:
  `launcher.open_app` now correctly scores highest for "abre o Cursor
  se faz favor" (0.8156, `close_app` no longer competitive at all) --
  but the runner-up (`system_health.check_system`, 0.7414) sits only
  0.074 below it, just under `DISPATCH_MARGIN` (0.08), so this specific
  phrasing always falls through to `disambiguate()`'s own LLM call
  rather than auto-dispatching. Three consecutive benchmark runs the
  same night landed 91.4% / 88.6% / 91.4% -- entirely attributable to
  disambiguation's own run-to-run reliability under heavy real API
  usage (this session made a lot of live NIM/Ollama calls), the exact
  same already-documented gap as the "peanuts" entry below (ADR-038:
  "needs real per-skill logic... not attempted"), not a new regression.
  Confirmed the embedding layer itself is fully deterministic (5
  repeated calls on identical input, cosine similarity 1.000000 every
  time) before concluding this, not assumed.
- **Open, not fixed, root-caused more precisely (2026-08-06) -- not a
  simple example collision after all, the actual mechanism is deeper.**
  "I don't eat peanuts, I'm allergic" dispatched to `shopping_list.
  remove_item`. First guess (logged same day, ADR-034) was an
  embedding-example collision like the "coffee" one ADR-026 fixed --
  investigated properly with real `mxbai-embed-large` cosine-similarity
  tests before touching anything, and that guess was wrong in an
  informative way:
  - The real top-scoring example was `"take milk off the list"`
    (0.544), not the suspected `"I already bought eggs"`.
  - Swapping it for a deliberately different phrasing
    (`"cross bread off the list, we have enough"`, tested to score
    0.37-0.44 against three dietary-restriction phrasings, clearly
    below `CANDIDATE_FLOOR` 0.5) **did not actually fix the class of
    problem** -- re-running the full candidate set afterward, "I'm
    lactose intolerant" then best-matched `add_item`'s "add milk to
    the shopping list" at 0.643, *worse* than before. `shopping_list`'s
    whole vocabulary (common groceries) inherently sits at moderate
    cosine similarity with *any* short sentence naming a common food,
    regardless of add/remove/list intent -- swapping one example just
    moves which example collides, not whether the category does.
  - The real dispatch score (0.544) never crosses `DISPATCH_SCORE`
    (0.72) either, so this was never a hard embedding-threshold auto-
    dispatch -- it went through `dispatch.ts`'s LLM disambiguation step
    (`DISAMBIGUATION_SYSTEM`, which *does* have a "none" escape hatch:
    "Pick 'none' if nothing in the list actually matches") and the
    model positively chose `remove_item` over saying "none." Given this
    session's own repeated findings about NIM instability forcing
    disambiguation calls onto a much weaker fallback model, that's the
    more likely real cause -- not the embedding shortlist itself, but a
    degraded model failing to say "none" when it should have.
  - **Update 2026-08-06 (ADR-038): the suspected counter-example fix
    was actually tried, benchmarked, and rejected -- twice.** Built
    `bench/bench_disambiguation_fallback.ts` to force disambiguation
    onto the real degraded model (`qwen2.5:0.5b`) instead of guessing
    at it, and confirmed the baseline bug there (42.9% -- 3/7 fact
    statements misrouted). Two different prompt phrasings (a worked
    example matching `EXTRACTION_SYSTEM`'s style, then a single short
    rule) both **failed to fix a single degraded-model case** --
    identical 42.9% either time. Worse, the second attempt **regressed
    two unrelated, previously-correct cases** on the healthy-model
    benchmark (`launcher.open_project` wrongly chosen for "commit the
    current changes" / "run the test suite") -- exactly the non-local
    shared-prompt risk ADR-026 already named, now confirmed empirically
    rather than theoretically. Both attempts reverted; `dispatch.ts` is
    unchanged. Low real urgency stands (still an honest, harmless
    failure, not a false success or red-tier action) -- but "add a
    counter-example" is no longer the plan; see below.
  - **The real blocker turned out bigger than prompt wording.** Warming
    the local model up first still wasn't enough to get a real answer
    within production's 3000ms timeout -- a raw `curl` measured
    `qwen2.5:0.5b`'s cold-load alone at ~29.7s on this 8GB machine
    (ADR-001), because it can't hold `mxbai-embed-large` (needed for
    *every* utterance's embedding match) and the fallback chat model
    resident at once. Real degraded-mode operation likely thrashes
    between the two on every utterance, not just answering wrong but
    potentially timing out outright. Confirmed this fails safely
    (`core/main.ts`'s `handleUtterance` catches it, speaks an honest
    "something went wrong," never crashes or goes silent) -- but this
    is now the same problem as the item below, not a separate one.
    Fold together: neither should be attempted as a quick patch again
    without first deciding what "degraded mode" is actually allowed to
    cost (a longer timeout? batching lane-classify and disambiguate
    into one call? accepting local models are only viable for `reflex`,
    never `converse`, on this hardware?) -- see ADR-038 for the full
    verification trail.
    **Correction, 2026-08-06 (ADR-040): the ~29.7s figure was a one-off
    cold-disk-cache artifact, not steady-state behavior.** Re-verified
    with `core/main.ts`'s own exact try/catch shape against a genuinely
    cold model (confirmed via `/api/ps`): real answers land within the
    existing 3s budget twice in a row (3089ms, 3545ms). The actual,
    confirmed failure mode is this entry's own original one below
    (fast but wrong), not a hang -- fixed for lane classification via a
    no-model heuristic, see the entry below and ADR-040. No timeout
    change was needed.
- **2026-08-04 — `converse` hallucinated capabilities (fixed same day).**
  Real conversation: asked "can you create a skill?", JARVIS said yes and
  kept claiming to be building one, that it would show up on Skill
  Health once done — none of it real. Same for "see my current
  location." Root cause and fix in `persona.md` + `core/converse.ts` —
  see the commit. Logged here for the record; not open anymore.
- **Transcript panel only showed conversation from the moment a tab
  opened (fixed same day).** Now backfills from `/api/events`, same
  pattern `Timeline` already used. See ADR-023.
- **The dashboard didn't visually match the Figma reference beyond
  palette/font/panel-bracket style (fixed same day).** Orb ported from
  the Figma file's own SVG math, background grid + scanline restored,
  live state (idle/listening/thinking/speaking) actually wired end to
  end. See ADR-023.
- ~~`make install-daemon`'s `ears` LaunchAgent and `make dev`'s own
  `senses.ears.main` both bind the same socket~~ — **fixed 2026-08-04.**
  Recurred a second time (Pedro's own SOAK session hit it after
  restarting `make dev`), worth fixing properly rather than a doc-
  comment reminder: `make dev` now unloads the installed daemon
  automatically at start (if present) and reloads it on exit (Ctrl+C or
  normal stop), verified live -- no manual `launchctl` step needed
  either way anymore.
- **2026-08-04 — any skill using `ctx.store` in `init()` always failed
  to load (fixed same day).** `core/main.ts` passed `store: undefined as
  never` into `SkillInitContext` because no skill needed one before.
  Found live loading the real registry with `tasks`/`shopping_list`
  (both new). See ADR-024.
- **2026-08-04 — lane classifier misrouted system-stats phrasing to
  `see`/`reason` instead of `converse` (fixed same day).** "how's my
  computer doing" landed on the vision lane; `system_health` never got a
  chance to answer, and JARVIS's general-conversation fallback gave a
  vague, unverified "the system health is normal" instead of a real
  number. Fixed with a new few-shot example in `laneClassifier.ts`.
  Lane accuracy went 93.3% → 97.8% on the full 45-case benchmark (no
  regression, the fix generalized). See ADR-024.
- **Thought Stream / Error Log didn't backfill on a fresh dashboard
  tab (fixed 2026-08-04)** — same class of gap as the Transcript
  backfill fix (ADR-023), never generalized to these two panels. New
  `core/dashboardHistory.ts` ring buffer + `/api/thoughts`/`/api/errors`.
  See ADR-028.
- **Open, needs real design work — the `qwen2.5:0.5b` local fallback is
  not reliable for lane classification, only benchmarked/accepted for
  conversation quality (ADR-001).** Live-reproduced 2026-08-04 during a
  NIM outage (confirmed via direct `curl` timeout): with every
  `converse`-lane call forced onto the tiny fallback, lane
  classification itself frequently misfired to `see` for plainly
  non-visual utterances ("add butter to the shopping list", "Can you
  open Facebook?"), so `dispatch` filtered out the correct skill before
  scoring ever ran. Very likely the real explanation behind several of
  the owner's own live routing failures beyond what ADR-026 already
  fixed. ~~Candidate fix: a non-LLM heuristic fallback for lane
  classification (rules-based, same spirit as the `reflex` lane's own
  `RulesProvider`)~~ -- **built 2026-08-06, ADR-040.**
  `classifyLane` now prefers `core/router/laneHeuristic.ts`'s guess over
  trusting the `ollama` fallback's own JSON, live-verified against the
  real provider: "add butter to the shopping list" now correctly
  resolves to `converse` under total-outage conditions, was `see`.
  **Correction to this entry's own earlier ADR-038 addendum:** a
  one-off ~30s cold-load measurement that day was a disk-cache
  artifact, not steady-state behavior -- re-verified with `core/main.ts`'s
  exact try/catch shape against a genuinely cold model
  (`keep_alive=0`, confirmed via `/api/ps`): real answers land within
  the existing 3s budget, consistent with this entry's own original
  finding (wrong answers, not hangs). No timeout/latency fix was
  needed; the heuristic addresses the actual observed failure
  (confidently wrong, not slow). `disambiguate()`'s own equivalent gap
  (the "peanuts" misroute, ADR-038) is a separate, still-open problem --
  a heuristic disambiguator needs real per-skill logic, not a small
  fixed rule set like lane classification's 5 categories, and wasn't
  attempted. Related: the same tiny-model conditions also made
  `core/factExtraction.ts` produce mostly garbage facts (5 of 6 in one
  live run) — safely caught by ADR-027's gate fix, not a new gap, but
  worth knowing the approval queue may see a burst of nonsense during
  any future NIM outage.

- **Three real bugs found during real end-to-end voice + camera
  testing, 2026-08-07** (owner-authorized real mic/speaker/camera test,
  `CLAUDE.md` § 1's self-run tier; full detail and investigation trail
  in `PROGRESS.md`'s dated entry for that night). #2 and #3 fixed and
  live-verified the same night; #1 stays open pending focused
  reproduction.
  1. **Re-diagnosed 2026-08-11/12: not a hang at all -- fixed for real,
     but the fix is a UX one, not a concurrency fix.** Reproduced the
     original scenario again under the same kind of memory pressure
     (~58MB free, confirmed this machine runs close to that most of the
     time, not just that one night) -- `sample`'d the "stuck" process
     again and saw the same picture as before (no thread inside the
     whisper-server HTTP call, frame-processing thread cycling normally,
     low steady CPU). The decisive test the original investigation never
     ran: fired a *third* wake word without restarting anything. It
     triggered and completed immediately -- `busy_lock` was already
     free. The "hung" second capture had actually already finished,
     silently, with an empty transcription (`transcribe.py`'s own
     "never guessed at" rule: no text means no `emit()` at all,
     structurally indistinguishable from a hang to an observer watching
     for a specific log line that was never going to appear). Root
     cause of the *empty* transcription itself: `say`-synthesized speech
     with no pause after "Hey Jarvis" gives the wake-word falling-edge
     detector too little runway before the real command starts, same
     family as the already-documented "It is."/"and the camera."
     truncation cases -- just severe enough here to lose the whole
     utterance instead of the first word or two. **Real, fixed gap
     found from this correction:** a wake-word capture that transcribes
     to nothing gave the owner zero feedback -- the wake ack fires, then
     silence, genuinely indistinguishable from a hang without doing the
     third-wake-word test. Fixed: `Ack` gained `fire_no_speech()`
     (`senses/ears/ack.py`, a distinct `Pop.aiff` + notification, not
     `Tink.aiff` again and not an error sound -- nothing went wrong, the
     owner just wasn't heard), wired through `capture_and_transcribe`'s
     new `on_empty` callback for the wake-word path only (the hotkey
     path already has physical key-release feedback, no real ambiguity
     there). 2 new tests.
  2. **Fixed 2026-08-08.** `core/main.ts`'s ears-reading loop had no
     reconnect logic -- `connectWithRetry` only ran once, at boot. If
     `ears` (or `voice`) died after that, `core`'s utterance pipeline
     silently and permanently stalled with zero error/log, while the
     dashboard's HTTP/WS server stayed fully responsive throughout
     (found as a direct consequence of #1: killing the stuck `ears` to
     recover left `core` itself silently unable to hear anything ever
     again). Fixed with `core/senseConnection.ts`: wraps each of
     `ears`/`voice`/`eyes`'s socket in a reconnect-with-backoff loop
     (500ms initial, ×1.5 capped at 10s) that transparently resumes
     `readLines`-ing once the daemon comes back, plus a new
     `sense.connection` `ServerEvent` so a drop/reconnect is now
     dashboard-visible, not silent. 4 new unit tests
     (`core/tests/senseConnection.test.ts`, fake sockets, no real net).
     Live-verified against a real isolated `core` instance and a fake
     `ears` server that drops its connection and restarts on the same
     socket path: `core: ears disconnected, reconnecting...` →
     `core: ears reconnected.` → the very next real utterance was heard
     and answered correctly, then a real capped exponential-backoff
     retry loop confirmed once the fake daemon was gone for good.
  3. **Fixed 2026-08-08.** `skills/look`'s durable observation copy
     (`data/observations/*.jpg`, written immediately per ADR-045 so it
     survives `eyes`'s own session-close deletion while approval is
     pending) had no cleanup path if the `MEMORY_WRITE` proposal was
     rejected or simply expired (`DEFAULT_EXPIRY_MS`, 5 min default) --
     confirmed live that night, a real observation photo's approval
     expired unactioned and the JPEG stayed on disk with nothing
     referencing it. Fixed with `Gate.cleanupObservationFile()`
     (`core/gate/gate.ts`), called from all three terminal-state paths
     that can end a `kind: "observation"` `MEMORY_WRITE` proposal
     without approval (the timeout in `propose()`, `decide()`'s own
     expiry-recheck, and an explicit reject) -- best-effort `unlink`,
     silent on an already-missing file, untouched for `kind: "fact"`
     payloads and for approved observations. 6 new unit tests
     (`core/gate/tests/gate.test.ts`, real temp files): reject deletes
     it, natural-timer expiry deletes it, decide-after-expiry deletes
     it, approval keeps it, a plain fact proposal doesn't throw.

_(add as you find them — this section is the most valuable one)_

- 
