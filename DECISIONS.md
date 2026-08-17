# DECISIONS.md

Architectural decision records. Append only. If a decision is reversed, add a
new ADR that supersedes the old one — do not edit history.

Format: Context → Decision → Consequences.

---


## Index

| ADR | Title |
|---|---|
| [ADR-001](docs/decisions/ADR-001.md) | `converse` / lane-classifier model |
| [ADR-002](docs/decisions/ADR-002.md) | `reason` provider |
| [ADR-003](docs/decisions/ADR-003.md) | STT: whisper.cpp |
| [ADR-004](docs/decisions/ADR-004.md) | TTS: `say` then Piper |
| [ADR-005](docs/decisions/ADR-005.md) | Wake word: openWakeWord |
| [ADR-006](docs/decisions/ADR-006.md) | Code harness: Aider |
| [ADR-007](docs/decisions/ADR-007.md) | Store: SQLite |
| [ADR-008](docs/decisions/ADR-008.md) | No single provider dependency |
| [ADR-009](docs/decisions/ADR-009.md) | Paid providers deferred |
| [ADR-010](docs/decisions/ADR-010.md) | The camera is a voice-controlled session |
| [ADR-011](docs/decisions/ADR-011.md) | The owner is the source of truth for quantities |
| [ADR-012](docs/decisions/ADR-012.md) | Skills come before the dashboard |
| [ADR-013](docs/decisions/ADR-013.md) | `ctx.ask` is a platform primitive |
| [ADR-014](docs/decisions/ADR-014.md) | Phase 1 IPC and VAD: native whisper.cpp VAD, plain Unix sockets |
| [ADR-015](docs/decisions/ADR-015.md) | Phase 2 wake word: real-time audio, silence detection, ack |
| [ADR-016](docs/decisions/ADR-016.md) | Removed the post-Phase-2 soak; verification splits into self-run and owner-required tiers |
| [ADR-017](docs/decisions/ADR-017.md) | Phase 3 router: provider wiring, fallback semantics, testability |
| [ADR-018](docs/decisions/ADR-018.md) | Phase 4 memory: node:sqlite + sqlite-vec, schema deviations, cap design |
| [ADR-019](docs/decisions/ADR-019.md) | Phase 5 skill host: routing thresholds, namespace enforcement, stubs |
| [ADR-020](docs/decisions/ADR-020.md) | core ↔ senses integration, fallback conversation, fact extraction over a graph engine |
| [ADR-021](docs/decisions/ADR-021.md) | Phase 6 gate: schema placement, key management, in-process approval |
| [ADR-022](docs/decisions/ADR-022.md) | Phase 7 dashboard: WS/HTTP split, ui/ as a separate project, live verification without the MCP Playwright tool |
| [ADR-023](docs/decisions/ADR-023.md) | SOAK 1: live JARVIS state, honest error reporting, Orb ported from the owner's Figma design |
| [ADR-024](docs/decisions/ADR-024.md) | SOAK 1: the gate gets a real executor, five real skills, and two bugs the loading path never exercised before now |
| [ADR-025](docs/decisions/ADR-025.md) | SOAK 1: `SHELL_EXEC` becomes a real dispatcher (media, browser, volume, brightness) |
| [ADR-026](docs/decisions/ADR-026.md) | SOAK 1: real routing bugs found by reading the actual conversation log, and a Whisper vocabulary fix |
| [ADR-027](docs/decisions/ADR-027.md) | SOAK 1: fact extraction bypassed the gate entirely -- the real root cause behind ADR-026's routing bugs |
| [ADR-028](docs/decisions/ADR-028.md) | SOAK 1: Playwright dashboard verification, Thought Stream / Error Log backfill fix, and a live-reproduced lane-classifier reliability gap under NIM outage |
| [ADR-029](docs/decisions/ADR-029.md) | SOAK 1: five dashboard features built for real usage data (test console, feedback, live Tasks/Shopping panels, metrics) |
| [ADR-030](docs/decisions/ADR-030.md) | SOAK 1: four real bugs from Pedro's first live `make dev` session with the new dashboard -- shopping_list mis-routing, a hallucinated-action honesty gap, a multi-item extraction bug, and one more Whisper vocabulary miss |
| [ADR-031](docs/decisions/ADR-031.md) | SOAK 1: four more free-tier providers (Groq, Mistral, Google/Gemini, OpenRouter), `ollama` demoted to true last resort |
| [ADR-032](docs/decisions/ADR-032.md) | SOAK 1: `weather` silently ignored "tomorrow," asked for a city instead, timed out |
| [ADR-033](docs/decisions/ADR-033.md) | reversing the v0.1 "English only" rule: JARVIS's spoken conversation becomes bilingual PT-PT/English |
| [ADR-034](docs/decisions/ADR-034.md) | SOAK 1: hybrid recall (and a real bug it surfaced -- semantic indexing never actually ran in production), plus Spotify control |
| [ADR-035](docs/decisions/ADR-035.md) | SOAK 1: MCP integrated for real, Gmail as the first server, everything gated uniformly |
| [ADR-036](docs/decisions/ADR-036.md) | SOAK 1: Gmail OAuth completed, first live MCP call, a real registry bug and a wrong setup step found |
| [ADR-037](docs/decisions/ADR-037.md) | Gmail MCP: a real, external Google bug, not a config gap, closes out this integration's SOAK-1 work |
| [ADR-038](docs/decisions/ADR-038.md) | the "peanuts" bug: two prompt fixes tried, benchmarked, both rejected -- the real problem is bigger than wording |
| [ADR-039](docs/decisions/ADR-039.md) | bilingual PT-PT/English, the real implementation (ADR-033's follow-through) |
| [ADR-040](docs/decisions/ADR-040.md) | degraded-mode lane classification: a no-model heuristic replaces trusting the last-resort fallback's JSON |
| [ADR-041](docs/decisions/ADR-041.md) | `clipboard` skill: read/write, both gated, a real lane-declaration bug found and fixed the same day |
| [ADR-042](docs/decisions/ADR-042.md) | Do Not Disturb / Focus toggle, via Shortcuts.app, not AppleScript |
| [ADR-043](docs/decisions/ADR-043.md) | full-codebase security + quality review, two real vulnerabilities fixed |
| [ADR-044](docs/decisions/ADR-044.md) | closing out the full-codebase review: all 9 remaining findings fixed |
| [ADR-045](docs/decisions/ADR-045.md) | Phase 8 Tasks 1-2: `senses/eyes`, camera wiring, vision providers |
| [ADR-046](docs/decisions/ADR-046.md) | `APP_CONTROL`: a new green capability, and the `Gate.propose()` bug it exposed |
| [ADR-047](docs/decisions/ADR-047.md) | GitHub as the second real MCP server; extracted the shared skill helper |
| [ADR-048](docs/decisions/ADR-048.md) | Permanent benchmark regression gate |
| [ADR-049](docs/decisions/ADR-049.md) | Reviewable routing-misses list; first real schema migration |
| [ADR-050](docs/decisions/ADR-050.md) | Batched, idle-triggered fact extraction |
| [ADR-051](docs/decisions/ADR-051.md) | The 2026-08-07 `ears` "hang" wasn't one; fixed the real gap it exposed |
| [ADR-052](docs/decisions/ADR-052.md) | `tasks` on real Reminders.app; new green `REMINDERS` capability |
| [ADR-053](docs/decisions/ADR-053.md) | Real-time hand tracking as a distinct camera mode |
| [ADR-054](docs/decisions/ADR-054.md) | Dashboard visual refresh: real depth, real data, responsive |
| [ADR-055](docs/decisions/ADR-055.md) | Hand-tracking fixes from live testing: mirroring bug, background blur |
| [ADR-056](docs/decisions/ADR-056.md) | Hand-driven real cursor, click gated by a physical key |
| [ADR-057](docs/decisions/ADR-057.md) | Real performance fixes for gesture tracking, found by measuring, not guessing |
| [ADR-058](docs/decisions/ADR-058.md) | Pointer control: 8 real findings from a dedicated security review, all fixed |
| [ADR-059](docs/decisions/ADR-059.md) | The "peanuts" bug fixed: don't trust the degraded model's disambiguation choice |

