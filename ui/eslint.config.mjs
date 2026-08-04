import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Same rule as the root eslint.config.js's for skills/**: the
    // dashboard talks to `core` only over HTTP/WS (ROADMAP.md's Phase 7
    // DoD: "grep confirms the dashboard has no executor import path").
    // ui/ has its own eslint config (separate npm project), so it needs
    // its own copy of this rule rather than inheriting the root one.
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/core/executors/**", "**/executors/**"],
              message: "The dashboard never imports an executor -- it only proposes decisions over WS (SPEC.md § 8).",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
