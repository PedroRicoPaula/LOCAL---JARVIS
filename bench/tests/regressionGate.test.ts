import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkGate, formatGateReport, loadBaselines, updateBaseline } from "../_shared/regressionGate.ts";

test("checkGate: no baseline on record passes on the floor alone", () => {
  const result = checkGate("brand_new_bench", 86, 85, {});

  assert.equal(result.passed, true);
  assert.equal(result.baselinePct, null);
  assert.equal(result.regressed, false);
});

test("checkGate: below the floor fails regardless of baseline", () => {
  const result = checkGate("b", 80, 85, { b: 97.8 });

  assert.equal(result.passed, false);
});

test("checkGate: within a point of baseline is not a regression", () => {
  const result = checkGate("b", 97.0, 85, { b: 97.8 });

  assert.equal(result.regressed, false);
  assert.equal(result.passed, true);
});

test("checkGate: more than a point below baseline (but still above the floor) is a regression", () => {
  const result = checkGate("b", 91.0, 85, { b: 97.8 });

  assert.equal(result.regressed, true);
  assert.equal(result.passed, false);
});

test("checkGate: clearly above baseline is flagged as an improvement, not a regression", () => {
  const result = checkGate("b", 99.5, 85, { b: 97.8 });

  assert.equal(result.improved, true);
  assert.equal(result.regressed, false);
  assert.equal(result.passed, true);
});

test("formatGateReport: a regression mentions the update_baseline command", () => {
  const result = checkGate("bench_router_lane", 91.0, 85, { bench_router_lane: 97.8 });

  const report = formatGateReport("bench_router_lane", result);

  assert.match(report, /REGRESSION/);
  assert.match(report, /update_baseline\.ts bench_router_lane 91\.0/);
  assert.match(report, /FAIL/);
});

test("loadBaselines: a missing or unreadable file degrades to an empty object, not a throw", () => {
  const baselines = loadBaselines("/nonexistent/path/baseline.json");

  assert.deepEqual(baselines, {});
});

test("updateBaseline: writes a new score, preserving other entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "jarvis-bench-test-"));
  const path = join(dir, "baseline.json");

  updateBaseline("bench_a", 90.123, path);
  updateBaseline("bench_b", 85, path);
  updateBaseline("bench_a", 92.456, path);

  const written = JSON.parse(readFileSync(path, "utf8")) as Record<string, number>;
  assert.deepEqual(written, { bench_a: 92.5, bench_b: 85 });
});
