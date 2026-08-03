#!/usr/bin/env python3
"""
bench_local.py — pick the `converse` model with data, not reputation.

The `converse` model has one job that matters more than sounding nice:
deciding which lane a request belongs to, and returning valid JSON while it
does. This measures exactly that.

Usage
-----
    ollama pull qwen3:8b
    ollama pull llama3.3:8b
    python3 bench/bench_local.py qwen3:8b llama3.3:8b

Pass criteria (ROADMAP Phase 0)
-------------------------------
    valid JSON      >= 90%
    lane accuracy   >= 85%
    p95 latency     <  900 ms

If nothing clears the bar, that is a result: record it and route lane
classification to the `reason` provider instead. That is an acceptable
architecture, not a failure.

No dependencies beyond the standard library.
"""

from __future__ import annotations

import json
import statistics
import sys
import time
import urllib.request

OLLAMA = "http://localhost:11434/api/chat"

SYSTEM = """You are a request router for a personal assistant.
Classify the user's request into exactly one lane.

reflex   - trivial, instant, no reasoning: stop, repeat, cancel, what time is it
converse - dialogue, small talk, recall, summarising things already known
reason   - analysis, teaching, planning, explanation, anything where being wrong
           has a cost
see      - requires looking at something through the camera
act      - requires changing files, running commands, or writing code

Respond with JSON only. No prose, no markdown fences.
Schema: {"lane": "<lane>", "confidence": <0..1>}"""

# 45 cases. Deliberately includes ambiguity, terseness and the owner's real
# domains so the benchmark reflects actual use rather than a clean test set.
CASES: list[tuple[str, str]] = [
    # reflex
    ("stop", "reflex"),
    ("cancel that", "reflex"),
    ("what time is it", "reflex"),
    ("say that again", "reflex"),
    ("never mind", "reflex"),
    ("louder", "reflex"),
    ("are you there", "reflex"),
    ("pause", "reflex"),
    ("turn on the camera", "reflex"),
    ("close the camera", "reflex"),
    ("open your eyes", "reflex"),
    ("that's all", "reflex"),
    # converse
    ("good morning", "converse"),
    ("what did I ask you yesterday", "converse"),
    ("how many meals did I log this week", "converse"),
    ("remind me what we decided about the database", "converse"),
    ("what's on my list", "converse"),
    ("summarise what you just told me", "converse"),
    ("thanks, that was helpful", "converse"),
    ("what have I been working on lately", "converse"),
    ("log a meal, I just ate", "converse"),
    # reason
    ("why does my roller hockey club app feel slow on mobile", "reason"),
    ("explain how a pull-up resistor works", "reason"),
    ("should I use SQLite or Postgres for this", "reason"),
    ("help me plan my week around the two client deadlines", "reason"),
    ("what's a reasonable price for a club management SaaS in Portugal", "reason"),
    ("is it safe to power this servo from the Arduino 5V pin", "reason"),
    ("teach me how CSS container queries differ from media queries", "reason"),
    ("what am I doing wrong with my sleep schedule", "reason"),
    ("compare Stripe and Mollie for a European SaaS", "reason"),
    ("how should I structure the onboarding for a free trial", "reason"),
    # see
    ("look at this", "see"),
    ("what am I holding", "see"),
    ("does this shirt go with these trousers", "see"),
    ("check my wiring", "see"),
    ("here's my lunch, help me log it", "see"),
    ("read this label for me", "see"),
    ("is this resistor the right one", "see"),
    ("what's on the screen in front of me", "see"),
    # act
    ("fix the login bug in hoqueimanager", "act"),
    ("create a new branch called experiment", "act"),
    ("run the tests", "act"),
    ("add a dark mode toggle to the settings page", "act"),
    ("commit what we just changed", "act"),
    ("rename that file to cortar.py", "act"),
]


def ask(model: str, prompt: str, timeout: float = 30.0) -> tuple[str, float]:
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": prompt},
            ],
            "stream": False,
            "format": "json",
            "options": {"temperature": 0},
        }
    ).encode()

    req = urllib.request.Request(
        OLLAMA, data=body, headers={"Content-Type": "application/json"}
    )
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)
    elapsed_ms = (time.perf_counter() - start) * 1000
    return payload["message"]["content"], elapsed_ms


def warm(model: str) -> None:
    """First call loads the model. Never time that one."""
    try:
        ask(model, "warmup", timeout=180.0)
    except Exception as exc:  # noqa: BLE001
        print(f"  warmup failed: {exc}")


def bench(model: str) -> dict | None:
    print(f"\n{'=' * 62}\n  {model}\n{'=' * 62}")
    print("  warming up (first load can take a while)...")
    warm(model)

    n_cases = len(CASES)
    latencies: list[float] = []
    valid_json = 0
    correct = 0
    failures: list[str] = []

    for i, (prompt, expected) in enumerate(CASES, 1):
        try:
            raw, ms = ask(model, prompt)
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
        print("\n  no successful calls. Is `ollama serve` running?")
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

    ok = (
        result["json_pct"] >= 90
        and result["acc_pct"] >= 85
        and result["p95_ms"] < 900
    )

    print(f"\n  valid JSON     {result['json_pct']:5.1f}%   (need >= 90)")
    print(f"  lane accuracy  {result['acc_pct']:5.1f}%   (need >= 85)")
    print(f"  median         {result['median_ms']:5.0f}ms")
    print(f"  p95            {result['p95_ms']:5.0f}ms   (need < 900)")
    print(f"\n  {'PASS' if ok else 'FAIL'}")

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

    results = [r for m in models if (r := bench(m))]
    if not results:
        return 1

    print(f"\n{'=' * 62}\n  SUMMARY\n{'=' * 62}")
    print(f"  {'model':<24} {'json':>7} {'acc':>7} {'p95':>8}   verdict")
    for r in results:
        verdict = "PASS" if r["pass"] else "fail"
        print(
            f"  {r['model']:<24} {r['json_pct']:6.1f}% {r['acc_pct']:6.1f}% "
            f"{r['p95_ms']:7.0f}ms   {verdict}"
        )

    passing = [r for r in results if r["pass"]]
    print()
    if passing:
        best = max(passing, key=lambda r: (r["acc_pct"], -r["p95_ms"]))
        print(f"  Recommended `converse` model: {best['model']}")
        print("  Record this as ADR-001 in DECISIONS.md.")
    else:
        print("  Nothing cleared the bar.")
        print("  This is a valid outcome. Options, in order of preference:")
        print("    1. Try a larger model if memory allows.")
        print("    2. Route lane classification to the `reason` provider (NIM).")
        print("    3. Replace the classifier with rules + embeddings.")
        print("  Whichever you choose, record it as ADR-001.")

    with open("bench/results.json", "w") as fh:
        json.dump(results, fh, indent=2)
    print("\n  Full results written to bench/results.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
