/**
 * skills/system_health/index.ts — real numbers only, straight from
 * `core/systemMetrics.ts`. No capability gate needed: a read-only local
 * OS stat call has no side effect to approve.
 */

import type { Skill } from "../../core/skills/types.ts";
import { getSystemMetrics } from "../../core/systemMetrics.ts";
import { manifest } from "./manifest.ts";

function speakMetrics(m: ReturnType<typeof getSystemMetrics>): string {
  const parts = [
    `CPU load is ${m.cpuLoadPct} percent`,
    `memory is at ${m.memUsedPct} percent, ${m.memUsedGB} of ${m.memTotalGB} gigabytes`,
    `disk has ${m.diskFreePct} percent free`,
  ];
  return `${parts.join("; ")}.`;
}

export const skill: Skill = {
  manifest,

  async handle(_input, ctx): Promise<{ speech: string; display: unknown }> {
    const metrics = getSystemMetrics();
    const speech = speakMetrics(metrics);
    ctx.say(speech);
    return { speech, display: metrics };
  },
};
