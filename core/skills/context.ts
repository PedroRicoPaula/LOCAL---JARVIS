/**
 * core/skills/context.ts — builds a real `SkillContext` for one dispatch.
 * Ties together everything else in `core/skills/` plus Phase 3's router
 * and Phase 4's memory.
 */

import type { DatabaseSync } from "node:sqlite";
import type { ApprovalOutcome, ProposedAction } from "../../shared/types.ts";
import type { Gate } from "../gate/gate.ts";
import type { Memory } from "../memory/memory.ts";
import type { Registry } from "../router/registry.ts";
import { createStubCameraHandle } from "./camera.ts";
import type { Conversation } from "./types.ts";
import { stubPropose } from "./gate.ts";
import { createSkillLogger } from "./logger.ts";
import { createSkillRouter } from "./skillRouter.ts";
import { createSkillStore } from "./store.ts";
import type { SkillContext } from "./types.ts";

export interface ContextDeps {
  db: DatabaseSync;
  memory: Memory;
  routerRegistry: Registry;
  conversation: Conversation;
  /** Phase 6: when given, `ctx.propose` goes through the real approval
   * lifecycle. Omitted (tests, or before Phase 6 wiring existed) falls
   * back to `stubPropose` — an honest "the gate doesn't exist" refusal,
   * never a silent no-op. */
  gate?: Gate;
  /** Escape hatch for tests that want to script `propose()` directly
   * without a real `Gate` instance. Takes precedence over `gate` if both
   * are given. */
  propose?: (action: ProposedAction) => Promise<ApprovalOutcome>;
}

export function buildSkillContext(deps: ContextDeps, skillId: string, sessionId: string): SkillContext {
  const propose = deps.propose ?? (deps.gate ? (action: ProposedAction) => deps.gate!.propose(action, skillId) : stubPropose);

  return {
    router: createSkillRouter(deps.routerRegistry),
    memory: deps.memory,
    camera: createStubCameraHandle(),
    propose,
    say: deps.conversation.say,
    ask: deps.conversation.ask,
    store: createSkillStore(deps.db, skillId),
    sessionId,
    now: () => Date.now(),
    log: createSkillLogger(skillId),
  };
}
