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
  installed automatically — reports the gap plainly instead). Do Not
  Disturb toggle still open, not built.
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
- **Screenshot -> clipboard/OCR** — `screencapture -c` is a built-in
  macOS CLI (no AppleScript, no new dependency), pairs naturally with
  the same `execFile`-no-shell pattern. "Read me the error on my
  screen" needs actual OCR on top (macOS's own Vision framework can do
  this via `shortcuts run` or a small native call — needs its own
  research, not assumed easy).
- **Clipboard read/write** — `pbpaste`/`pbcopy`, built-in, trivial.
  "What's on my clipboard" (read, green) / "copy X for me" (write,
  bounded SHELL_EXEC-style action).
- **Focus Mode toggle** — research (2026-08-04) found direct AppleScript
  control of macOS Focus modes has real limitations (no clean scriptable
  property, unlike volume) — same honesty concern as brightness before
  building it: verify what's actually reliable before promising it, not
  after.
- **Home Assistant integration (Wyoming protocol), if the owner has any
  smart home devices** — Home Assistant + Wyoming is 2026's mature,
  free, fully-local stack for exactly this (Whisper/Piper/openWakeWord
  are the same tools already in `senses/ears`); JARVIS could speak to a
  local Home Assistant instance instead of reinventing device control.
  Conditional on owning smart-home devices in the first place — ask
  before scoping further, don't assume.

## Platform

- **Bilingual conversation (PT-PT/English), the real implementation
  behind the CLAUDE.md § 0.1 rule change (ADR-033, 2026-08-05).** Not
  built yet -- ADR-033 only reversed the rule; this is the actual work:
  - `senses/ears`: multilingual STT. A full bilingual-conversation
    switch is a bigger, different question than the single-proper-noun
    prompt-hint fix already shipped (ADR-026/030) -- test against the
    owner's *real* voice, not synthetic `say` audio (synthetic testing
    was already found unreliable for this exact class of question,
    ADR-026).
  - `senses/voice`: a real PT-PT TTS voice selected per response
    language (macOS `say -v` has PT-PT options -- confirm quality, not
    assumed).
  - `core/persona.md` + every skill's `persona.md`: currently written
    assuming English-only output.
  - Skill manifest `examples`: untested assumption that intent matching
    still works when the owner speaks Portuguese -- may need PT-PT
    examples added alongside the English ones. Verify early.
  - Lane classification of a Portuguese utterance: also untested,
    worth an early benchmark pass (`bench/bench_router_lane.ts`-style)
    before assuming the English-only internal classifier handles it.
  Not sequenced into `ROADMAP.md` yet -- real phase-placement decision,
  left for a dedicated conversation.
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
- **A permanent benchmark gate for lane-classifier changes.** OpenJarvis's
  `docs/architecture/learning.md` describes a `BenchmarkGate` that
  scores any proposed prompt/routing edit against a benchmark *before*
  it ships, with rollback via a `CheckpointStore`. We hit the exact
  failure this guards against, twice, by hand this SOAK (ADR-024,
  ADR-026: an added few-shot example silently regressed unrelated
  cases on the 45-case benchmark, caught only because I happened to
  rerun it). `bench/bench_router_lane.ts` already exists — turning
  "rerun it and eyeball the number" into a real gate (a `make check`
  step, or at minimum a pre-commit hook, that fails if
  `laneClassifier.ts` changes and the benchmark score drops) would
  make that class of regression structurally hard to ship again,
  instead of relying on remembering to check.
- **Tag the audit log with which channel resolved an approval**
  (dashboard click vs. `gate/cli.ts` terminal command vs. voice, once
  voice approval ever exists). vierisid's `AuditEntry.channel` field
  ("click" | "voice" | "system") is a small addition with real
  forensic value — right now our `audit_log` records the decision but
  not how it arrived.
- **A reviewable list of routing misses**, not just individual
  `no_skill_matched` thought-stream entries. thevickypedia/Jarvis dumps
  every unrecognized phrase to a file for the developer to read later
  and turn into new keywords/examples (`support.unrecognized_dumper`).
  We have the data (every `no_skill_matched` trace), just not surfaced
  as a punch list — would make closing gaps like ADR-026's coffee
  collision a matter of reading a list instead of re-reading the whole
  conversation log by hand.
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
- **Batch fact-extraction review after a period of idle activity,
  instead of one approval per utterance.** N.E.K.O's `app/memory_server/
  gates.py` only runs its background memory-consolidation pass after
  `IDLE_THRESHOLD` (10s) of no new conversation, with a minimum-new-
  messages floor before bothering to review at all. ADR-027/ADR-028
  already flagged approval-fatigue as a real risk once `fact-extraction`
  approvals show up regularly (confirmed live 2026-08-04: 6 proposals
  from one 8-utterance test run). Batching "review what I might have
  learned this conversation" into one approval instead of N could cut
  that noise a lot — real UX design work (what does one batched
  approval's `humanSummary`/diff even look like?), not a quick patch.
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
- **Gmail via Google's own official MCP server**
  ([developers.google.com/workspace/gmail/api/guides/configure-mcp-server](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server)) --
  OAuth, inherits the owner's own account permissions, no ToS risk.
  Read/search/label emails, draft (never send unreviewed -- drafting is
  `FS_WRITE`-adjacent yellow, sending crosses into CLAUDE.md § 5's red
  tier, "anything that sends a message to another human," and stays
  owner-only regardless of MCP).
- **Google Analytics via Google's own official MCP server**
  ([github.com/googleanalytics/google-analytics-mcp](https://github.com/googleanalytics/google-analytics-mcp)) --
  same OAuth model, exposes the GA4 Reporting/Admin APIs directly.
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

## Annoyances found during SOAK

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
- **Open, not fixed -- `tasks`, `brief`, `weather` are still
  `converse`-only, same pattern class as the three skills above that
  have now broken live at least once each.** No direct evidence yet
  that `complete_task`/`morning_brief`/`current_weather` misroute (this
  audit found `launcher`/`media`/`shopping_list`/`system_health` broke,
  didn't find evidence these three have), so left alone rather than
  guessed at -- but worth a look the moment any of them goes quiet in
  real use, rather than rediscovering the same root cause a fourth
  time. See ADR-030's closing note.
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
  - The robust fix is almost certainly a counter-example in
    `DISAMBIGUATION_SYSTEM` ("a statement about the owner's own facts/
    preferences is not an action on any list, pick 'none'") -- the
    same shape of fix `factExtraction.ts` already got in ADR-027 for
    the identical failure pattern. **Deliberately not made here**:
    `DISAMBIGUATION_SYSTEM` is a *shared* prompt across every skill's
    disambiguation, and ADR-026 already proved once that editing a
    shared classifier/disambiguation prompt can silently regress
    unrelated cases elsewhere -- this needs the same benchmark-backed
    verification that fix used, not a same-session patch. Low real
    urgency: the live consequence here was an honest, harmless "I
    couldn't find Peanuts on the list," not a false success or a
    red-tier action.
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
  fixed. Candidate fixes, none built yet: a non-LLM heuristic fallback
  for lane classification specifically (rules-based, same spirit as the
  `reflex` lane's own `RulesProvider`), retry/backoff before falling
  back to the tiny model, or benchmarking whether a slightly larger
  local model is viable now vs. when ADR-001 last checked. See ADR-028.
  Related: the same tiny-model conditions also made
  `core/factExtraction.ts` produce mostly garbage facts (5 of 6 in one
  live run) — safely caught by ADR-027's gate fix, not a new gap, but
  worth knowing the approval queue may see a burst of nonsense during
  any future NIM outage.

_(add as you find them — this section is the most valuable one)_

- 
