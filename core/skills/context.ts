/**
 * core/skills/context.ts — builds a real `SkillContext` for one dispatch.
 * Ties together everything else in `core/skills/` plus Phase 3's router
 * and Phase 4's memory.
 */

import type { DatabaseSync } from "node:sqlite";
import type { ApprovalOutcome, ProposedAction } from "../../shared/types.ts";
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
  propose?: (action: ProposedAction) => Promise<ApprovalOutcome>;
}

export function buildSkillContext(deps: ContextDeps, skillId: string, sessionId: string): SkillContext {
  return {
    router: createSkillRouter(deps.routerRegistry),
    memory: deps.memory,
    camera: createStubCameraHandle(),
    propose: deps.propose ?? stubPropose,
    say: deps.conversation.say,
    ask: deps.conversation.ask,
    store: createSkillStore(deps.db, skillId),
    sessionId,
    now: () => Date.now(),
    log: createSkillLogger(skillId),
  };
}
