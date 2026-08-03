.PHONY: check bench

# Requires: `npm install` (TypeScript) and `ruff` on PATH (brew install ruff).
# Grows as later phases add real code to check — see ROADMAP.md.
check:
	npx tsc --noEmit
	ruff check bench/

# nim_smoke.sh takes no arguments. bench_local.py needs model names that
# depend on what you pulled in `ollama pull` — see README.md Phase 0
# quickstart — so it is not wired in here as a fixed command.
bench:
	bash bench/nim_smoke.sh
	@echo
	@echo "Run bench_local.py yourself with the models you pulled, e.g.:"
	@echo "  python3 bench/bench_local.py qwen3:8b phi4"
