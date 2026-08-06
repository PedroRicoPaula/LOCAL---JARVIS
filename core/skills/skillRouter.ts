/**
 * core/skills/skillRouter.ts — the real `Router` a skill sees through
 * `ctx.router` (docs/SKILLS.md § 4), wrapping Phase 3's `routeChat()`/
 * `Registry`. A skill gets a non-streaming `complete()` — it calls
 * `ctx.say()` separately for whatever the owner actually hears, so it
 * wants a plain string back here, not a chunk stream to manage itself.
 */

import type { VisionRequest, VisionResult } from "../../shared/types.ts";
import type { Registry } from "../router/registry.ts";
import { routeChat, routeVision } from "../router/router.ts";
import type { Router } from "./types.ts";

export function createSkillRouter(registry: Registry): Router {
  return {
    async complete(lane, system, userText, opts): Promise<string> {
      let text = "";
      for await (const chunk of routeChat(registry, {
        lane,
        system,
        messages: [{ role: "user", content: userText }],
        ...(opts?.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
        temperature: 0,
        timeoutMs: lane === "reason" ? 15_000 : 3000,
      })) {
        text += chunk.delta;
      }
      return text;
    },
    async see(req: VisionRequest): Promise<VisionResult> {
      return routeVision(registry, req);
    },
  };
}
