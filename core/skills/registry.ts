/**
 * core/skills/registry.ts — loads every registered skill (error-isolated,
 * docs/SKILLS.md § 1), embeds their manifest examples once, and exposes
 * `dispatch()` for the host to call per utterance.
 */

import type { SkillHealth, SkillInput } from "../../shared/types.ts";
import type { Embedder } from "../memory/embeddings.ts";
import type { Registry as RouterRegistry } from "../router/registry.ts";
import type { DispatchResult } from "./dispatch.ts";
import { dispatch } from "./dispatch.ts";
import type { ExampleEmbedding } from "./embeddingMatch.ts";
import { embedManifestExamples } from "./embeddingMatch.ts";
import { loadSkill } from "./loader.ts";
import { REGISTERED_SKILL_MODULES } from "./registered.ts";
import type { Skill, SkillContext, SkillInitContext } from "./types.ts";

export interface SkillLoadReport {
  loaded: string[];
  disabled: { id: string; error: string }[];
}

export class SkillRegistry {
  private readonly skillsById = new Map<string, Skill>();
  private exampleIndex: ExampleEmbedding[] = [];
  private health = new Map<string, SkillHealth>();

  async loadAll(
    buildInitCtx: (skillId: string) => SkillInitContext,
    embedder: Embedder,
    modulePaths: readonly string[] = REGISTERED_SKILL_MODULES,
  ): Promise<SkillLoadReport> {
    const report: SkillLoadReport = { loaded: [], disabled: [] };
    const health = new Map<string, SkillHealth>();
    for (const path of modulePaths) {
      const result = await loadSkill(path, buildInitCtx);
      if (result.status === "loaded") {
        const { id, version } = result.skill.manifest;
        this.skillsById.set(id, result.skill);
        report.loaded.push(id);
        health.set(id, { id, version, status: "loaded", loadedAt: Date.now() });
      } else {
        report.disabled.push({ id: result.id, error: result.error });
        health.set(result.id, { id: result.id, version: "unknown", status: "disabled", lastError: result.error });
      }
    }
    this.health = health;
    this.exampleIndex = await embedManifestExamples(embedder, [...this.skillsById.values()]);
    return report;
  }

  get(id: string): Skill | undefined {
    return this.skillsById.get(id);
  }

  list(): Skill[] {
    return [...this.skillsById.values()];
  }

  /** The dashboard's `/api/skills` panel — every skill the last `loadAll`
   * saw, loaded or disabled, with why. */
  listHealth(): SkillHealth[] {
    return [...this.health.values()];
  }

  async dispatch(
    embedder: Embedder,
    routerRegistry: RouterRegistry,
    utterance: string,
    sessionId: string,
    buildContext: (skillId: string, input: SkillInput) => SkillContext,
  ): Promise<DispatchResult> {
    return dispatch(
      { skillsById: this.skillsById, exampleIndex: this.exampleIndex, routerRegistry, buildContext },
      embedder,
      utterance,
      sessionId,
    );
  }
}
