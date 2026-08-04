/**
 * core/systemMetrics.ts — real CPU/memory/disk numbers, read directly from
 * the OS (`node:os`, `node:fs`'s `statfsSync`). Shared by `skills/
 * system-health` (so "how's my computer doing" answers with the same
 * numbers) and `core/http.ts`'s `/api/system` (the dashboard's telemetry
 * panel) — one source, not two things that could drift apart.
 *
 * No fake/injection seam: `os`/`fs` stat calls are local OS access, not a
 * network or model dependency (CLAUDE.md § 3's "every module that talks
 * to the outside world gets a fake" is about external systems -- this is
 * closer to `Date.now()`), same precedent as `core/router/keychain.ts`'s
 * real-but-untested Keychain I/O.
 */

import { statfsSync } from "node:fs";
import os from "node:os";

export interface SystemMetrics {
  cpuLoadPct: number;
  memUsedGB: number;
  memTotalGB: number;
  memUsedPct: number;
  diskUsedGB: number;
  diskTotalGB: number;
  diskFreePct: number;
  uptimeSec: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function getSystemMetrics(diskPath = "/"): SystemMetrics {
  const cpuCount = os.cpus().length || 1;
  const load1 = os.loadavg()[0] ?? 0;
  const cpuLoadPct = Math.min(100, Math.round((load1 / cpuCount) * 100));

  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;

  const stat = statfsSync(diskPath);
  const diskTotal = stat.blocks * stat.bsize;
  const diskFree = stat.bfree * stat.bsize;
  const diskUsed = diskTotal - diskFree;

  const GB = 1024 ** 3;
  return {
    cpuLoadPct,
    memUsedGB: round1(memUsed / GB),
    memTotalGB: round1(memTotal / GB),
    memUsedPct: Math.round((memUsed / memTotal) * 100),
    diskUsedGB: round1(diskUsed / GB),
    diskTotalGB: round1(diskTotal / GB),
    diskFreePct: Math.round((diskFree / diskTotal) * 100),
    uptimeSec: Math.round(os.uptime()),
  };
}
