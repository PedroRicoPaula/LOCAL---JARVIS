/**
 * core/converse.ts — the reply path docs/SKILLS.md § 3's routing diagram
 * names but never implements: "if nothing matches -> general conversation,
 * no skill." Without this, `no_skill_matched` was a dead end — the owner
 * would say something no skill's manifest covers and hear nothing back at
 * all. Grounded in real recalled memory (SPEC.md § 4's recall policy),
 * voiced through `core/persona.md`, same as any skill's spoken output.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Memory } from "./memory/memory.ts";
import type { Registry } from "./router/registry.ts";
import { createSkillRouter } from "./skills/skillRouter.ts";

const PERSONA_PATH = fileURLToPath(new URL("./persona.md", import.meta.url));

let cachedPersona: string | null = null;
function loadPersona(): string {
  cachedPersona ??= readFileSync(PERSONA_PATH, "utf8");
  return cachedPersona;
}

export async function generalConversationReply(
  routerRegistry: Registry,
  memory: Memory,
  utterance: string,
  sessionId: string,
  loadedSkillIds: readonly string[],
): Promise<string> {
  const recalled = await memory.recall({ sessionId, queryText: utterance });
  const capabilities =
    loadedSkillIds.length > 0
      ? `Skills actually loaded right now: ${loadedSkillIds.join(", ")}. Nothing else.`
      : "No skills are loaded right now.";
  const system = `${loadPersona()}\n\n---\n\n${capabilities}\n\n---\n\nRelevant memory (may be empty):\n${recalled.text || "(nothing relevant)"}`;

  const router = createSkillRouter(routerRegistry);
  const reply = await router.complete("converse", system, utterance);
  return reply.trim() || "I'm not sure how to help with that.";
}
