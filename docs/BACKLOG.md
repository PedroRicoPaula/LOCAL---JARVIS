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
- Additional providers: Groq, Gemini, OpenRouter, Cerebras
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

## Annoyances found during SOAK

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
