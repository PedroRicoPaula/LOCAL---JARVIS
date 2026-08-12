# JARVIS

**A local-first personal assistant that listens, sees on request, remembers,
and teaches — built to run entirely on free and local infrastructure.**

It proposes; the owner disposes. Nothing with a side effect happens without
a recorded approval. No frame is ever captured without an explicit request.
No model output is ever stored as a fact. It's a platform plus skills, not a
monolith — and it's built in the open, mistakes and all: every non-obvious
decision, dead end, and bug fix is logged in [`DECISIONS.md`](DECISIONS.md)
and [`PROGRESS.md`](PROGRESS.md) as it happens, not cleaned up after the fact.

---

## What it actually does

- **Wake word + voice loop** — "hey jarvis", then a natural conversation,
  bilingual (European Portuguese / English, mid-sentence switching), local
  speech-to-text (`whisper.cpp`), routed to whichever model fits the lane.
- **Sees on request** — the camera is a session opened by voice, never a
  standing eye. Real-time hand tracking turns it into an interactive
  surface: a live skeleton overlay, pinch-to-drag widgets, a finger-position
  theremin, optional background blur — all inference running locally,
  nothing ever leaves the machine.
- **Remembers** — structured facts and a searchable event log, with
  idle-triggered extraction so the owner never has to say "remember that."
- **Acts, carefully** — a three-tier capability gate (green/auto, yellow/
  approval-required, red/owner-only) stands between every model output and
  anything it could actually do. A skill produces a *proposal*; the gate
  turns proposals into actions. Every approval is single-use, expires, and
  is logged — rejections too.
- **A real dashboard** — live transcript, approval queue, camera/gesture
  panels, skill health, router traces, all pushed over a WebSocket to a
  Next.js UI, not polled.
- **Skills** — `brief`, `tasks` (real Reminders.app), `shopping_list`,
  `weather`, `launcher` (open/close apps and URLs), `look` (camera +
  gestures), `clipboard`, `wardrobe`, `system_health`, `media`, plus MCP
  integrations for Gmail and GitHub (read-only, real OAuth). Each one is
  self-contained, ships its own persona, and can't take down core if it
  throws.

## Why it's built this way

- **Free by default.** Every dependency is free, and local wherever
  possible. Paid providers plug into the same interface if you ever want
  one — none is built, stubbed, or required.
- **Local by default.** Voice and vision run on-device. Heavy reasoning may
  go out to a free remote provider, but the interface doesn't care which.
- **Owner-gated.** A model's output is never an action. See the capability
  gate above — it's enforced in code, not a convention.
- **Correct over impressive.** It says "I don't know" fluently, and it
  never presents an estimate as a measurement.
- **One maintainer, limited hours.** Boring beats clever. No file over
  ~300 lines. Every module that touches the outside world (a model, the
  camera, the mic, the network) gets a fake, so the whole test suite runs
  with no network, no models, and no camera.

## Architecture, in one picture

```
        wake word / STT           camera / hand tracking
  senses/ears  ──────┐       ┌────── senses/eyes
                      │       │
                      ▼       ▼
                     core  (router · gate · memory · skills)
                      ▲       │
                      │       ▼
       TTS ── senses/voice   dashboard (Next.js, WebSocket-pushed)
```

Five processes, one local Unix socket + WebSocket between them. Full detail,
contracts, and the reasoning behind every boundary: [`SPEC.md`](SPEC.md).

## Status

Building in public, one phase at a time — see [`ROADMAP.md`](ROADMAP.md) for
all 14 phases and their acceptance criteria, and
[`PROGRESS.md`](PROGRESS.md) for exactly where things stand right now,
including what's still open. Every real architectural decision (55 and
counting) is logged as an ADR in [`DECISIONS.md`](DECISIONS.md) — including
the ones that turned out wrong and got reversed.

---

## Read these, in this order

| File | What it is |
|---|---|
| [`SPEC.md`](SPEC.md) | Architecture, contracts, the rules that matter |
| [`ROADMAP.md`](ROADMAP.md) | 14 phases with verifiable acceptance criteria |
| [`docs/SKILLS.md`](docs/SKILLS.md) | **How to write a skill.** Read before touching `skills/` |
| [`CLAUDE.md`](CLAUDE.md) | Conduct rules this project is built under |
| [`DECISIONS.md`](DECISIONS.md) | Why things are the way they are (55 ADRs) |
| [`PROGRESS.md`](PROGRESS.md) | Where things actually are |

---

## Quickstart

Everything below is free. Phase 0 takes about an hour, mostly downloads.

### Phase 0 — pick your models

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

**3. Get a free NVIDIA NIM key**

Sign up at `build.nvidia.com`. No card. Store it in Keychain, never in a
shell profile or a committed `.env`:

```bash
security add-generic-password -a "$USER" -s jarvis-nim-key -w 'nvapi-...'
```

<details>
<summary><strong>3b. Optional — free-tier fallback keys (Groq, Mistral, Google AI Studio, OpenRouter)</strong></summary>

`nim` stays primary, but `core/router/wiring.ts` also falls through to
these four before ever touching local `ollama`, in this order (fastest/
most reliable first, measured live): `groq` → `mistral` → `google` →
`openrouter`. Every one is optional — `core` starts and runs fine with
only `jarvis-nim-key` configured; each missing key just shortens the
fallback chain by one.

Sign up free at `console.groq.com`, `console.mistral.ai`,
`aistudio.google.com`, and `openrouter.ai`, then:

```bash
security add-generic-password -a "$USER" -s jarvis-groq-key -w 'gsk_...'
security add-generic-password -a "$USER" -s jarvis-mistral-key -w '...'
security add-generic-password -a "$USER" -s jarvis-google-key -w '...'
security add-generic-password -a "$USER" -s jarvis-openrouter-key -w 'sk-or-...'
```

(Cerebras was tested and left out on purpose — the key authenticates but
the free tier has no usable quota. See `DECISIONS.md` ADR-031.)
</details>

<details>
<summary><strong>3c. Optional — Gmail (via Google's official Gmail MCP server)</strong></summary>

Read-only Gmail search through the `gmail` skill — searches only, never
sends (the MCP server itself only grants `gmail.readonly` +
`gmail.compose` scopes; sending anything still needs the owner's own
click/typed approval regardless, per `CLAUDE.md` § 5).

1. Go to <https://console.cloud.google.com/apis/credentials>
2. Create an OAuth client, application type **Web application**
3. Add this exact Authorized redirect URI:
   `http://localhost:51789/oauth/callback`
4. Enable **both** of these APIs for the project (APIs & Services →
   Library) — enabling only the first one gets you a working OAuth
   consent screen and even a working `tools/list` call, but every actual
   tool call fails with an HTTP 403 that names the missing one:
   - **Gmail API**
   - **Gmail MCP API** (`gmailmcp.googleapis.com`) — the MCP gateway
     itself, a separate API easy to miss in the Library search
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
credentials degrade gracefully — `core` starts normally either way, and
the `gmail` skill says so honestly if asked before this is done.
</details>

<details>
<summary><strong>3d. Optional — GitHub (via GitHub's official MCP server)</strong></summary>

Lists your repositories through the `github` skill — read-only, never
writes.

1. Go to <https://github.com/settings/personal-access-tokens/new> and
   create a fine-grained personal access token, read-only, scoped to
   whichever repositories you want JARVIS able to list
2. Store it:

   ```bash
   security add-generic-password -a "$USER" -s jarvis-github-pat -w 'YOUR_TOKEN'
   ```

`core` picks it up next start. A missing token degrades gracefully — the
`github` skill just says so honestly if asked before this is done.
</details>

<details>
<summary><strong>3e. Optional — Do Not Disturb / Focus toggle</strong></summary>

macOS has no public AppleScript/`defaults` control for Focus modes
anymore, so this goes through Shortcuts.app instead:

1. Open **Shortcuts.app** → **+** (new shortcut)
2. Add the **"Set Focus"** action, set it to turn **Do Not Disturb** **On**
3. Name it exactly `JARVIS Focus On` (or set `JARVIS_FOCUS_ON_SHORTCUT`)
4. Repeat for a second shortcut, action set to **Off**, named
   `JARVIS Focus Off` (or `JARVIS_FOCUS_OFF_SHORTCUT`)

The first real `shortcuts run` call may trigger a macOS permission dialog
(Terminal/Node asking to control Shortcuts.app) — approve it if a
`set_focus_mode` request seems to hang. Missing shortcuts degrade
honestly: the `media` skill reports it couldn't find the shortcut rather
than pretending it worked.
</details>

**4. Run both checks**

```bash
bash bench/nim_smoke.sh
python3 bench/bench_local.py qwen3:8b phi4
```

**5. Record the outcome**

Write ADR-001 (local model) and ADR-002 (reason provider) into
`DECISIONS.md`, update `PROGRESS.md`, commit, and stop.

Pass bar for the local model: **≥ 90% valid JSON, ≥ 85% lane accuracy,
p95 < 900 ms** across 45 cases. If nothing clears it, that's a real
result — route lane classification to NIM and record why. Don't lower
the bar.

### Phase 1 — voice loop

```bash
/opt/homebrew/bin/python3.13 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

If `whisper-cli` isn't installed: `brew install whisper-cpp` — but check
`which -a brew` first. A machine with both an Intel Homebrew (`/usr/local`)
and a native arm64 one (`/opt/homebrew`) can silently shadow the fast one;
install with `/opt/homebrew/bin/brew` explicitly.

`senses/ears/config.py` expects the multilingual Whisper model at
`data/models/whisper/ggml-small-q5_1.bin` (bilingual PT-PT/English STT) —
`data/models/` is gitignored, so a fresh clone needs to fetch it once:

```bash
mkdir -p data/models/whisper
curl -L -o data/models/whisper/ggml-small-q5_1.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
```

Grant Accessibility permission the first time `make dev` asks (`pynput`'s
hotkey listener needs it): System Settings → Privacy & Security →
Accessibility → add whichever app is running the Python process.

```bash
make dev                                # hold Tab, speak, listen back
.venv/bin/python bench/score_phase1.py  # needs >= 95% word accuracy
```

### Working with a coding agent

This project was built with, and is designed to keep being built with, an
AI coding agent under a strict conduct file. Open the repo and say:

> Read CLAUDE.md, SPEC.md, ROADMAP.md and PROGRESS.md. Then start Phase 0.
> Stop when Phase 0's Definition of Done is met.

The agent is instructed to stop at every phase boundary — let it. Phases
marked 🛑 SOAK are deliberate pauses to actually use what exists before
building more. They're the most important part of the plan.

---

## The rules that are not negotiable

1. **Free tier only.** No paid provider is built. No phase may require a
   paid key.
2. **The owner is the only executor.** No side effect without a recorded
   approval. Model output is a proposal, never an action.
3. **The camera is a session, opened by voice.** ARMED never means
   recording; no frame is captured without an explicit request; it closes
   itself.
4. **No model ever produces a number that gets stored as fact.** Vision
   identifies, the owner quantifies and confirms, a static table converts.
5. **Skills are the point.** If adding one takes more than a weekend, the
   platform is wrong — fix the platform.
6. **Internal prompts stay English** (measurably more reliable for small
   local models); **spoken conversation is bilingual** PT-PT/English,
   matching the owner. These are separate rules and neither one bends
   for the other.

Full reasoning for every one of these: [`CLAUDE.md`](CLAUDE.md).

---

## Contributing

This is a solo, personal project, built for one owner's own use and
documented in the open because the process is worth sharing. Forks and
clones are welcome — take it, run it, learn from it, adapt it under the
license below. Pull requests against `main` aren't actively reviewed or
merged; open one if you want, but don't expect a response. If you find a
real bug, an issue with a clear repro is more useful than a PR.

## License

[MIT](LICENSE) — do what you want with the code, keep the copyright notice.
