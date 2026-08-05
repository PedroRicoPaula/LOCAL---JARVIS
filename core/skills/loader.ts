/**
 * core/skills/loader.ts — manifest schema validation + skill loading with
 * error isolation (docs/SKILLS.md § 1: "A skill that throws on load is
 * disabled and reported, never fatal to core").
 *
 * Validation is hand-rolled, not a schema library (zod et al.) — the
 * shape is small and fixed (`SkillManifest` in `shared/types.ts`), and one
 * more dependency isn't worth it for something this size (CLAUDE.md § 3).
 */

import type { Capability, Lane, SkillManifest } from "../../shared/types.ts";
import type { Skill, SkillInitContext } from "./types.ts";

// `Record<Lane/Capability, true>` rather than a plain array literal --
// found live (2026-08-06, ADR-035): adding `MCP_TOOL_CALL` to
// `shared/types.ts`'s `Capability` union alone wasn't enough, this list
// silently fell out of sync and disabled a real skill at load time with
// no compile error. A `Record` keyed by the full union forces
// TypeScript to reject a build the moment the two drift again --
// missing a key here is now a type error, not a runtime mystery.
const VALID_LANES_SET: Record<Lane, true> = {
  reflex: true,
  converse: true,
  reason: true,
  see: true,
  act: true,
};
const VALID_LANES: readonly Lane[] = Object.keys(VALID_LANES_SET) as Lane[];

const VALID_CAPABILITIES_SET: Record<Capability, true> = {
  MEMORY_READ: true,
  FS_READ: true,
  CAMERA: true,
  NET_READ: true,
  MEMORY_WRITE: true,
  FS_WRITE: true,
  GIT_WRITE: true,
  SHELL_EXEC: true,
  WEBHOOK: true,
  MCP_TOOL_CALL: true,
};
const VALID_CAPABILITIES: readonly Capability[] = Object.keys(VALID_CAPABILITIES_SET) as Capability[];

export interface ManifestValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateManifest(value: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const m = value as Partial<SkillManifest> | null | undefined;

  if (m === null || typeof m !== "object") {
    return { ok: false, errors: ["manifest is not an object"] };
  }
  if (typeof m.id !== "string" || m.id.trim() === "") errors.push('"id" must be a non-empty string');
  if (typeof m.version !== "string" || m.version.trim() === "") errors.push('"version" must be a non-empty string');
  if (typeof m.description !== "string" || m.description.trim() === "") {
    errors.push('"description" must be a non-empty string');
  }

  if (!Array.isArray(m.intents) || m.intents.length === 0) {
    errors.push('"intents" must be a non-empty array');
  } else {
    m.intents.forEach((intent, i) => {
      if (typeof intent.id !== "string" || intent.id.trim() === "") {
        errors.push(`intents[${i}].id must be a non-empty string`);
      }
      if (typeof intent.description !== "string" || intent.description.trim() === "") {
        errors.push(`intents[${i}].description must be a non-empty string`);
      }
      if (!Array.isArray(intent.examples) || intent.examples.length === 0) {
        errors.push(`intents[${i}].examples must be a non-empty array`);
      } else if (intent.examples.some((e) => typeof e !== "string" || e.trim() === "")) {
        errors.push(`intents[${i}].examples must all be non-empty strings`);
      }
      if (!Array.isArray(intent.lanes) || intent.lanes.length === 0) {
        errors.push(`intents[${i}].lanes must be a non-empty array`);
      } else if (intent.lanes.some((l) => !VALID_LANES.includes(l))) {
        errors.push(`intents[${i}].lanes contains an unknown lane`);
      }
    });
  }

  if (!Array.isArray(m.capabilities)) {
    errors.push('"capabilities" must be an array');
  } else if (m.capabilities.some((c) => !VALID_CAPABILITIES.includes(c))) {
    errors.push('"capabilities" contains an unknown capability');
  }

  if (m.sensitivity !== undefined && m.sensitivity !== "normal" && m.sensitivity !== "personal") {
    errors.push('"sensitivity" must be "normal" or "personal" if present');
  }

  return { ok: errors.length === 0, errors };
}

export type SkillLoadResult =
  | { status: "loaded"; skill: Skill }
  | { status: "disabled"; id: string; error: string };

/** Imports `modulePath`, validates its exported `skill.manifest`, and runs
 * `skill.init()` if present. Any failure at any of those steps — a syntax
 * error, a bad manifest, a throwing `init()` — disables just this skill
 * and reports why, never propagating up to take down the host. */
/**
 * `buildInitCtx` is a factory, not a fixed `SkillInitContext` — a skill's
 * own id (and therefore its `ctx.store` namespace, `skill_<id>_*`) isn't
 * known until *after* its module is imported, a few lines below. A single
 * shared `ctx` object couldn't give every skill its own store; this is
 * why `init()` calling `ctx.store` always failed with "Cannot read
 * properties of undefined" until this factory replaced it — found live,
 * loading the real skill registry, not caught by any existing test
 * because no skill used `ctx.store` in `init()` before `tasks`/
 * `shopping_list`.
 */
export async function loadSkill(modulePath: string, buildInitCtx: (skillId: string) => SkillInitContext): Promise<SkillLoadResult> {
  // Tracked outside the try block so a failure *after* the manifest is
  // known (e.g. a throwing init()) still reports the real skill id in the
  // disabled report, not just the module path — found live: an init()
  // failure was reported with the file path instead of the id, which is
  // the whole point of the report ("which skill failed?") gone missing
  // exactly when it's most useful (a broken skill, not a load-time typo).
  let resolvedId = modulePath;
  try {
    const mod = (await import(modulePath)) as { skill?: Skill };
    if (!mod.skill) {
      return { status: "disabled", id: resolvedId, error: `module has no "skill" export` };
    }
    const skill = mod.skill;
    resolvedId = skill.manifest?.id ?? modulePath;

    const validation = validateManifest(skill.manifest);
    if (!validation.ok) {
      return { status: "disabled", id: resolvedId, error: `invalid manifest: ${validation.errors.join("; ")}` };
    }

    if (skill.init) {
      await skill.init(buildInitCtx(resolvedId));
    }

    return { status: "loaded", skill };
  } catch (cause) {
    return { status: "disabled", id: resolvedId, error: String(cause instanceof Error ? cause.message : cause) };
  }
}
