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
| `DECISIONS.md` | Why things are the way they are (14 ADRs) |
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

**3b. Optional: free-tier fallback keys (Groq, Mistral, Google AI Studio, OpenRouter)**

Added 2026-08-04 (SOAK 1, ADR-031) -- `nim` stays primary, but `core/router/
wiring.ts` now also falls through to these four before ever touching local
`ollama`, in this order (fastest/most reliable first, measured live, not
assumed): `groq` → `mistral` → `google` → `openrouter`. Every one is
optional -- `core` starts and runs fine with only `jarvis-nim-key`
configured, each missing key just shortens the fallback chain by one.
Sign up free at `console.groq.com`, `console.mistral.ai`,
`aistudio.google.com`, and `openrouter.ai`, then:

```bash
security add-generic-password -a "$USER" -s jarvis-groq-key -w 'gsk_...'
security add-generic-password -a "$USER" -s jarvis-mistral-key -w '...'
security add-generic-password -a "$USER" -s jarvis-google-key -w '...'
security add-generic-password -a "$USER" -s jarvis-openrouter-key -w 'sk-or-...'
```

Cerebras was tested the same day and left out on purpose: the key
authenticates but the account has no usable free quota (HTTP 402 on every
model). No `CerebrasProvider` exists in this codebase for that reason --
see ADR-031.

**3c. Optional: Gmail (via Google's official Gmail MCP server)**

Added 2026-08-06 (SOAK 1, ADR-035). Read-only Gmail search through the
`gmail` skill -- searches only, never sends (the MCP server itself only
grants `gmail.readonly` + `gmail.compose` scopes; sending anything still
needs the owner's own click/typed approval regardless, per CLAUDE.md § 5).
One-time setup, by hand, no code needed:

1. Go to <https://console.cloud.google.com/apis/credentials>
2. Create an OAuth client, application type **Web application**
3. Add this exact Authorized redirect URI:
   `http://localhost:51789/oauth/callback`
4. Enable **both** of these APIs for the project (APIs & Services →
   Library) -- found live 2026-08-06: enabling only the first one gets
   you a working OAuth consent screen and even a working `tools/list`
   call, but every actual tool call fails with an HTTP 403 whose body
   literally says which one is still missing:
   - **Gmail API**
   - **Gmail MCP API** (`gmailmcp.googleapis.com`) -- this is the MCP
     gateway itself, a separate API from the one above; easy to miss
     since only the first is the "obvious" Gmail-sounding name in the
     Library search
5. Store the client ID/secret it gives you:

   ```bash
   security add-generic-password -a "$USER" -s jarvis-google-oauth-client-id -w 'YOUR_CLIENT_ID'
   security add-generic-password -a "$USER" -s jarvis-google-oauth-client-secret -w 'YOUR_CLIENT_SECRET'
   ```

6. Run the one-time interactive authorization (opens your browser):

   ```bash
   node --experimental-strip-types bench/gmail_authorize.ts
   ```

`core` picks up the stored refresh token next time it starts. Missing
credentials degrade gracefully -- `core` logs "gmail MCP server not
configured" and starts normally either way; the `gmail` skill just says
so honestly if asked to check email before this is done.

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

## Phase 1 quickstart

Code is done (`make check` is green). Two things only you can do:

**1. One-time setup, if you haven't already**

```bash
/opt/homebrew/bin/python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

If `whisper-cli` isn't installed yet: `brew install whisper-cpp` — but check
`which -a brew` first. This machine turned out to have two Homebrew installs
(an Intel one at `/usr/local` shadowing the native arm64 one at
`/opt/homebrew` in PATH); install with `/opt/homebrew/bin/brew` specifically,
or you'll silently get an x86_64 binary running under Rosetta with no Metal
acceleration. `senses/ears/config.py` already points at the native path
explicitly, so the project works either way — but anything you run ad hoc
outside it might not.

**2. Grant Accessibility permission**

`make dev` will print `This process is not trusted!` the first time — that's
`pynput` telling you the hotkey listener needs approval. System Settings →
Privacy & Security → Accessibility → add whichever app is actually running
the Python process, then re-run `make dev`.

**3. Run it, and run the DoD checks**

```bash
make dev                              # hold Tab, speak, listen back
.venv/bin/python bench/score_phase1.py   # 20 sentences, needs >= 95% word accuracy
```

For the 10-trial latency check: do 10 round-trips via `make dev` and read
`echo_bridge`'s printed latency per utterance — needs < 1.5s. See
`PROGRESS.md`'s Phase 1 log for exactly what that number does and doesn't
include.

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
