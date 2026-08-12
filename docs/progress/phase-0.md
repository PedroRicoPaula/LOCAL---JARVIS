# Phase 0 — complete, 2026-08-03

**Built:**
- Hardware profile recorded (see § Hardware).
- NIM key stored in Keychain (`jarvis-nim-key`); `bench/nim_smoke.sh` run
  live: 7/7 passed.
- Fixed a real bug in `bench/bench_local.py`: `except (urllib.error.URLError,
  TimeoutError)` doesn't catch `socket.timeout` on Python 3.9 (it only became
  a `TimeoutError` alias in 3.10) — crashed mid-benchmark. Now `except
  OSError`, which covers all three uniformly and is simpler.
- `bench/bench_nim_lane.py` written: same 45-case set as `bench_local.py`
  (imported, not duplicated), targets NIM instead of Ollama, paced at 30 rpm.
- Local: `gemma3:4b` and `qwen3:8b` both tested via Ollama, both unusable on
  this hardware (timeouts / OOM-restart thrashing — see ADR-001 for the raw
  evidence).
- NIM: `meta/llama-3.2-3b-instruct` unusable (degenerate JSON-mode output),
  `meta/llama-3.1-8b-instruct` usable (100% valid JSON, 709ms median / 1019ms
  p95, 71.1% lane accuracy).

**Decided:**
- ADR-001: `converse`/lane-classification routes to NIM
  (`meta/llama-3.1-8b-instruct`), not local — no local candidate survived
  contact with this machine's 8 GB of RAM.
- ADR-002: confirmed accepted (was provisional) — NIM smoke-tested live,
  `meta/llama-3.3-70b-instruct` for `reason`.

**Left over:**
- 71.1% lane accuracy is below the 85% bar. Failures are concentrated in one
  fixable gap (camera on/off phrases aren't taught as `reflex` examples in
  the benchmark's system prompt) plus genuinely ambiguous short utterances —
  see ADR-001's failure analysis. Phase 3 should add those examples and
  re-check before assuming the number is final.
- A sub-2B local model (`qwen3:1.7b`, `llama3.2:1b`) was never tried. Worth a
  cheap look during SOAK 1.
- `ruff` still not installed locally (flagged at scaffold time, still true).

**Surprised me:**
- The 8 GB RAM ceiling. The project's own docs assumed 16 GB as the floor;
  nobody had checked this specific machine against that assumption before
  now. Local Ollama inference didn't just run slowly, it was unstable
  (OOM-restart loops) — worth remembering as a reason to distrust "should be
  fine" sizing assumptions in general on this hardware.
- How much better `meta/llama-3.1-8b-instruct` did than the 3B model —
  perfect JSON vs. degenerate repetition loops. Model-size cliffs on
  instruction-following-under-constrained-decoding are real and not
  smoothly predictable from parameter count alone.
