/**
 * core/skills/registered.ts — the registry line docs/SKILLS.md § 8
 * describes `make new-skill` adding. An explicit list, not directory
 * scanning: a skill only goes live because someone put it here, same
 * reasoning as `core/router/wiring.ts` registering providers one at a
 * time rather than auto-discovering them.
 */

export const REGISTERED_SKILL_MODULES: readonly string[] = [
  "../../skills/wardrobe/index.ts",
  "../../skills/brief/index.ts",
  "../../skills/system_health/index.ts",
  "../../skills/weather/index.ts",
  "../../skills/tasks/index.ts",
  "../../skills/shopping_list/index.ts",
  "../../skills/launcher/index.ts",
];
