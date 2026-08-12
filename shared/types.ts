/**
 * shared/types.ts — the contract.
 *
 * Single source of truth for every boundary in the system: core <-> ui,
 * core <-> senses, core <-> skills. Python models are generated from the JSON
 * Schema derived from this file (`make types`). Do not define these shapes
 * anywhere else.
 *
 * Split into shared/types/*.ts by domain, 2026-08-12 (this file had grown to
 * 573 lines, past this project's own ~300-line guideline) -- this file is
 * now a pure re-export barrel, so every existing `from "shared/types.ts"`
 * import across the repo (79 files at the time of the split) keeps working
 * completely unchanged. Add new types to the relevant domain file below, not
 * here.
 */

export * from "./types/router.ts";
export * from "./types/capability.ts";
export * from "./types/memory.ts";
export * from "./types/quantity.ts";
export * from "./types/skill.ts";
export * from "./types/camera.ts";
export * from "./types/dashboard.ts";
export * from "./types/nutrition.ts";
export * from "./types/store.ts";
export * from "./types/metrics.ts";
