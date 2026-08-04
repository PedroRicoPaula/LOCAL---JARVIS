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

- **`core` <-> `senses/ears`/`senses/voice` IPC wiring — flagged during
  Phase 5, not owned by any phase's checklist yet.** `senses/echo_bridge`
  is still explicitly a Phase-1-only stand-in for `core`; Phase 5 built a
  real `Conversation` interface (`ctx.say`/`ctx.ask`) with a genuine stdio
  implementation, but nothing yet replaces `echo_bridge` with a real
  connection from `core` (TypeScript) to the Python voice pipeline over
  the existing Unix-socket `senses/ipc.py` transport. Needs a real phase
  or an explicit decision about which phase absorbs it — raised with
  Pedro rather than assumed.
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

_(add as you find them — this section is the most valuable one)_

- 
