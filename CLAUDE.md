# CLAUDE.md — Agent Conduct Rules

You are building JARVIS, a local-first personal AI assistant. Read `SPEC.md` for
architecture and `ROADMAP.md` for what to build. Read `PROGRESS.md` to find out
where we are. Never start work without reading all three.

Before writing any skill, also read `docs/SKILLS.md`. Skills are the point of
this system; the platform exists to host them.

---

## 0. Non-negotiables

1. **Everything in English.** Code, comments, docs, prompts, TTS output, wake
   word. No exceptions. The owner is Portuguese but has chosen English as the
   system language for accuracy reasons. Do not "helpfully" add Portuguese.

   This governs the *deliverable* only. The coding agent's chat replies in
   this tool — summaries, mini-feedback while executing, questions — are in
   Portuguese, by the owner's explicit request. Code blocks, commit messages,
   and file contents inside those replies stay English regardless.

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

---

## 1. Phase discipline

Work strictly one phase at a time, in the order given in `ROADMAP.md`.

At the end of every phase:

1. Run the phase's Definition of Done checks. Paste the actual command output.
2. Update `PROGRESS.md`: what was built, what was decided, what is left, what
   surprised you.
3. Append any architectural decision to `DECISIONS.md` in ADR format.
4. `git commit` with the message format `phase(N): <summary>`.
5. **STOP. Write "Phase N complete. Awaiting approval for Phase N+1." and end
   your turn.**

Do not begin the next phase without written approval, even if the current phase
finished early and the next one looks trivial. This rule exists because context
degrades across long sessions and the owner has 4–8 hours a week. Losing a phase
boundary costs a weekend.

Phases marked 🛑 **SOAK** in the roadmap are mandatory two-week pauses where the
owner uses what exists before more is built. Do not offer to "get ahead" during
a soak.

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
| **Green** | `MEMORY_READ`, `FS_READ` (whitelist only), `CAMERA`, `NET_READ` | Runs automatically. Logged. |
| **Yellow** | `FS_WRITE`, `GIT_WRITE`, `SHELL_EXEC`, `MEMORY_WRITE`, `WEBHOOK` | Requires approval. Blocks until answered or expired. |
| **Red** | Credential access, `rm`, package publish, anything that moves money, anything that sends a message to another human | Never automatic. Never proposed by a model. Only reachable by the owner typing it. |

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
