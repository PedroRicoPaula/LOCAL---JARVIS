// eslint.config.js — flat config (ESLint 9+). One rule for now:
// docs/SKILLS.md § 1 / CLAUDE.md § 5b: "A skill cannot import an executor.
// Enforced by ESLint, not convention." Executors don't exist as real code
// yet (Phase 6) — this establishes the convention (core/executors/) and
// the enforcement ahead of it, so Phase 6 has a guardrail from its first
// commit rather than retrofitting one later.

import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["skills/**/*.ts"],
    ignores: ["skills/**/*.test.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: "module" },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/executors/**", "**/executors/**"],
              message:
                "A skill cannot import an executor (CLAUDE.md § 5b, docs/SKILLS.md § 1). " +
                "Use ctx.propose() instead — the gate is the only path to a side effect.",
            },
          ],
        },
      ],
    },
  },
];
