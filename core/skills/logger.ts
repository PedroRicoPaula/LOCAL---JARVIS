/** core/skills/logger.ts — smallest thing that satisfies `Logger`
 * (`types.ts`), prefixed so skill logs are visible in the host's output. */

import type { Logger } from "./types.ts";

export function createSkillLogger(skillId: string): Logger {
  const prefix = `skill:${skillId}`;
  return {
    info(msg, meta) {
      console.log(`[${prefix}] ${msg}`, meta ?? "");
    },
    warn(msg, meta) {
      console.warn(`[${prefix}] ${msg}`, meta ?? "");
    },
    error(msg, meta) {
      console.error(`[${prefix}] ${msg}`, meta ?? "");
    },
  };
}
