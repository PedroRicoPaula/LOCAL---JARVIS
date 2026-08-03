.PHONY: check bench dev install-daemon uninstall-daemon

# Requires: `npm install` (TypeScript), `ruff` on PATH (brew install ruff),
# and .venv set up per requirements.txt (see README.md Phase 1 quickstart).
# Grows as later phases add real code to check — see ROADMAP.md.
check:
	npx tsc --noEmit
	ruff check bench/ senses/
	.venv/bin/pytest senses/ -q

# nim_smoke.sh takes no arguments. bench_local.py needs model names that
# depend on what you pulled in `ollama pull` — see README.md Phase 0
# quickstart — so it is not wired in here as a fixed command.
bench:
	bash bench/nim_smoke.sh
	@echo
	@echo "Run bench_local.py yourself with the models you pulled, e.g.:"
	@echo "  python3 bench/bench_local.py qwen3:8b phi4"

# Phase 1: ears + voice + the throwaway echo bridge, all three at once.
# Ctrl+C stops all three (trap kills the whole process group).
# PYTHONUNBUFFERED: without it, stdout is block-buffered whenever it isn't
# a TTY (piped to a file, captured by a wrapper) and the startup/connect
# prints sit invisible in the buffer — bit us once already, see PROGRESS.md.
dev:
	@echo 'Starting voice, ears, echo_bridge — say "hey jarvis" or hold Tab. Ctrl+C to stop.'
	@PYTHONUNBUFFERED=1; export PYTHONUNBUFFERED; \
	trap 'kill 0' EXIT INT TERM; \
	.venv/bin/python -m senses.voice.main & \
	.venv/bin/python -m senses.ears.main & \
	.venv/bin/python -m senses.echo_bridge & \
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
