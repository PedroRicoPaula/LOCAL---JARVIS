/**
 * core/skills/tests/eslintRule.test.ts — proves ROADMAP.md Phase 5's DoD
 * line "a skill importing an executor fails make check" is a real,
 * continuously-verified guarantee, not a one-off manual check. Shells out
 * to the real `eslint` binary against a deliberately bad fixture
 * (`skills/__fixtures__/bad_executor_import/`) that `make check`'s own
 * eslint invocation excludes on purpose — this test is what actually
 * exercises it.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("ESLint rejects a skill importing from core/executors/", async () => {
  await assert.rejects(
    execFileAsync("npx", ["eslint", "skills/__fixtures__/bad_executor_import/index.ts"]),
    (err: unknown) => {
      const stdout = (err as { stdout?: string }).stdout ?? "";
      assert.match(stdout, /no-restricted-imports/);
      assert.match(stdout, /cannot import an executor/);
      return true;
    },
  );
});

test("ESLint accepts the real brief skill (no restricted imports)", async () => {
  await execFileAsync("npx", ["eslint", "skills/brief/index.ts"]); // rejects (throws) on any lint error
});
