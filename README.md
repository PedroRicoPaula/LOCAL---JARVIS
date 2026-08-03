# JARVIS

A local-first personal assistant. Listens, sees on request, remembers, teaches.
It proposes; you dispose.

Built to run free: local models for anything fast or private, free remote models
for anything heavy. Paid providers plug into the same interface if you ever want
one.

---

## Read these, in this order

| File | What it is |
|---|---|
| `SPEC.md` | Architecture, contracts, the rules that matter |
| `ROADMAP.md` | 14 phases with verifiable acceptance criteria |
| `docs/SKILLS.md` | **How to write a skill.** Read before touching `skills/` |
| `CLAUDE.md` | Conduct rules for the coding agent |
| `DECISIONS.md` | Why things are the way they are (13 ADRs) |
| `PROGRESS.md` | Where we actually are |

---

## Phase 0 quickstart

Everything below is free and takes about an hour, most of it downloads.

**1. Record the hardware**

```bash
system_profiler SPHardwareDataType | tee /tmp/hw.txt
```

Paste chip and unified memory into `PROGRESS.md`.

**2. Install Ollama and pull two candidates**

```bash
brew install ollama
brew services start ollama
```

Pick by memory:

| Unified memory | Pull these two |
|---|---|
| 16 GB | `qwen3:8b` and `phi4` |
| 24–36 GB | `qwen3:14b` and `llama3.3:8b` |
| 64 GB+ | `qwen3:32b` and `qwen3:14b` |

```bash
ollama pull qwen3:8b
ollama pull phi4
```

Model names move fast. If one 404s, check `ollama.com/library` and pick the
current equivalent, then record what you used.

**3. Get a free NVIDIA key**

Sign up at `build.nvidia.com`. No card. Store it in Keychain, never in a shell
profile:

```bash
security add-generic-password -a "$USER" -s jarvis-nim-key -w 'nvapi-...'
```

**4. Run both checks**

```bash
bash bench/nim_smoke.sh
python3 bench/bench_local.py qwen3:8b phi4
```

**5. Record the outcome**

Write ADR-001 (local model) and ADR-002 (reason provider) into `DECISIONS.md`,
update `PROGRESS.md`, commit, and stop.

Pass bar for the local model: **≥ 90% valid JSON, ≥ 85% lane accuracy,
p95 < 900 ms** across 45 cases. If nothing clears it, that is a real result — route lane
classification to NIM and record why. Do not lower the bar.

---

## Working with the coding agent

Open this directory in Claude Code and say:

> Read CLAUDE.md, SPEC.md, ROADMAP.md and PROGRESS.md. Then start Phase 0.
> Stop when Phase 0's Definition of Done is met.

The agent is instructed to stop at every phase boundary. Let it. Phases marked
🛑 SOAK are two-week pauses where you use what exists instead of building more.
They are the most important part of the plan.

---

## The rules that are not negotiable

1. Everything in English — code, prompts, speech, wake word.
2. No paid provider is built. No phase may require a paid key.
3. No side effect without a recorded approval. Model output is a proposal,
   never an action.
4. **The camera is a session opened by voice.** ARMED never means recording;
   no frame is captured without an explicit request; it closes itself.
5. **No model ever produces a number that gets stored as fact.** Vision
   identifies, the owner quantifies and confirms, a static table converts.
6. Skills are the point. If adding one takes more than a weekend, the platform
   is wrong — fix the platform.
