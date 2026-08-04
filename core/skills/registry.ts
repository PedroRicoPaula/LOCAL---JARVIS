/**
 * core/skills/registry.ts — loads every registered skill (error-isolated,
 * docs/SKILLS.md § 1), embeds their manifest examples once, and exposes
 * `dispatch()` for the host to call per utterance.
 */

import type { SkillInput } from "../../shared/types.ts";
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

  async loadAll(
    initCtx: SkillInitContext,
    embedder: Embedder,
    modulePaths: readonly string[] = REGISTERED_SKILL_MODULES,
  ): Promise<SkillLoadReport> {
    const report: SkillLoadReport = { loaded: [], disabled: [] };
    for (const path of modulePaths) {
      const result = await loadSkill(path, initCtx);
      if (result.status === "loaded") {
        this.skillsById.set(result.skill.manifest.id, result.skill);
        report.loaded.push(result.skill.manifest.id);
      } else {
        report.disabled.push({ id: result.id, error: result.error });
      }
    }
    this.exampleIndex = await embedManifestExamples(embedder, [...this.skillsById.values()]);
    return report;
  }

  get(id: string): Skill | undefined {
    return this.skillsById.get(id);
  }

  list(): Skill[] {
    return [...this.skillsById.values()];
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
