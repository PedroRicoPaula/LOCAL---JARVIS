#!/usr/bin/env python3
"""
bench_nim_lane.py — pick the `converse`/lane-classifier model on NIM instead
of Ollama, for machines where local inference doesn't clear the bar.

Context: on an 8 GB Apple Silicon machine, local candidates (gemma3:4b,
qwen3:8b) via `bench_local.py` either thrashed (repeated OOM-restart of the
Ollama model server) or returned clean timeouts on every case despite the
model reporting as loaded. That is real data, not impatience — see
DECISIONS.md ADR-001. ROADMAP.md's own Phase 0 Definition of Done treats this
as an acceptable outcome: "route lane classification to NIM and record why."

This reuses the exact same 45-case dataset and system prompt as
bench_local.py (single source of truth — do not fork the case list) and
applies the exact same JSON-validity / lane-accuracy bars. It does **not**
apply the same p95 < 900ms bar: that number was calibrated for a network-free
local call, and no remote provider can honestly hit it. Latency is still
measured and printed so the number is visible, not hidden.

Deliberately requests small models only — lane classification is a trivial
task, and the owner asked not to point heavy models at simple things. Paces
requests at 1 per 2s (30 rpm) to match the router's own planned NIM bucket
(SPEC.md § 3) and stay well under the confirmed 40 rpm account ceiling.

Usage
-----
    python3 bench/bench_nim_lane.py meta/llama-3.2-3b-instruct
"""

from __future__ import annotations

import json
import os
import statistics
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bench_local import CASES, SYSTEM  # noqa: E402  (path insert must run first)

BASE = "https://integrate.api.nvidia.com/v1/chat/completions"
PACE_SECONDS = 2.0  # 30 rpm — matches SPEC.md § 3's router bucket


def get_key() -> str:
    result = subprocess.run(
        ["security", "find-generic-password", "-a", os.environ["USER"],
         "-s", "jarvis-nim-key", "-w"],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def ask(key: str, model: str, prompt: str, timeout: float = 20.0) -> tuple[str, float]:
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 40,
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }).encode()

    req = urllib.request.Request(
        BASE, data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)
    elapsed_ms = (time.perf_counter() - start) * 1000
    return payload["choices"][0]["message"]["content"], elapsed_ms


def bench(key: str, model: str) -> dict | None:
    print(f"\n{'=' * 62}\n  {model}  (NIM, paced {PACE_SECONDS}s/req)\n{'=' * 62}")

    n_cases = len(CASES)
    latencies: list[float] = []
    valid_json = 0
    correct = 0
    failures: list[str] = []

    for i, (prompt, expected) in enumerate(CASES, 1):
        time.sleep(PACE_SECONDS)
        try:
            raw, ms = ask(key, model, prompt)
        except OSError as exc:
            print(f"  [{i:2}/{n_cases}] ERROR  {exc}")
            failures.append(f"{prompt!r}: transport {exc}")
            continue

        latencies.append(ms)
        try:
            got = json.loads(raw)
            valid_json += 1
        except json.JSONDecodeError:
            failures.append(f"{prompt!r}: invalid JSON -> {raw[:70]}")
            print(f"  [{i:2}/{n_cases}] {ms:6.0f}ms  BAD JSON")
            continue

        lane = str(got.get("lane", "")).strip().lower()
        if lane == expected:
            correct += 1
            print(f"  [{i:2}/{n_cases}] {ms:6.0f}ms  ok   {lane}")
        else:
            failures.append(f"{prompt!r}: expected {expected}, got {lane or '?'}")
            print(f"  [{i:2}/{n_cases}] {ms:6.0f}ms  MISS {lane or '?'} (want {expected})")

    if not latencies:
        print("\n  no successful calls.")
        return None

    n = len(CASES)
    latencies.sort()
    p95 = latencies[max(0, int(len(latencies) * 0.95) - 1)]

    result = {
        "model": model,
        "json_pct": 100 * valid_json / n,
        "acc_pct": 100 * correct / n,
        "median_ms": statistics.median(latencies),
        "p95_ms": p95,
        "failures": failures,
    }

    # Same JSON/accuracy bar as bench_local.py. No latency bar — remote is
    # remote; the number is reported, not graded against a local-only target.
    ok = result["json_pct"] >= 90 and result["acc_pct"] >= 85

    print(f"\n  valid JSON     {result['json_pct']:5.1f}%   (need >= 90)")
    print(f"  lane accuracy  {result['acc_pct']:5.1f}%   (need >= 85)")
    print(f"  median         {result['median_ms']:5.0f}ms  (no bar — remote, see ADR-001)")
    print(f"  p95            {result['p95_ms']:5.0f}ms")
    print(f"\n  {'PASS' if ok else 'FAIL'} (JSON validity + lane accuracy only)")

    if failures:
        print(f"\n  failures ({len(failures)}):")
        for f in failures[:12]:
            print(f"    - {f}")
        if len(failures) > 12:
            print(f"    ... and {len(failures) - 12} more")

    result["pass"] = ok
    return result


def main() -> int:
    models = sys.argv[1:]
    if not models:
        print(__doc__)
        return 1

    key = get_key()
    results = [r for m in models if (r := bench(key, m))]
    if not results:
        return 1

    print(f"\n{'=' * 62}\n  SUMMARY\n{'=' * 62}")
    for r in results:
        verdict = "PASS" if r["pass"] else "fail"
        print(f"  {r['model']:<28} json {r['json_pct']:5.1f}%  acc {r['acc_pct']:5.1f}%  "
              f"p95 {r['p95_ms']:6.0f}ms   {verdict}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
