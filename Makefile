.PHONY: check bench bench-gate dev install-daemon uninstall-daemon new-skill

# Requires: `pnpm install` (TypeScript), `ruff` on PATH (brew install ruff),
# .venv set up per requirements.txt (see README.md Phase 1 quickstart), and
# `pnpm install` inside ui/ too (Phase 7 -- its own project, own lockfile).
# pnpm, not npm: both package.json files pin it via `packageManager`, so
# Corepack refuses npm rather than silently writing a second lockfile.
# Grows as later phases add real code to check — see ROADMAP.md.
#
# bench/**/*.test.ts (added 2026-08-08, bench/_shared/regressionGate.ts)
# joins the glob here too -- pure offline unit tests of the gate's own
# comparison logic, no network/models, same "make check stays fully
# offline" rule every other test file here already follows. This is
# separate from actually *running* the real benchmarks (`make bench-gate`,
# below), which needs real network/model calls and real API quota.
check:
	npx tsc --noEmit
	ruff check bench/ senses/
	.venv/bin/pytest senses/ -q
	node --test 'core/**/*.test.ts' 'skills/**/*.test.ts' 'bench/**/*.test.ts'
	npx eslint 'skills/**/*.ts' --ignore-pattern 'skills/__fixtures__/**'
	cd ui && pnpm lint && pnpm build

# nim_smoke.sh takes no arguments. bench_local.py needs model names that
# depend on what you pulled in `ollama pull` — see README.md Phase 0
# quickstart — so it is not wired in here as a fixed command.
bench:
	bash bench/nim_smoke.sh
	@echo
	@echo "Run bench_local.py yourself with the models you pulled, e.g.:"
	@echo "  python3 bench/bench_local.py qwen3:8b phi4"

# docs/BACKLOG.md's "permanent benchmark gate" idea, built 2026-08-08
# (bench/_shared/regressionGate.ts) — real network/model calls, real API
# quota, deliberately NOT part of `make check`. Run this by hand before
# shipping a change to laneClassifier.ts, dispatch.ts, or any skill
# manifest's examples -- exactly the class of change that silently
# regressed accuracy twice before (ADR-024, ADR-026) while still
# clearing each benchmark's fixed floor. A real drop below the recorded
# baseline in bench/baseline.json fails even then; see each script's own
# output for how to record a new baseline once a change is confirmed.
bench-gate:
	node bench/bench_router_lane.ts
	node bench/bench_router_lane_pt.ts
	node bench/bench_skill_routing.ts

# voice + ears + eyes (Python) + core (Node, Phase 5b) + dashboard
# (Next.js dev server, Phase 7) all at once. Ctrl+C stops all five (trap
# kills the whole process group). core replaces the Phase-1-only echo
# bridge -- ears/voice/eyes are unaware of the difference, they only know
# "read from my socket" / "write to my socket." eyes is on-demand
# (SPEC.md § 2) and optional at core's own boot (core/main.ts), but Phase
# 8's plan (Task 1.7) commits to running it here for day-to-day dev and
# verification -- not installed as a LaunchAgent yet, see
# launchd/com.jarvis.eyes.plist's own docstring. Requires ui/'s own `pnpm install` to
# have been run once (see ui/README.md).
# PYTHONUNBUFFERED: without it, stdout is block-buffered whenever it isn't
# a TTY (piped to a file, captured by a wrapper) and the startup/connect
# prints sit invisible in the buffer — bit us once already, see PROGRESS.md.
EARS_PLIST := $(HOME)/Library/LaunchAgents/com.jarvis.ears.plist

dev:
	@echo 'Starting voice, ears, core, dashboard — say "hey jarvis" or hold Tab.'
	@echo 'Dashboard: http://localhost:3000 -- Ctrl+C to stop everything.'
	@if [ -f "$(EARS_PLIST)" ] && launchctl list | grep -q com.jarvis.ears; then \
		echo 'Unloading the installed ears daemon for this session (same socket as the one below) -- reloaded on exit.'; \
		launchctl unload "$(EARS_PLIST)"; \
	fi
	@PYTHONUNBUFFERED=1; export PYTHONUNBUFFERED; \
	trap '[ -f "$(EARS_PLIST)" ] && launchctl load "$(EARS_PLIST)" 2>/dev/null; kill 0' EXIT INT TERM; \
	.venv/bin/python -m senses.voice.main & \
	.venv/bin/python -m senses.ears.main & \
	.venv/bin/python -m senses.eyes.main & \
	node core/main.ts & \
	(cd ui && pnpm dev) & \
	wait

# Phase 2: run `ears` as a background LaunchAgent instead of via `make dev`
# — the "survives reboot" DoD check needs this actually loaded, not just
# working in a terminal. `~/Library/LaunchAgents/` needs an absolute path,
# not a relative one or `~` — substituted in from the current directory.
install-daemon:
	@mkdir -p data/logs
	@repo_root="$$(pwd)"; \
	sed "s|__REPO_ROOT__|$$repo_root|g" launchd/com.jarvis.ears.plist \
		> ~/Library/LaunchAgents/com.jarvis.ears.plist
	launchctl load ~/Library/LaunchAgents/com.jarvis.ears.plist
	@echo "Loaded. Check status:   launchctl list | grep jarvis"
	@echo "Watch logs:             tail -f data/logs/ears.log"
	@echo "First load will likely need Microphone/Accessibility/Input"
	@echo "Monitoring granted again, this time to the launchd-invoked"
	@echo "python binary rather than Cursor — see PROGRESS.md's Phase 2 log."

uninstall-daemon:
	-launchctl unload ~/Library/LaunchAgents/com.jarvis.ears.plist
	rm -f ~/Library/LaunchAgents/com.jarvis.ears.plist
	@echo "Unloaded and removed."

# Phase 5: docs/SKILLS.md SS8's 30-minute test. `id` is required.
new-skill:
	@if [ -z "$(id)" ]; then echo "Usage: make new-skill id=<name>"; exit 1; fi
	node core/skills/scaffold.ts $(id)
