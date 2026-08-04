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
