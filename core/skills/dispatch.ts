/**
 * core/skills/dispatch.ts — orchestrates docs/SKILLS.md § 3's full two-stage
 * routing: lane classifier (Phase 3) → embedding match → disambiguation →
 * `skill.handle()`. Thresholds live here as named constants, not buried in
 * logic — "tune them during SOAK with real data" (docs/SKILLS.md § 3).
 */

import type { SkillInput, SkillResult, SkillRoutingTrace } from "../../shared/types.ts";
import type { Embedder } from "../memory/embeddings.ts";
import { classifyLane } from "../router/laneClassifier.ts";
import type { Registry } from "../router/registry.ts";
import { routeChat } from "../router/router.ts";
import type { ExampleEmbedding, MatchCandidate } from "./embeddingMatch.ts";
import { matchUtterance } from "./embeddingMatch.ts";
import type { Skill, SkillContext } from "./types.ts";

/** Above this score, an intent is a real candidate at all. Below it,
 * nothing matched — general conversation, no skill. */
export const CANDIDATE_FLOOR = 0.5;
/** Above this score, and clear of the runner-up by DISPATCH_MARGIN,
 * dispatch immediately with no model call. */
export const DISPATCH_SCORE = 0.72;
export const DISPATCH_MARGIN = 0.08;
/** How many top candidates the disambiguation call sees. */
export const DISAMBIGUATION_SHORTLIST = 3;

const DISAMBIGUATION_SYSTEM = `You choose which intent best matches what the user said, from a short list.
Respond with JSON only. No prose, no markdown fences.
Schema: {"choice": "<skillId>.<intentId>" or "none"}
Pick "none" if nothing in the list actually matches what was said.`;

export type DispatchOutcome =
  | { outcome: "dispatched"; result: SkillResult }
  | { outcome: "no_skill_matched" };

export interface DispatchDeps {
  skillsById: ReadonlyMap<string, Skill>;
  exampleIndex: readonly ExampleEmbedding[];
  routerRegistry: Registry;
  buildContext: (skillId: string, input: SkillInput) => SkillContext;
}

function formatCandidates(candidates: readonly MatchCandidate[], skillsById: ReadonlyMap<string, Skill>): string {
  return candidates
    .map((c) => {
      const intent = skillsById.get(c.skillId)?.manifest.intents.find((i) => i.id === c.intentId);
      return `- ${c.skillId}.${c.intentId}: ${intent?.description ?? ""}`;
    })
    .join("\n");
}

async function disambiguate(
  routerRegistry: Registry,
  utterance: string,
  shortlist: readonly MatchCandidate[],
  skillsById: ReadonlyMap<string, Skill>,
): Promise<{ skillId: string; intentId: string } | null> {
  let text = "";
  for await (const chunk of routeChat(routerRegistry, {
    lane: "converse",
    system: DISAMBIGUATION_SYSTEM,
    messages: [
      { role: "user", content: `Said: "${utterance}"\n\nCandidates:\n${formatCandidates(shortlist, skillsById)}` },
    ],
    jsonSchema: { type: "object" },
    maxTokens: 40,
    temperature: 0,
    timeoutMs: 3000,
  })) {
    text += chunk.delta;
  }

  try {
    const parsed = JSON.parse(text) as { choice?: string };
    if (!parsed.choice || parsed.choice === "none") return null;
    const [skillId, intentId] = parsed.choice.split(".");
    if (!skillId || !intentId) return null;
    if (!shortlist.some((c) => c.skillId === skillId && c.intentId === intentId)) return null;
    return { skillId, intentId };
  } catch {
    return null;
  }
}

export interface DispatchResult {
  outcome: DispatchOutcome;
  trace: SkillRoutingTrace;
}

export async function dispatch(
  deps: DispatchDeps,
  embedder: Embedder,
  utterance: string,
  sessionId: string,
): Promise<DispatchResult> {
  const { lane } = await classifyLane(deps.routerRegistry, utterance);

  const candidates = await matchUtterance(embedder, utterance, deps.exampleIndex);
  const laneFiltered = candidates.filter((c) => {
    const intent = deps.skillsById.get(c.skillId)?.manifest.intents.find((i) => i.id === c.intentId);
    return intent?.lanes.includes(lane) ?? false;
  });

  const trace: SkillRoutingTrace = {
    utterance,
    lane,
    candidates: laneFiltered.map((c) => ({ skillId: c.skillId, intentId: c.intentId, score: c.score })),
    disambiguated: false,
  };

  const [top, runnerUp] = laneFiltered;
  if (!top || top.score < CANDIDATE_FLOOR) {
    return { outcome: { outcome: "no_skill_matched" }, trace };
  }

  let chosen: { skillId: string; intentId: string } | null = null;
  if (top.score >= DISPATCH_SCORE && (runnerUp === undefined || top.score - runnerUp.score >= DISPATCH_MARGIN)) {
    chosen = { skillId: top.skillId, intentId: top.intentId };
  } else {
    const shortlist = laneFiltered.slice(0, DISAMBIGUATION_SHORTLIST);
    chosen = await disambiguate(deps.routerRegistry, utterance, shortlist, deps.skillsById);
    trace.disambiguated = true;
  }

  if (!chosen) {
    return { outcome: { outcome: "no_skill_matched" }, trace };
  }
  trace.chosen = chosen;

  const skill = deps.skillsById.get(chosen.skillId);
  if (!skill) {
    return { outcome: { outcome: "no_skill_matched" }, trace };
  }

  const input: SkillInput = { utterance, intent: chosen.intentId, sessionId };
  const ctx = deps.buildContext(chosen.skillId, input);
  const result = await skill.handle(input, ctx);
  return { outcome: { outcome: "dispatched", result }, trace };
}
