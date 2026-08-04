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
- Music control (play/pause/skip/what's playing) via Music.app/Spotify
  AppleScript — same `execFile`-no-shell pattern as `core/executors/
  apps.ts`, SHELL_EXEC, small and bounded.
- Open a URL in the browser ("open GitHub", "look up X") — `open <url>`,
  same executor as opening apps, SHELL_EXEC.
- System controls: volume, brightness, Do Not Disturb toggle via
  `osascript` — small, bounded, same executor pattern.
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

## Platform
- `make types` codegen from `shared/types.ts` (its own docstring already
  names this for the Python side, never built). Phase 7 added a second
  hand-kept mirror (`ui/src/lib/types.ts`, the wire subset `ServerEvent`/
  `ClientEvent`/`ApprovalRequest`/etc. need, since `ui/` is a separate
  Next.js project and can't just import `core`'s `.ts` files across the
  process boundary) — now two manual mirrors to keep in sync by hand
  instead of one. Worth it once a drift bug actually happens, not before.
- Bounded continuous-vision sessions ("watch me solder this")
- Mobile client for approvals away from the desk
- Sandboxed `act` lane (OpenHands-style container)
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
- **`make install-daemon`'s `ears` LaunchAgent and `make dev`'s own
  `senses.ears.main` both bind the same socket if run at the same
  time** — one silently loses. Hit this directly while testing `make
  dev` for the SOAK. `make dev`'s own doc comment should say to
  `make uninstall-daemon` (or `launchctl unload`) first; not yet fixed.
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

_(add as you find them — this section is the most valuable one)_

- 
