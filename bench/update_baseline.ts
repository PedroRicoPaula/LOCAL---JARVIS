/**
 * bench/update_baseline.ts — the one deliberate, explicit way to record a
 * new baseline score in `bench/baseline.json`, after confirming a real
 * improvement (or an accepted, understood drop) rather than letting
 * `bench/_shared/regressionGate.ts` auto-update on its own -- see that
 * module's `updateBaseline()` docstring for why that's deliberate.
 *
 * Usage: node bench/update_baseline.ts <bench-name> <score>
 *   e.g. node bench/update_baseline.ts bench_router_lane 97.8
 */

import { updateBaseline } from "./_shared/regressionGate.ts";

const [benchName, scoreArg] = process.argv.slice(2);

if (!benchName || scoreArg === undefined) {
  console.error("Usage: node bench/update_baseline.ts <bench-name> <score>");
  process.exit(1);
}

const score = Number(scoreArg);
if (!Number.isFinite(score)) {
  console.error(`"${scoreArg}" isn't a number.`);
  process.exit(1);
}

updateBaseline(benchName, score);
console.log(`bench/baseline.json: "${benchName}" -> ${score.toFixed(1)}`);
