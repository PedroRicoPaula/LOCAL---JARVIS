/**
 * skills/__fixtures__/bad_executor_import/index.ts — deliberately invalid.
 * Not a real skill (not in core/skills/registered.ts) — exists only so
 * `make check`'s ESLint step has something to catch, proving "a skill
 * importing an executor fails make check" (ROADMAP.md Phase 5 DoD) is a
 * real, tested guarantee and not just a claim.
 */

// @ts-expect-error -- core/executors/ has no real exports yet (Phase 6);
// this import exists only to trigger the no-restricted-imports rule.
import { runSomething } from "../../../core/executors/fake.ts";

export function usesExecutor(): unknown {
  return runSomething();
}
