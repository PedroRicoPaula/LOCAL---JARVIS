# ROADMAP.md

Budget assumption: **4–8 hours per week.** Estimates are in weeks at that pace.
Total: roughly 32 weeks including mandatory soaks. This is a two-season project.
That is the honest number, and it is fine.

A phase is done when its checks pass with pasted output. Not when it "works".

**Changed in v0.2:** the skill host moved from Phase 7 to Phase 5, ahead of the
gate and the dashboard. Skills are the point of the system, so the interface
that hosts them gets proven early with a zero-risk skill before anything is
built on top of it. Camera became a session lifecycle (Phase 8). Nutrition
became owner-declared (Phase 9). `workbench` was promoted from backlog to
Phase 10. No paid provider is built anywhere.

---

## Phase 0 — Baseline and model selection · 1 week

Pick the models with data, not with reputation.

- [ ] `system_profiler SPHardwareDataType` recorded in `PROGRESS.md`
- [ ] Ollama installed, at least two candidate text models pulled
- [ ] NVIDIA Build account created, key stored in Keychain
- [ ] `bench/nim_smoke.sh` passes
- [ ] `bench/bench_local.py` run against all candidates

**Definition of Done**
- Chosen `converse` model achieves **≥ 90% valid JSON** and **≥ 85% lane
  accuracy** on the 45-case benchmark, with **p95 latency < 900 ms**
- If no local model clears that bar, record it and route lane classification to
  `nim` — an acceptable outcome, not a failure
- `DECISIONS.md` contains ADR-001 (local model) and ADR-002 (reason provider)

---

## Phase 1 — Voice loop, push-to-talk · 2 weeks

No wake word. No AI. No UI. Just: key → speech → text → speech.

- [ ] `senses/ears`: hotkey capture, Silero VAD, whisper.cpp
- [ ] `senses/voice`: macOS `say`, streaming sentence by sentence
- [ ] Round-trip through a hardcoded echo handler

**Definition of Done**
- Speak 20 varied English sentences: **≥ 95% word accuracy**
- **Time to first audible syllable < 1.5 s**, measured over 10 trials
- Works with Wi-Fi off
- `make check` green

---

## Phase 2 — Wake word · 1 week

- [ ] openWakeWord `hey_jarvis`, ONNX, launchd daemon
- [ ] Threshold tuned against the owner's own voice
- [ ] Audible + visible acknowledgement on wake (`reflex` lane)

**Definition of Done**
- 4-hour background run in normal conditions: **< 2 false activations**
- 30 deliberate activations at ~2 m: **≥ 90% detection**
- Survives reboot without manual intervention

---

## 🛑 SOAK 1 — two weeks

Use it daily. Do not build. Log every annoyance in `docs/BACKLOG.md`.

Most projects that die, die here — because people build Phase 3 instead of
finding out whether Phases 1–2 are pleasant to use.

---

## Phase 3 — Router · 1.5 weeks

- [ ] `ModelProvider` interface + registry
- [ ] `ollama` provider (chat, embed, vision)
- [ ] `nim` provider, 30 RPM token bucket, 429 → fallback not error
- [ ] Lane classifier
- [ ] Ordered fallback chain per lane

No paid provider is built. The interface exists so one can be added in a day
if it is ever wanted.

**Definition of Done**
- Kill Ollama → `reason` still answers via `nim`
- Pull the network → `converse` and `reflex` still answer locally
- Lane classification **≥ 85%** on the benchmark
- Every request logs `{lane, provider, latencyMs, fallbackDepth}`

---

## Phase 4 — Memory · 2 weeks

- [ ] Schema from `SPEC.md` § 4
- [ ] Append-only `events` with an enforcing trigger
- [ ] Local embeddings via Ollama + `sqlite-vec`
- [ ] Recall assembly with a hard context cap
- [ ] `facts` extraction with honest confidence

**Definition of Done**
- Three facts told across three sessions, all recalled correctly in a fourth
- `UPDATE events` raises
- Recall p95 **< 200 ms** over 10k synthetic events
- Assembled context never exceeds the cap

---

## Phase 5 — Skill host + `brief` · 2 weeks

**The architectural keystone.** Read `docs/SKILLS.md` before starting.

- [ ] `SkillManifest` loader with schema validation
- [ ] Two-stage routing: lane classifier → embedding match → disambiguation
- [ ] `SkillContext`: `router`, `memory`, `camera`, `propose`, `say`, `ask`, `store`
- [ ] `ctx.ask` — spoken question, awaited spoken answer, with timeout
- [ ] Per-skill namespaced storage and schema migration
- [ ] Error isolation: a throwing skill is disabled and reported, never fatal
- [ ] ESLint rule blocking executor imports inside `skills/`
- [ ] `make new-skill id=<name>` scaffolder
- [ ] First skill: `brief` — MEMORY_READ only, so it needs no gate yet

**Definition of Done**
- "Good morning" produces a spoken brief drawn from real memory
- A deliberately broken skill fails to load; core keeps running
- Intent routing **≥ 90%** across the manifests present
- **`make new-skill` to a working no-op skill in under 30 minutes, timed and
  recorded in `PROGRESS.md`.** If it takes longer, fix the platform before
  moving on. This number is the entire justification for the phase.
- A skill importing an executor fails `make check`

---

## Phase 6 — Gate and audit · 2 weeks

- [ ] `ApprovalRequest` lifecycle, server-authoritative
- [ ] Single-use nonces, 5-minute default expiry
- [ ] HMAC signing for executor calls
- [ ] Append-only audit log including rejections
- [ ] Capability enforcement per `CLAUDE.md` § 5
- [ ] `ctx.propose` wired into the skill host

**Definition of Done**
- A proposed action blocks until answered
- Replaying a spent nonce fails and logs `reason: replay`
- An expired approval cannot be executed
- A green-tier action runs unprompted and is still logged
- `brief` still works unchanged — proof the gate is additive, not invasive

---

## Phase 7 — Dashboard · 2 weeks

**Design reference:** the owner has a Figma-exported prototype at
`~/Developer/Programação/JARVIS Desktop Interface Design` (one level above
this repo, not inside it — nothing copied in ahead of time on purpose).
Look there first for layout before inventing one. Reconcile against the
functional list below rather than assuming full coverage.

- [ ] Next.js + shadcn/ui, WebSocket to core
- [ ] Approval queue: `humanSummary`, full payload on expand
- [ ] Live thought stream, transcript, **camera indicator**
- [ ] Timeline over `events`
- [ ] Skill health panel: loaded / disabled / last error

**Definition of Done**
- Approve in the browser → action executes
- Close the browser mid-approval → request survives, still pending
- Two tabs stay in sync
- Grep confirms the dashboard has no executor import path

---

## 🛑 SOAK 2 — two weeks

You now have a gated assistant with memory and a working skill system. Live
with it. Write the skills you actually want into `docs/BACKLOG.md`, in priority
order. That list, written from real use, is worth more than any plan made now.

---

## Phase 8 — Camera sessions + `look` · 2 weeks

Read `SPEC.md` § 6. The state machine **is** the specification.

- [ ] `senses/eyes`: IDLE → ARMED → CAPTURE → ARMED → IDLE
- [ ] Voice control via `reflex`: "turn on the camera" / "close the camera"
- [ ] Indicator active for the whole ARMED session, not just during capture
- [ ] Two timeouts, both announced: 120 s idle, 10 min absolute
- [ ] Frames deleted on close unless an approved `observation` references them
- [ ] `see` lane: local Qwen3-VL → NIM VLM fallback
- [ ] `look` skill: describe, identify, answer a question about what is visible

**Definition of Done**
- "Turn on the camera" arms it and **captures nothing** until a request is
  made — verified by watching `data/frames/` during a 60 s armed session
- "Close the camera" during analysis pre-empts and closes within 2 s
- Idle timeout fires, is announced, and closes
- Follow-up questions re-capture rather than reusing the previous frame
- Ten test images: descriptions correct; on ambiguous fine detail the model
  **says it is unsure** rather than guessing
- After a session with no approved observation, `data/frames/` is empty

---

## Phase 9 — `nutrition` · 2 weeks

Read `SPEC.md` § 7 first. **The owner declares quantities. No model produces a
stored number.**

- [ ] Voice-only logging path; the camera is entirely optional
- [ ] Camera-assisted path: vision **identifies**, owner **quantifies**
- [ ] Mandatory read-back and confirmation before any write
- [ ] Items with no declared quantity are logged without one, never estimated
- [ ] Open Food Facts + USDA extracts downloaded to `data/food/`
- [ ] Lookup on confirmed food + confirmed grams; a miss is reported, not guessed
- [ ] Corrections by voice ("no, 200 not 180") before confirming

**Definition of Done**
- Ten meals logged by voice with the camera off — the full flow works
- Ten meals logged with camera assist; identifications correct or corrected
- Rejecting at confirmation writes nothing — verified in the database
- **Grep the codebase: no code path sends a quantity or calorie question to a
  model.** This is the acceptance test that matters most.
- Every stored quantity has `source` in `{declared, scale, barcode}`

---

## Phase 10 — `workbench` · 2 weeks

Arduino, assembly, repairs. Same contract as nutrition, applied to parts.

- [ ] Vision proposes an identification; owner confirms before advice is given
- [ ] Step tracking inside a camera session: "what's next", "did I get that right"
- [ ] Component facts held for the session, persisted only on confirmation
- [ ] Safety-relevant advice always routes through `reason`, never `converse`

**Definition of Done**
- Given a breadboard photo, it asks to confirm the component before advising
- A wrong identification corrected by voice is remembered for the session
- It never states an electrical value it was not told and did not confirm
- Correct behaviour on a deliberately ambiguous photo: asks, does not guess

---

## Phase 11 — `coach` · 2 weeks

- [ ] Pattern detection over the qualitative and declared record
- [ ] Proactive observations, rate-limited, opt-in per category
- [ ] Uncertainty markers on anything from the `converse` lane

**Definition of Done**
- Three true, non-obvious patterns from two weeks of real data
- No health claim without routing through `reason`
- Muting a category by voice persists across restart

---

## Phase 12 — `code` via Aider · 1.5 weeks

- [ ] Aider wrapped as an executor, pointed at the router's `reason` provider
- [ ] Always on a branch, never `main`
- [ ] Diff rendered in the dashboard as the approval artifact
- [ ] One-key revert

**Definition of Done**
- Voice: "fix the login bug in X" → branch → diff → approve → merge;
  reject → branch deleted, working tree clean
- Integration test proves Aider cannot touch `main`

---

## Phase 13 — Actions via n8n · 1.5 weeks

- [ ] Self-hosted n8n
- [ ] HMAC-signed webhooks; n8n rejects unsigned, expired or replayed
- [ ] Stripe read-only widget

**Definition of Done**
- Unsigned webhook rejected and logged
- Replayed webhook rejected
- Stripe key proven read-only by attempting a write that fails

---

## After Phase 13

Once every phase above (0–13) has actually met its Definition of Done — not
before, and not on a partial subset — give the owner one summary: how JARVIS
works, how to use it, what every feature does. Portuguese, concise, no
implementation detail he didn't ask for. This is the one deliverable he
wants held until the very end rather than phase by phase; everything else
still follows the normal per-phase stop-and-report rhythm in `CLAUDE.md` § 1.

---

## Backlog — not scheduled

`wardrobe`, calendar, email triage, LeadHunter / HoqueiManager widgets, mobile
approvals, sandboxed `act` lane, additional free providers, a paid provider
adapter.

Write ideas there. Do not build them.
