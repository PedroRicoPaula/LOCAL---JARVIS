/**
 * bench/_shared/regressionGate.ts — turns "rerun the benchmark and
 * eyeball the number" into a real gate. `bench/bench_router_lane.ts` and
 * its siblings each only ever failed against a fixed absolute floor
 * (>=85%/>=90%) -- real accuracy regressed silently *within* that floor
 * twice this project (ADR-024, ADR-026: an added few-shot example, and a
 * manifest example collision, each dropped several points without ever
 * tripping the fixed bar), caught only because someone happened to rerun
 * the benchmark and notice. `docs/BACKLOG.md`'s own "permanent benchmark
 * gate" idea, built for real.
 *
 * Compares a fresh run against the last known-good score recorded in
 * `bench/baseline.json`, not just the floor. A real drop past
 * `REGRESSION_TOLERANCE_PCT` fails the gate even while still clearing
 * the floor. Deliberately does NOT auto-update the baseline on
 * improvement -- see `updateBaseline()`'s own docstring for why.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "baseline.json");

/** A run-to-run wobble this small isn't worth failing the gate over --
 * embedding scores are deterministic (confirmed live, 2026-08-07: 5
 * repeated calls on identical input scored 1.000000 every time), but the
 * LLM-backed disambiguation step some cases fall through to is not, so a
 * benchmark that exercises it can wobble a point or two run to run for
 * reasons that aren't a code regression (see `bench_skill_routing.ts`'s
 * own docstring, and ADR-038/040, for the documented cause). */
export const REGRESSION_TOLERANCE_PCT = 1.0;

export interface GateResult {
  passed: boolean;
  accPct: number;
  floorPct: number;
  baselinePct: number | null;
  regressed: boolean;
  improved: boolean;
}

export function loadBaselines(path: string = DEFAULT_BASELINE_PATH): Record<string, number> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

/** `baselines[benchName]` missing (a brand new benchmark with nothing on
 * record yet) means nothing to regress against -- passes on the floor
 * alone, same as before this gate existed. */
export function checkGate(benchName: string, accPct: number, floorPct: number, baselines: Record<string, number>): GateResult {
  const baselinePct = baselines[benchName] ?? null;
  const passedFloor = accPct >= floorPct;
  const regressed = baselinePct !== null && accPct < baselinePct - REGRESSION_TOLERANCE_PCT;
  const improved = baselinePct !== null && accPct > baselinePct + REGRESSION_TOLERANCE_PCT;
  return { passed: passedFloor && !regressed, accPct, floorPct, baselinePct, regressed, improved };
}

export function formatGateReport(benchName: string, result: GateResult): string {
  const lines: string[] = [];
  if (result.baselinePct !== null) {
    lines.push(`  baseline: ${result.baselinePct.toFixed(1)}%   this run: ${result.accPct.toFixed(1)}%`);
  }
  if (result.regressed) {
    lines.push(`  REGRESSION: dropped more than ${REGRESSION_TOLERANCE_PCT}pt below the recorded baseline for "${benchName}".`);
    lines.push(`  If this drop is real and expected (not a bug), update the baseline deliberately:`);
    lines.push(`    node bench/update_baseline.ts ${benchName} ${result.accPct.toFixed(1)}`);
  } else if (result.improved) {
    lines.push(`  Improved beyond the recorded baseline -- consider recording it:`);
    lines.push(`    node bench/update_baseline.ts ${benchName} ${result.accPct.toFixed(1)}`);
  }
  lines.push(`  ${result.passed ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

/** Deliberately a separate, explicit CLI step (`bench/update_baseline.ts`)
 * rather than something a bench script calls on its own success --
 * auto-updating on every improved run would let a *regression that still
 * clears the floor* quietly become tomorrow's new "normal" the next time
 * it happens to also be the best run of the day. Recording a new
 * baseline should be a deliberate human decision, same reasoning as
 * `docs/BACKLOG.md`'s own MCP-tiering entries about never letting a
 * model (or a script) make a trust decision no one actually reviewed. */
export function updateBaseline(benchName: string, accPct: number, path: string = DEFAULT_BASELINE_PATH): void {
  const baselines = loadBaselines(path);
  baselines[benchName] = Math.round(accPct * 10) / 10;
  writeFileSync(path, JSON.stringify(baselines, null, 2) + "\n");
}
