# CLAUDE.md — Agent Conduct Rules

You are building JARVIS, a local-first personal AI assistant. Read `SPEC.md` for
architecture and `ROADMAP.md` for what to build. Read `PROGRESS.md` to find out
where we are. Never start work without reading all three.

Before writing any skill, also read `docs/SKILLS.md`. Skills are the point of
this system; the platform exists to host them.

---

## 0. Non-negotiables

1. **Code, comments, docs, commit messages, and internal prompts stay
   English. No exceptions.** Internal prompts (intent classification,
   JSON extraction, routing, structured vision output — CLAUDE.md § 4)
   are English regardless of what language the owner is speaking to
   JARVIS in — small local models are measurably more reliable at
   structured tasks in English; this is unrelated to the rule below and
   unaffected by it.

   **JARVIS's spoken conversation (STT understanding and TTS output) is
   bilingual: European Portuguese (PT-PT) and English, matching
   whichever language the owner is actually speaking, including a
   natural mid-sentence switch for a word that's more natural in the
   other language.** This reverses the original v0.1 decision ("English
   only, no exceptions, chosen for accuracy") — see DECISIONS.md's ADR
   for the reversal and what it actually requires to build (STT
   language handling, TTS voice selection, `persona.md`, skill
   examples) — logged in `docs/BACKLOG.md`, not built yet as of this
   entry. The wake word itself ("hey jarvis") is unaffected — it's a
   fixed trained trigger phrase (Phase 2, openWakeWord), independent of
   the conversational language spoken after it wakes JARVIS up.

   This rule governs the *deliverable* only. The coding agent's chat
   replies in this tool — summaries, mini-feedback while executing,
   questions — are in Portuguese, by the owner's explicit request. Code
   blocks, commit messages, and file contents inside those replies stay
   English regardless.

2. **Free tier only. No paid provider is built.** Every dependency must be free
   and, where possible, offline. The `ModelProvider` interface is designed so a
   paid adapter could be added later, but none is written, stubbed or configured
   now, and no phase may require a paid key. If you think something needs a paid
   service, stop and ask.

3. **The owner is the only executor.** Nothing in this system performs a
   side-effecting action without an approval recorded in the audit log first.
   See "Capability rules" below.

4. **The camera is a session, opened by voice.** ARMED never means recording.
   No frame is captured without an explicit request. See `SPEC.md` § 6.

5. **No model ever produces a number that gets stored as fact.** Quantities are
   declared by the owner and confirmed by read-back. Vision identifies; it never
   quantifies. See `SPEC.md` § 7.

6. **No scope creep.** If you notice something that would be nice to add, write
   it in `docs/BACKLOG.md` and move on. Do not build it.

7. **Learning lives in the project, not in chat.** When you discover something
   that will matter later — a hardware constraint, a library quirk, a bug and
   its root cause, a model that doesn't behave as expected, a dead end — write
   it into `PROGRESS.md`, `DECISIONS.md` (as an ADR if it's a real decision),
   or `docs/BACKLOG.md`, in the same work session, not just in the chat
   transcript. Chat history is not durable context; these files are what the
   next session (yours or another agent's) reads first. This is the same
   reasoning as `docs/ARCHITECTURE.md`'s drift rule applied to knowledge in
   general: if it only exists in conversation, it will be re-discovered the
   hard way in three months.

---

## 1. Phase discipline

Work strictly one phase at a time, in the order given in `ROADMAP.md`.

At the end of every phase:

1. Run the phase's Definition of Done checks. Paste the actual command output.
2. Update `PROGRESS.md`'s `## Current state` section: what was built,
   what was decided, what is left, what surprised you. For the detailed
   phase write-up, add a new `docs/progress/phase-N.md` (or `soak-N.md`)
   file and a row in `PROGRESS.md`'s own `## Phase log` index table —
   same split as `DECISIONS.md`/`docs/decisions/`, done 2026-08-12
   because the single growing file had reached 3076 lines. `## Current
   state` is the only section that should still change shape often;
   everything else in `PROGRESS.md` (scaffold, hardware, key numbers,
   open questions, known issues) is closer to append-only.
3. Record any architectural decision as a new ADR: write
   `docs/decisions/ADR-NNN.md` (next number, ADR format — Context →
   Decision → Consequences) and add its row to `DECISIONS.md`'s own
   index table. `DECISIONS.md` itself is index-only, one file per ADR
   since 2026-08-12 (57 ADRs by then, still growing) — see
   `docs/decisions/ADR-057.md` for that split's own reasoning.
4. `git commit` with the message format `phase(N): <summary>`.
5. **STOP. Write "Phase N complete. Awaiting approval for Phase N+1." and end
   your turn.**

Do not begin the next phase without written approval, even if the current phase
finished early and the next one looks trivial. This rule exists because context
degrades across long sessions and the owner has 4–8 hours a week. Losing a phase
boundary costs a weekend.

Phases marked 🛑 **SOAK** in the roadmap are mandatory two-week pauses where the
owner uses what exists before more is built. Do not offer to "get ahead" during
a soak. As of 2026-08-04 there is one SOAK, placed after Phase 7 (Dashboard) —
see `ROADMAP.md`'s changelog note and `DECISIONS.md`'s ADR for why the earlier
post-Phase-2 soak was removed: a soak's value is testing whether daily use is
*pleasant*, and that needs something worth using daily (real responses, real
actions) — not just a wake word that echoes.

### Verification within a phase, without a soak gate

Removing the early soak doesn't remove verification — it moves the burden
onto doing more of it *during* the phase, myself, before ever asking the
owner to test anything. Split every phase's Definition of Done into two
tiers before starting work on it:

- **Self-run.** Anything a fake, a synthetic input, a scripted CLI/HTTP
  call, or a browser automation tool can exercise without the owner's body
  (voice, hands, a physical reboot) in the loop. This is not just
  `make check` — it includes live smoke tests against the real
  components when a fake can't stand in for them (a real model, a real
  mic loopback via `say`, a real HTTP call to a locally-running server).
  From Phase 7 (Dashboard) onward, this includes **Playwright** driving
  the actual running UI — click the approval button, confirm the request
  executes, close the tab mid-approval and confirm it survives, etc. Run
  everything in this tier before reporting a phase done; fix what it
  finds like any other bug per § 2.
- **Owner-required.** Genuinely needs Pedro's real voice, real body,
  or real elapsed time — multi-day usage patterns, a physical reboot,
  judging whether an interaction *feels* right. Ask for this explicitly
  and say why a self-run check can't cover it. When the owner chooses to
  waive part of this tier (as happened in Phases 1 and 2), record exactly
  what was waived and why in `PROGRESS.md` — waived is not the same as
  passed, and both must be discoverable later.

A phase's DoD is not "done" until the self-run tier has actually been run,
not just written down as a plan.

---

## 2. When you hit an error

1. Read the actual error. Do not guess.
2. Fix it and retry, up to three attempts.
3. If three attempts fail, stop and report: what you tried, what happened, what
   you think is wrong, and two options for how to proceed. Do not thrash.
4. Never work around a failing test by weakening the test.

---

## 3. Code standards

- TypeScript strict mode on. No `any` unless annotated with why.
- Python: type hints, `ruff` clean.
- Every module that talks to the outside world (a model provider, the camera,
  the microphone, the network) gets a fake implementation for tests. Tests must
  pass with no network and no models loaded.
- Prefer boring. This project has to be maintainable by one person with limited
  hours, six months from now.
- No file over ~300 lines. Split it.

## 4. Prompt language rule

All *internal* prompts — intent classification, JSON extraction, routing,
structured vision output — are written in English and request JSON. This is not
about the user's language; small local models are measurably more reliable at
structured tasks in English. Never send an internal prompt in any other
language.

All prompts that produce text the owner will *hear* go through the persona in
`core/persona.md`.

---

## 5. Capability rules

Every skill declares the capabilities it needs. The gate enforces them. There
are three tiers and they are not negotiable by a model at runtime:

| Tier | Capabilities | Behaviour |
|---|---|---|
| **Green** | `MEMORY_READ`, `FS_READ` (whitelist only), `CAMERA`, `NET_READ`, `APP_CONTROL`, `REMINDERS`, `POINTER_CONTROL` | Runs automatically. Logged. |
| **Yellow** | `FS_WRITE`, `GIT_WRITE`, `SHELL_EXEC`, `MEMORY_WRITE`, `WEBHOOK` | Requires approval. Blocks until answered or expired. |
| **Red** | Credential access, `rm`, package publish, anything that moves money, anything that sends a message to another human | Never automatic. Never proposed by a model. Only reachable by the owner typing it. |

`APP_CONTROL` (added 2026-08-07, owner request): opening/closing an app,
project, or website — a window appearing/disappearing, immediately
visible, trivially reversible. Deliberately narrow: media control,
volume/brightness, clipboard read/write, and screenshots stay
`SHELL_EXEC`/yellow — they can expose or change something the owner
can't immediately see and undo the way a window can. Any future
capability that deletes something (files, messages, anything not
trivially recoverable) stays yellow at minimum, red if it's
irreversible/`rm`-class — this tier is not a precedent for widening
`SHELL_EXEC` wholesale.

`REMINDERS` (added 2026-08-12, owner request): reading/writing the
owner's real Reminders.app tasks via exactly one executor
(`core/executors/reminders.ts`) — create, list, mark-complete. Same
reasoning as `APP_CONTROL`: narrow, immediately visible in
Reminders.app itself, trivially reversible (delete/uncheck an item).
Chosen explicitly over `SHELL_EXEC`/yellow — a system-app write would
default there, but per-call approval on every "add a task" would
undo this project's own approval-fatigue work. Not a precedent for
any other system-app write defaulting to green; each one is its own
decision, same as this and `APP_CONTROL` were.

`POINTER_CONTROL` (added 2026-08-12, owner request, after a broader
version was refused): the real macOS cursor follows the hand
(`senses/eyes/pointer.py`). A first proposal — a spoken "clicar aqui"
firing a real click immediately, anywhere on screen — was refused: a
click that can land anywhere can't tell a harmless link from
"Send"/"Delete"/a payment confirm/a password field, so it has to be
judged by the worst thing it could hit, which is red-tier territory.
What's built instead, and what makes this green rather than red or even
yellow: cursor *movement* is the automatic, harmless, always-on part
(visible, trivially undone) — but a click **never** fires from a
gesture, a model, or a voice command alone. Only a real, physical
keypress fires it (`ClickTrigger`, not the Gate), the exact same "a
real keystroke fires it" property red-tier actions already rely on,
just enforced structurally in the executor instead of via the approval
queue — routing every individual mouse click through yellow-tier
approval would be absurd and would defeat hands-free pointing entirely.
See DECISIONS.md's ADR for the full reasoning and the refused
alternative.

"Only reachable by the owner typing it" survives voice-first design
intact: the *content* of a red-tier action (e.g. a message to send) can
be drafted and revised entirely by voice — propose → read back →
confirm, same pattern as every skill (§ 5b) — but the actual send only
happens on the owner's own typed/clicked approval (dashboard Approve,
or `gate/cli.ts`'s typed `approve <id>`), never a spoken "yes" alone.
Voice composes; a real keystroke or click still fires it. See
`docs/BACKLOG.md`'s computer-use entry for the concrete flow this is
designed against.

Hard rules:

- Model output **never** flows directly into an executor. It produces a
  *proposal*. The gate turns proposals into actions.
- Every approval carries a single-use nonce and an expiry. Replay fails closed.
- The audit log is append-only. Rejections are logged too.
- `FS_READ` is whitelist, not blacklist. `~/.ssh`, `~/.aws`, keychains,
  `.env` files and anything matching `*secret*` or `*credential*` are never
  readable, whitelist or not.
- Secrets live in macOS Keychain, accessed via `security find-generic-password`.
  Never in `.env` committed to git. `.env.example` documents names only.

---

## 5b. Skill rules

Read `docs/SKILLS.md` in full before writing a skill. Summary of what is
enforced rather than merely recommended:

- A skill lives entirely in one directory and owns its tables, prefixed
  `skill_<id>_`. It never writes to shared `events` or `facts` directly.
- A skill cannot import an executor. Lint enforces this.
- A skill must load and pass its tests with no network, no models, no camera
  and no database file. Everything comes through `SkillContext`.
- A skill that throws on load is disabled and reported. It never takes down core.
- Every skill ships a `persona.md`. If all skills sound the same, that is a bug.
- Manifest `examples` are routing data, not documentation. Write them the way
  the owner actually speaks, including the terse and sloppy forms.
- Use `ctx.ask` for questions. Do not build your own question-and-wait loop.
- The default shape of a skill is: propose → read back → confirm → write.

## 6. Honesty rules for the assistant persona

JARVIS is meant to teach, correct and inform. That only works if it is calibrated.

- When the answer comes from a local model on a topic where being wrong matters
  (health, safety, electronics, anything with a cost), the response must either
  be routed to the `reason` lane or carry an explicit uncertainty marker.
- Never present an estimate as a measurement. Vision identifies; the owner
  quantifies; a static table converts. No model output becomes a stored number.
  See `SPEC.md` § 7.
- On fine visual detail — resistor bands, pin numbers, small text at an angle —
  ask the owner to confirm before advising. Silent assumption is a defect.
- If the system does not know, it says so. A confidently wrong "father" is worse
  than no father.

---

## 7. Latency is a feature, not an optimisation

The `converse` lane has a hard budget: first audible syllable within 1.5s of the
owner finishing speaking. Design for streaming from the first commit:

- TTS starts on the first complete sentence, not the full response.
- STT streams partial results.
- Never `await` a full model response before starting playback.

If you build it synchronously "for now", it will never be fixed. Do not.

---

## 8. Git protocol

- One branch per phase: `phase/NN-short-name`.
- Commit at every working checkpoint, not just at phase end.
- The `act` lane (code skill) always works on its own branch and never commits
  to `main`. Its output is a diff for the owner to review.
- `main` is always in a state where `make check` passes.

---

## 9. What to do when you disagree

Say so. Once, clearly, with your reasoning, then follow the instruction unless it
would break a non-negotiable in § 0 or a capability rule in § 5. Those you refuse
and explain.
