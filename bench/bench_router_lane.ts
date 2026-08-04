/**
 * bench/bench_router_lane.ts — Phase 3 DoD: "Lane classification ≥ 85% on
 * the benchmark." Unlike Phase 0's `bench_nim_lane.py` (which measured the
 * raw model), this runs the actual `classifyLane()` through the real,
 * wired `Registry` — proving the router itself, prompt fix (DECISIONS.md
 * ADR-001's camera-phrase addition) included, not just the underlying
 * model in isolation.
 *
 * The 45-case set is `bench/bench_local.py`'s `CASES`, copied rather than
 * imported (no Python<->TS import path exists) — that file stays the
 * historical Phase 0 record and is not re-run; this is the current source
 * of truth for what the *router* is graded against. Keep the two in sync
 * by hand if either changes; noted here rather than silently drifting.
 *
 * Paced at 1 call / 2s (30 rpm) to match `NimProvider`'s own bucket — if
 * this script called faster than that, its own bucket would empty mid-run
 * and later cases would silently take the `ollama` fallback path instead
 * of measuring `nim`, understating what's actually being graded.
 *
 * Usage: node bench/bench_router_lane.ts
 */

import { classifyLane } from "../core/router/laneClassifier.ts";
import { buildRegistry } from "../core/router/wiring.ts";

const PACE_MS = 2000;

const CASES: readonly [string, string][] = [
  // reflex
  ["stop", "reflex"],
  ["cancel that", "reflex"],
  ["what time is it", "reflex"],
  ["say that again", "reflex"],
  ["never mind", "reflex"],
  ["louder", "reflex"],
  ["are you there", "reflex"],
  ["pause", "reflex"],
  ["turn on the camera", "reflex"],
  ["close the camera", "reflex"],
  ["open your eyes", "reflex"],
  ["that's all", "reflex"],
  // converse
  ["good morning", "converse"],
  ["what did I ask you yesterday", "converse"],
  ["how many meals did I log this week", "converse"],
  ["remind me what we decided about the database", "converse"],
  ["what's on my list", "converse"],
  ["summarise what you just told me", "converse"],
  ["thanks, that was helpful", "converse"],
  ["what have I been working on lately", "converse"],
  ["log a meal, I just ate", "converse"],
  // reason
  ["why does my roller hockey club app feel slow on mobile", "reason"],
  ["explain how a pull-up resistor works", "reason"],
  ["should I use SQLite or Postgres for this", "reason"],
  ["help me plan my week around the two client deadlines", "reason"],
  ["what's a reasonable price for a club management SaaS in Portugal", "reason"],
  ["is it safe to power this servo from the Arduino 5V pin", "reason"],
  ["teach me how CSS container queries differ from media queries", "reason"],
  ["what am I doing wrong with my sleep schedule", "reason"],
  ["compare Stripe and Mollie for a European SaaS", "reason"],
  ["how should I structure the onboarding for a free trial", "reason"],
  // see
  ["look at this", "see"],
  ["what am I holding", "see"],
  ["does this shirt go with these trousers", "see"],
  ["check my wiring", "see"],
  ["here's my lunch, help me log it", "see"],
  ["read this label for me", "see"],
  ["is this resistor the right one", "see"],
  ["what's on the screen in front of me", "see"],
  // act
  ["fix the login bug in hoqueimanager", "act"],
  ["create a new branch called experiment", "act"],
  ["run the tests", "act"],
  ["add a dark mode toggle to the settings page", "act"],
  ["commit what we just changed", "act"],
  ["rename that file to cortar.py", "act"],
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<number> {
  const registry = await buildRegistry();

  let correct = 0;
  const failures: string[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const [prompt, expected] = CASES[i]!;
    if (i > 0) await sleep(PACE_MS);

    const start = performance.now();
    try {
      const result = await classifyLane(registry, prompt);
      const ms = performance.now() - start;
      if (result.lane === expected) {
        correct += 1;
        console.log(`  [${String(i + 1).padStart(2)}/${CASES.length}] ${ms.toFixed(0).padStart(6)}ms  ok   ${result.lane}`);
      } else {
        failures.push(`${JSON.stringify(prompt)}: expected ${expected}, got ${result.lane}`);
        console.log(
          `  [${String(i + 1).padStart(2)}/${CASES.length}] ${ms.toFixed(0).padStart(6)}ms  MISS ${result.lane} (want ${expected})`,
        );
      }
    } catch (err) {
      failures.push(`${JSON.stringify(prompt)}: ${String(err)}`);
      console.log(`  [${String(i + 1).padStart(2)}/${CASES.length}] ERROR ${String(err)}`);
    }
  }

  const accPct = (100 * correct) / CASES.length;
  console.log(`\n  lane accuracy  ${accPct.toFixed(1)}%   (need >= 85)`);
  console.log(`\n  ${accPct >= 85 ? "PASS" : "FAIL"}`);

  if (failures.length > 0) {
    console.log(`\n  failures (${failures.length}):`);
    for (const f of failures.slice(0, 12)) console.log(`    - ${f}`);
    if (failures.length > 12) console.log(`    ... and ${failures.length - 12} more`);
  }

  return accPct >= 85 ? 0 : 1;
}

main().then((code) => process.exit(code));
