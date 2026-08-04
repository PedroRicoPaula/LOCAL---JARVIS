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
- **Transcript panel only shows conversation from the moment a tab
  opens** — it's push-only by design (`core/ws.ts` has no replay), but
  unlike the Timeline (which backfills from `/api/events`), reopening
  the dashboard after talking to JARVIS shows "Waiting for the first
  utterance" even though the conversation is sitting right there in
  `/api/events`. Worth a small backfill fix: filter that same endpoint
  to `utterance`/`response` kinds on `Transcript`'s mount, same pattern
  `Timeline` already uses.
- **`make install-daemon`'s `ears` LaunchAgent and `make dev`'s own
  `senses.ears.main` both bind the same socket if run at the same
  time** — one silently loses. Hit this directly while testing `make
  dev` for the SOAK. `make dev`'s own doc comment should say to
  `make uninstall-daemon` (or `launchctl unload`) first; not yet fixed.
- **The dashboard doesn't visually match the Figma reference beyond
  palette/font/panel-bracket style** — no animated Orb (the design's
  centerpiece), no background grid, no scanline, no live state
  (idle/listening/thinking/speaking — `ServerEvent`'s `speaking` variant
  is typed but `core/main.ts` never emits it). ADR-022 deliberately
  scoped Phase 7 to function over decoration; whether to close this gap
  is the owner's call, not assumed.

_(add as you find them — this section is the most valuable one)_

- 
