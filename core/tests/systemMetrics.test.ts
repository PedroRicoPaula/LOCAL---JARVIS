import assert from "node:assert/strict";
import { test } from "node:test";
import { getSystemMetrics } from "../systemMetrics.ts";

test("returns real, sane-ranged numbers -- a real OS call, not mocked (CLAUDE.md § 3 precedent: keychain.ts)", () => {
  const m = getSystemMetrics();

  assert.ok(m.cpuLoadPct >= 0 && m.cpuLoadPct <= 100, `cpuLoadPct out of range: ${m.cpuLoadPct}`);
  assert.ok(m.memUsedGB > 0);
  assert.ok(m.memTotalGB >= m.memUsedGB);
  assert.ok(m.memUsedPct >= 0 && m.memUsedPct <= 100);
  assert.ok(m.diskTotalGB > 0);
  assert.ok(m.diskUsedGB >= 0 && m.diskUsedGB <= m.diskTotalGB + 1); // +1 for rounding slop
  assert.ok(m.diskFreePct >= 0 && m.diskFreePct <= 100);
  assert.ok(m.uptimeSec > 0);
});
