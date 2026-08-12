# Phase 5b — core ↔ senses integration, same-session follow-up, 2026-08-04

**Context.** Phase 5's own close-out flagged a real gap: no phase's
checklist ever wired `core` to the Python voice pipeline built in Phases
1-2. Pedro asked to resolve it before Phase 6 rather than let it keep
compounding — see the conversation for the full reasoning on why (this
isn't a numbered ROADMAP phase, but carries the same rigor: branch,
tests, live verification, documented).

**Built:**
- `core/ipc.ts`: the Node side of `senses/ipc.py`'s newline-JSON Unix
  socket transport — `senses/ipc.py`'s own docstring named this as the
  plan since Phase 1 ("whoever orchestrates them ... core/ from Phase 3
  on"), just never actually done until now.
- `core/skills/conversation/ipc.ts`: the real `Conversation` — `say()`
  sends to `voice`, `ask()` sends the question then waits for the next
  utterance `ears` produces. Deliberately decoupled from any real
  `net.Socket` (takes a plain `sendToVoice(text)` function) so the
  queue/timeout logic is unit-tested without one.
- `core/converse.ts`: the general-conversation fallback docs/SKILLS.md
  § 3's own routing diagram names ("if nothing matches -> general
  conversation, no skill") but Phase 5 never implemented — without it,
  `no_skill_matched` was a dead end, nothing spoke back at all.
- `core/main.ts`: the real entrypoint. Connects to both sockets, loads
  skills, and for every utterance: remembers it, dispatches through the
  skill host or falls back to general conversation, remembers the
  response, fires fact extraction in the background. Replaces `senses/
  echo_bridge.py` outright (deleted — its own docstring already called
  itself a Phase-1-only stand-in for exactly this).
- `core/factExtraction.ts`: automatic durable-fact extraction from
  conversation (owner's explicit request — "o jarvis deveria conseguir
  aprender com o tempo"). Fire-and-forget from `core/main.ts` (never
  adds latency to the spoken response, CLAUDE.md § 7). Confidence is
  deliberately conservative (0.8+ only for explicit statements; anything
  under 0.5 is dropped, never stored shaky) and a malformed model
  response degrades to "nothing learned this turn," never a crash.
- `core/memory/recall.ts` gained `semanticTimeoutMs` (default 1500ms):
  semantic search is now best-effort — recent turns and facts (DB-only,
  no embedding call) still make it into the assembled context even if
  the embedding call is slow. Does not cancel the underlying request
  (`Embedder` has no `AbortSignal` in its contract); just stops blocking
  the response on it — an honest, documented limitation, not silent.
- Voice changed from `Samantha` to `Daniel` (male, British) —
  `senses/voice/config.py`'s `SAY_VOICE` default, owner's explicit choice
  after hearing the first live exchange.
- `Makefile`'s `dev` target now starts `node core/main.ts` in place of
  `senses.echo_bridge`; `docs/BACKLOG.md`'s now-resolved IPC-gap entry
  removed.
- 15 new tests (128 TS total, 148 across both languages): `ipc.ts`
  conversation queue logic, `converse.ts`'s fallback + degradation,
  `factExtraction.ts`'s extraction/filtering/failure-handling,
  `recall.ts`'s new timeout behavior. `core/main.ts` itself is not
  unit-tested, same convention as `senses/ears/main.py`/`senses/voice/
  main.py` — proven live instead.

**Verified live — the actual proof this phase exists for:**
- Full stack (`senses/voice`, `senses/ears`, `core/main.ts`) started via
  `make dev`, real acoustic loopback (`say -v Samantha "Hey Jarvis, good
  morning"`) into the real mic. **Pedro then took over and tested live
  himself**, unprompted, asking real questions ("How are you?", "Can you
  tell me the weather in Punta de la Gada, Azores, Portugal?", "Can you
  make research on internet to find what is the weather for today?") —
  all three round-tripped: heard by `ears`, dispatched by `core` (none
  matched a skill, all three correctly fell through to general
  conversation), answered by NIM through `core/persona.md`, spoken by
  `voice`, and durably written to a real `data/jarvis.db` (confirmed by
  querying it directly afterward — `events` has all six rows, in order).
  This is the first time in the project's history the built `core` (router,
  memory, skills — Phases 3-5) actually received and answered anything
  real, not a fake or a script.
- Fact extraction verified live afterward against real NIM: "I don't eat
  peanuts, I'm allergic to them" -> extracted both `diet.avoids: peanuts`
  and `health.allergies: peanuts`, confidence 0.95 each, both correctly
  linked to their source event.

**Left over — needs Pedro, later, not blocking:**
- Real memory pressure was observed on this 8GB machine during Pedro's
  live test (as low as ~57MB free) — confirmed independent of my own
  session's activity by testing again with the ears/voice/whisper-server
  processes stopped and getting the same result, and confirmed
  independent of embedding model size (even the 45MB `all-minilm` timed
  out, ruling out "just use a smaller model"). The recall timeout fix
  keeps this from blocking a response, but doesn't make it fast — closing
  some apps (this machine had dozens of Chrome renderer processes running
  during the test) or a reboot before the next live session would likely
  help more than anything else on the table right now.

**Decided:**
- **Declined a graph-based memory engine (Graphiti/Zep-style) for fact
  extraction, after researching it at the owner's request.** Real value
  for multi-hop reasoning over large, densely interconnected datasets —
  the production-validated approach (Graphiti) requires Neo4j or FalkorDB
  running alongside it, "at least three systems to provision, monitor,
  and maintain." Neither justified by nor a good fit for one person's
  personal facts (dozens to a few hundred, mostly flat: preferences,
  restrictions, project details) on an already memory-constrained 8GB
  machine. Presented as one of three options; owner chose the simple
  extraction-onto-the-existing-`facts`-table approach. A lightweight
  relation table on top of SQLite (not a new database) is the honest next
  step if real use ever shows facts needing to reference each other —
  not built ahead of that need (CLAUDE.md § 0.6).
- **Fact extraction runs on every utterance, not just ones that "sound
  like" they contain a fact.** Simpler than trying to pre-filter, and
  NIM's rate budget easily covers one owner's real conversational volume
  — pre-filtering would be premature optimization for a cost that isn't
  actually a problem yet.
- **`core/main.ts` uses one long-lived session id (`"default"`) for the
  whole process run.** Real multi-session tracking (new session on wake
  after a gap, etc.) isn't needed by anything built so far; `Memory`'s
  and `SkillContext`'s session-scoped operations just need *a* stable id
  to group a run's conversation under.

**Surprised me:**
- **The "14s converse latency" question turned out not to be a code
  problem at all.** Direct timing showed `classifyLane` and the full
  `generalConversationReply` both completing in ~2.4s on a second call,
  but a *first* semantic-recall embedding call took **46.6 seconds** —
  and a raw `curl` to the same Ollama endpoint, independent of any of
  this project's code, reproduced 26.5s moments later. Suspected "just
  use a smaller embedding model" and tested `all-minilm` (45MB vs
  `mxbai-embed-large`'s 669MB) under the same conditions — also timed
  out past 30s, ruling that out. `vm_stat`/`memory_pressure` showed the
  actual cause: ~57MB of free RAM out of 8GB. This machine's hardware
  ceiling (already established, ADR-001) isn't just a `converse`-lane
  provider-choice issue anymore — it can now visibly throttle a *local*
  embedding call too, under enough concurrent load. The fix that matters
  isn't a smarter model choice, it's not letting a slow call block the
  response at all (the new `semanticTimeoutMs`).
- **`core/main.ts`'s very first real utterances weren't ones I wrote —
  Pedro started talking to the running system on his own** the moment he
  saw it come online, without being asked to. Unplanned, and exactly the
  kind of organic validation a synthetic test can't produce — three
  genuinely varied real questions, all handled correctly on the first try.

---
