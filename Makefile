.PHONY: check bench dev

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
	@echo "Starting voice, ears, echo_bridge — hold right Option and speak. Ctrl+C to stop."
	@PYTHONUNBUFFERED=1; export PYTHONUNBUFFERED; \
	trap 'kill 0' EXIT INT TERM; \
	.venv/bin/python -m senses.voice.main & \
	.venv/bin/python -m senses.ears.main & \
	.venv/bin/python -m senses.echo_bridge & \
	wait
